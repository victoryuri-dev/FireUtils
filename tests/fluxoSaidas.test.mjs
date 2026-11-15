import { test, after } from 'node:test'
import assert from 'node:assert/strict'

// O contexto importa o cliente do Supabase, que exige as variáveis de
// ambiente só pra instanciar — nenhum teste aqui faz chamada de rede.
process.env.VITE_SUPABASE_URL ??= 'http://localhost'
process.env.VITE_SUPABASE_ANON_KEY ??= 'teste'

const { servidorComNormas } = await import('./helpers/normasDeTeste.mjs')
const server = await servidorComNormas()
after(() => server.close())
const calc = await server.ssrLoadModule('/src/data/se_calc.js')
const fluxo = await server.ssrLoadModule('/src/data/se_fluxo.js')
const { reducer } = await server.ssrLoadModule('/src/context/ProjetoContext.jsx')

const pavBase = (extra = {}) => ({
  id: 'p1', pisoDescarga: true,
  ambientes: [],
  acessos: [
    { id: 's1', nome: 'Saída 01', tipo: 'saida', alimentaEm: null },
    { id: 'a1', nome: 'Acesso 1', tipo: 'acesso', alimentaEm: 's1' },
  ],
  grupos: [], fluxoPos: {},
  ...extra,
})
const amb = (id, grupoId = null) => ({ id, nome: id, divisao: 'C-1', area: '100', grupoId, acessoId: null })
const estado = pav => ({ pavimentos: [pav], estruturas: [] })
const pavDe = s => s.pavimentos[0]

test('raízes: saída e escada contam; acesso solto não', () => {
  const acessos = [
    { id: 's1', tipo: 'saida', alimentaEm: null },
    { id: 'e1', tipo: 'escada', alimentaEm: null },
    { id: 'a1', tipo: 'acesso', alimentaEm: null },
    { id: 'a2', tipo: 'acesso', alimentaEm: 's1' },
  ]
  assert.equal(calc.contarSaidasPavimento(acessos), 2)
  assert.deepEqual(calc.raizesDoPavimento(acessos).map(a => a.id), ['s1', 'e1'])
})

test('tipo e dimensionamento padrão vêm do tipo do nó (escolhido por nó)', () => {
  assert.deepEqual(calc.dimsPadrao('escada'), { AD: false, ER: true, PT: true })
  assert.deepEqual(calc.dimsPadrao('saida'), { AD: true, ER: false, PT: true })
  // Nó antigo, sem `tipo`: raiz depende do piso de descarga, o resto é acesso.
  assert.equal(calc.tipoNo({ alimentaEm: null }, true), 'saida')
  assert.equal(calc.tipoNo({ alimentaEm: null }, false), 'escada')
  assert.equal(calc.tipoNo({ alimentaEm: 'x' }, true), 'acesso')
  assert.equal(calc.tipoNo({ tipo: 'escada', alimentaEm: null }, true), 'escada')
})

test('migração: pavimento antigo vira grupos por acesso, com tipo e posições', () => {
  const antigo = {
    id: 'p1', pisoDescarga: false,
    ambientes: [
      { id: 'x1', nome: 'Sala', acessoId: 'a1' },
      { id: 'x2', nome: 'Hall', acessoId: 'a1' },
      { id: 'x3', nome: 'Solto', acessoId: null },
    ],
    acessos: [{ id: 'r1', nome: 'Escada', alimentaEm: null }, { id: 'a1', nome: 'Acesso 1', alimentaEm: 'r1' }],
  }
  const p = fluxo.migrarFluxoPavimento(antigo)
  assert.deepEqual(p.acessos.map(a => a.tipo), ['escada', 'acesso'])
  assert.equal(p.grupos.length, 1)
  assert.equal(p.grupos[0].acessoId, 'a1')
  assert.equal(p.grupos[0].nome, 'Grupo 1')
  assert.equal(fluxo.proximoNomeGrupo([{ nome: 'Grupo 1' }, { nome: 'Grupo 2' }]), 'Grupo 3')
  assert.equal(fluxo.proximoNomeGrupo([{ nome: 'Grupo 2' }]), 'Grupo 1')
  assert.equal(fluxo.proximoNomeGrupo([]), 'Grupo 1')
  assert.deepEqual(p.ambientes.map(a => [a.grupoId, a.acessoId]), [['grp-mig-a1', 'a1'], ['grp-mig-a1', 'a1'], [null, null]])
  for (const id of ['r1', 'a1', 'grp-mig-a1']) assert.ok(p.fluxoPos[id], `posição de ${id}`)
  // Da esquerda pra direita: grupo -> acesso -> saída.
  assert.ok(p.fluxoPos['grp-mig-a1'].x < p.fluxoPos.a1.x && p.fluxoPos.a1.x < p.fluxoPos.r1.x)
  // Idempotente.
  assert.deepEqual(fluxo.migrarFluxoPavimento(p), p)
})

test('ciclo: ligar um acesso ao próprio descendente é rejeitado', () => {
  const acessos = [
    { id: 's1', alimentaEm: null }, { id: 'a1', alimentaEm: 's1' }, { id: 'a2', alimentaEm: 'a1' },
  ]
  assert.equal(fluxo.criaCicloNoFluxo(acessos, 'a1', 'a2'), true)
  assert.equal(fluxo.criaCicloNoFluxo(acessos, 'a1', 'a1'), true)
  assert.equal(fluxo.criaCicloNoFluxo(acessos, 'a2', 's1'), false)
})

test('ligar um grupo a um acesso propaga acessoId pros ambientes dentro dele', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Grupo', acessoId: null }], ambientes: [amb('m1', 'g1'), amb('m2')] }))
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: 'a1' })
  assert.deepEqual(pavDe(s).ambientes.map(a => a.acessoId), ['a1', null])
  // Mover ambiente solto pra dentro do grupo herda a ligação; tirar do grupo solta.
  s = reducer(s, { type: 'MOVER_AMBIENTES_GRUPO', pavimentoId: 'p1', ambienteIds: ['m2'], grupoId: 'g1' })
  assert.deepEqual(pavDe(s).ambientes.map(a => a.acessoId), ['a1', 'a1'])
  s = reducer(s, { type: 'MOVER_AMBIENTES_GRUPO', pavimentoId: 'p1', ambienteIds: ['m1'], grupoId: null })
  assert.deepEqual(pavDe(s).ambientes.map(a => [a.grupoId, a.acessoId]), [[null, null], ['g1', 'a1']])
  // Desligar a seta zera o acessoId de todos do grupo.
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: null })
  assert.equal(pavDe(s).ambientes[1].acessoId, null)
})

test('ambiente novo dentro de um grupo já nasce ligado', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Grupo', acessoId: 'a1' }] }))
  s = reducer(s, { type: 'ADD_AMBIENTE_SE', pavimentoId: 'p1', id: 'n1', ambiente: { nome: 'Novo', grupoId: 'g1' } })
  assert.equal(pavDe(s).ambientes[0].acessoId, 'a1')
})

test('remover acesso desliga grupos e deixa os ambientes sem ligação (nada é apagado)', () => {
  let s = estado(pavBase({
    grupos: [{ id: 'g1', nome: 'Grupo', acessoId: 'a1' }], ambientes: [amb('m1', 'g1')],
    acessos: [
      { id: 's1', nome: 'Saída', tipo: 'saida', alimentaEm: null },
      { id: 'a1', nome: 'Acesso', tipo: 'acesso', alimentaEm: 's1' },
      { id: 'a2', nome: 'Acesso 2', tipo: 'acesso', alimentaEm: 'a1' },
    ],
    fluxoPos: { a1: { x: 1, y: 1 }, g1: { x: 0, y: 0 } },
  }))
  s = reducer(s, { type: 'REMOVER_ACESSO', pavimentoId: 'p1', acessoId: 'a1' })
  const p = pavDe(s)
  assert.equal(p.grupos[0].acessoId, null)
  assert.equal(p.ambientes[0].acessoId, null)
  assert.equal(p.ambientes.length, 1)
  assert.equal(p.acessos.find(a => a.id === 'a2').alimentaEm, null)
  assert.equal(p.fluxoPos.a1, undefined)
})

test('remover grupo solta os ambientes; trocar o tipo do nó reinicia dims e desliga a saída seguinte', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Grupo', acessoId: 'a1' }], ambientes: [amb('m1', 'g1')] }))
  s = reducer(s, { type: 'REMOVER_GRUPO', pavimentoId: 'p1', grupoId: 'g1' })
  assert.deepEqual([pavDe(s).grupos.length, pavDe(s).ambientes[0].grupoId, pavDe(s).ambientes[0].acessoId], [0, null, null])
  s = reducer(s, { type: 'SET_ACESSO_TIPO', pavimentoId: 'p1', acessoId: 'a1', tipo: 'escada' })
  const a1 = pavDe(s).acessos.find(a => a.id === 'a1')
  assert.deepEqual([a1.tipo, a1.alimentaEm, a1.dims.ER], ['escada', null, true])
  assert.equal(calc.contarSaidasPavimento(pavDe(s).acessos), 2)
})

test('criar nós grava tipo, dimensionamento padrão e posição', () => {
  let s = estado(pavBase())
  s = reducer(s, { type: 'CRIAR_NO_FLUXO', pavimentoId: 'p1', id: 'n1', tipo: 'escada', nome: 'Escada 02', pos: { x: 5, y: 6 } })
  s = reducer(s, { type: 'CRIAR_GRUPO_AMBIENTES', pavimentoId: 'p1', id: 'g9', nome: 'Grupo 9', pos: { x: 1, y: 2 }, ambienteIds: [] })
  const p = pavDe(s)
  assert.deepEqual(p.acessos.find(a => a.id === 'n1'), { id: 'n1', nome: 'Escada 02', tipo: 'escada', alimentaEm: null, dims: { AD: false, ER: true, PT: true } })
  assert.deepEqual([p.fluxoPos.n1, p.fluxoPos.g9], [{ x: 5, y: 6 }, { x: 1, y: 2 }])
  assert.equal(p.grupos[0].acessoId, null)
})

test('dimensionamento: população de um grupo ligado soma no acesso e na saída', () => {
  const taxa = { 'C-1': { A: 3 } }
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Grupo', acessoId: null }], ambientes: [{ ...amb('m1', 'g1'), popTipo: 'manual', popManual: 40 }] }))
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: 'a1' })
  const p = pavDe(s)
  assert.equal(calc.calcPopAcesso('a1', p.ambientes, p.acessos, taxa), 40)
  assert.equal(calc.calcPopAcesso('s1', p.ambientes, p.acessos, taxa), 40)
})

test('migração dá nome padrão a grupo sem nome, sem repetir os já nomeados', () => {
  const p = fluxo.migrarFluxoPavimento(pavBase({ grupos: [{ id: 'g1', acessoId: null }, { id: 'g2', nome: 'Grupo 1', acessoId: null }, { id: 'g3', acessoId: null }] }))
  assert.deepEqual(p.grupos.map(g => g.nome), ['Grupo 2', 'Grupo 1', 'Grupo 3'])
})

test('lados da seta: sai e chega pelos lados mais próximos entre os dois nós', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 }
  assert.deepEqual(fluxo.ladosMaisProximos(a, { x: 300, y: 0, w: 100, h: 100 }), { de: 'right', para: 'left' })
  assert.deepEqual(fluxo.ladosMaisProximos(a, { x: -300, y: 0, w: 100, h: 100 }), { de: 'left', para: 'right' })
  assert.deepEqual(fluxo.ladosMaisProximos(a, { x: 0, y: 300, w: 100, h: 100 }), { de: 'bottom', para: 'top' })
  assert.deepEqual(fluxo.ladosMaisProximos(a, { x: 0, y: -300, w: 100, h: 100 }), { de: 'top', para: 'bottom' })
})

test('ambiente solto na área: posição própria, ligação direta e volta pra lista', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Grupo 1', acessoId: 'a1' }], ambientes: [amb('m1', 'g1'), amb('m2')] }))
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: 'a1' })
  // m1 sai do grupo e vai pra área: perde a ligação do grupo.
  s = reducer(s, { type: 'SOLTAR_AMBIENTES_NA_AREA', pavimentoId: 'p1', posicoes: { m1: { x: 10, y: 20 }, m2: { x: 10, y: 100 } } })
  let p = pavDe(s)
  assert.deepEqual(p.ambientes.map(a => [a.grupoId, a.acessoId]), [[null, null], [null, null]])
  assert.deepEqual([p.fluxoPos.m1, p.fluxoPos.m2], [{ x: 10, y: 20 }, { x: 10, y: 100 }])
  // Ligação direta a um acesso: conta na população do nó.
  s = reducer(s, { type: 'LIGAR_AMBIENTE', pavimentoId: 'p1', ambienteId: 'm1', acessoId: 'a1' })
  p = pavDe(s)
  assert.equal(p.ambientes[0].acessoId, 'a1')
  assert.equal(calc.calcPopAcesso('s1', p.ambientes, p.acessos, { 'C-1': { A: 3 } }), 34)
  // Reposicionar não mexe na ligação.
  s = reducer(s, { type: 'SOLTAR_AMBIENTES_NA_AREA', pavimentoId: 'p1', posicoes: { m1: { x: 0, y: 0 } } })
  assert.equal(pavDe(s).ambientes[0].acessoId, 'a1')
  // Remover o acesso desliga; voltar pra lista apaga posição e ligação.
  s = reducer(s, { type: 'REMOVER_ACESSO', pavimentoId: 'p1', acessoId: 'a1' })
  assert.equal(pavDe(s).ambientes[0].acessoId, null)
  s = reducer(s, { type: 'MOVER_AMBIENTES_GRUPO', pavimentoId: 'p1', ambienteIds: ['m1'], grupoId: null })
  assert.equal(pavDe(s).fluxoPos.m1, undefined)
  // Excluir ambiente apaga a posição também.
  s = reducer(s, { type: 'REMOVE_AMBIENTE_SE', pavimentoId: 'p1', ambienteId: 'm2' })
  assert.equal(pavDe(s).fluxoPos.m2, undefined)
})

test('remover o grupo manda os ambientes de volta pra lista, sem ligação', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Grupo 1', acessoId: 'a1' }], ambientes: [amb('m1', 'g1')] }))
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: 'a1' })
  s = reducer(s, { type: 'REMOVER_GRUPO', pavimentoId: 'p1', grupoId: 'g1' })
  assert.deepEqual([pavDe(s).ambientes[0].grupoId, pavDe(s).ambientes[0].acessoId], [null, null])
})

test('migração não transforma em grupo o ambiente solto na área que está ligado a um nó', () => {
  let s = estado(pavBase({ ambientes: [amb('m1')] }))
  s = reducer(s, { type: 'SOLTAR_AMBIENTES_NA_AREA', pavimentoId: 'p1', posicoes: { m1: { x: 5, y: 5 } } })
  s = reducer(s, { type: 'LIGAR_AMBIENTE', pavimentoId: 'p1', ambienteId: 'm1', acessoId: 'a1' })
  // Criar um nó depois não muda o ambiente.
  s = reducer(s, { type: 'CRIAR_NO_FLUXO', pavimentoId: 'p1', id: 'n1', tipo: 'acesso', nome: 'Acesso 2', pos: { x: 1, y: 1 } })
  // Recarregar o projeto (hydrateState roda a migração de novo) também não.
  const recarregado = fluxo.migrarFluxoPavimento(pavDe(s))
  assert.deepEqual(recarregado.grupos, [])
  assert.deepEqual([recarregado.ambientes[0].grupoId, recarregado.ambientes[0].acessoId], [null, 'a1'])
  assert.deepEqual(fluxo.migrarFluxoPavimento(recarregado), recarregado)
})

test('agrupar ambientes soltos: grupo novo no lugar do alvo, herdando a ligação, sem posições soltas', () => {
  let s = estado(pavBase({ ambientes: [amb('m1'), amb('m2')] }))
  s = reducer(s, { type: 'SOLTAR_AMBIENTES_NA_AREA', pavimentoId: 'p1', posicoes: { m1: { x: 10, y: 10 }, m2: { x: 300, y: 10 } } })
  s = reducer(s, { type: 'LIGAR_AMBIENTE', pavimentoId: 'p1', ambienteId: 'm1', acessoId: 'a1' })
  s = reducer(s, { type: 'CRIAR_GRUPO_AMBIENTES', pavimentoId: 'p1', id: 'g7', nome: 'Grupo 1', pos: { x: 10, y: 10 }, acessoId: 'a1', ambienteIds: ['m1', 'm2'] })
  const p = pavDe(s)
  assert.deepEqual(p.grupos, [{ id: 'g7', nome: 'Grupo 1', acessoId: 'a1' }])
  assert.deepEqual(p.ambientes.map(a => [a.grupoId, a.acessoId]), [['g7', 'a1'], ['g7', 'a1']])
  assert.deepEqual(p.fluxoPos, { g7: { x: 10, y: 10 } })
})

test('caminho até a saída: nós e setas da cadeia, de grupo, ambiente solto ou acesso', () => {
  const dados = {
    acessos: [{ id: 's1', alimentaEm: null }, { id: 'a1', alimentaEm: 's1' }, { id: 'a2', alimentaEm: 'a1' }, { id: 'a3', alimentaEm: null, tipo: 'acesso' }],
    grupos: [{ id: 'g1', acessoId: 'a2' }, { id: 'g2', acessoId: null }],
    ambientes: [{ id: 'm1', grupoId: null, acessoId: 'a1' }, { id: 'm2', grupoId: 'g1', acessoId: 'a2' }],
  }
  assert.deepEqual(fluxo.caminhoAteSaida('g1', dados), { nos: ['g1', 'a2', 'a1', 's1'], setas: ['e-g1', 'e-a2', 'e-a1'] })
  assert.deepEqual(fluxo.caminhoAteSaida('m1', dados), { nos: ['m1', 'a1', 's1'], setas: ['e-m1', 'e-a1'] })
  assert.deepEqual(fluxo.caminhoAteSaida('s1', dados), { nos: ['s1'], setas: [] })
  assert.deepEqual(fluxo.caminhoAteSaida('g2', dados), { nos: ['g2'], setas: [] })
  assert.deepEqual(fluxo.caminhoAteSaida('a3', dados), { nos: ['a3'], setas: [] })
  // Ambiente dentro de grupo não tem seta própria: o caminho é o do grupo.
  assert.deepEqual(fluxo.caminhoAteSaida('m2', dados), { nos: ['m2'], setas: [] })
  // Ciclo (dado corrompido) não trava.
  assert.deepEqual(fluxo.caminhoAteSaida('x', { acessos: [{ id: 'x', alimentaEm: 'y' }, { id: 'y', alimentaEm: 'x' }], grupos: [], ambientes: [] }).nos, ['x', 'y'])
})

// ── Área de trabalho da estrutura: saída/escada padrão, ligações entre pavimentos, escada única ──
const pavLegado = (extra = {}) => ({ id: 'e1-P2', estruturaId: 'e1', label: '1º Pavimento', pisoDescarga: false, ambientes: [], acessos: [], ...extra })

test('todo pavimento tem a saída/escada padrão (fixa): criada se faltava, promovida se já existia', () => {
  const terreo = fluxo.migrarFluxoPavimento(pavLegado({ id: 'e1-P1', label: 'Térreo', pisoDescarga: true }))
  assert.deepEqual(terreo.acessos.map(a => [a.id, a.tipo, a.fixo, a.nome]), [['acs-fixo-e1-P1', 'saida', true, 'Saída 01']])
  const upper = fluxo.migrarFluxoPavimento(pavLegado())
  assert.deepEqual(upper.acessos.map(a => [a.tipo, a.fixo, a.nome]), [['escada', true, 'Escada/Rampa 01']])
  assert.deepEqual(upper.acessos[0].dims, { AD: false, ER: true, PT: true })
  // Já tinha raízes: a primeira vira a padrão, sem criar outra; acesso solto não conta.
  const antigo = fluxo.migrarFluxoPavimento(pavLegado({ acessos: [{ id: 'x', nome: 'Acesso', alimentaEm: 'r1' }, { id: 'r1', nome: 'Escada A', alimentaEm: null }, { id: 'r2', nome: 'Escada B', alimentaEm: null }] }))
  assert.deepEqual(antigo.acessos.map(a => [a.id, !!a.fixo]), [['x', false], ['r1', true], ['r2', false]])
  assert.deepEqual(fluxo.migrarFluxoPavimento(antigo), antigo)
})

test('fluxo de um pavimento novo traz só a saída/escada padrão, à direita da faixa', () => {
  let n = 0
  const f = fluxo.fluxoPadrao(false, () => `n${++n}`)
  assert.equal(f.acessos.length, 1)
  assert.deepEqual([f.acessos[0].tipo, f.acessos[0].fixo], ['escada', true])
  assert.ok(f.fluxoPos.n1.x > fluxo.ORIGEM_X && f.fluxoPos.n1.y >= fluxo.ORIGEM_Y)
})

test('migração: posições antigas (área livre) são deslocadas pra dentro da faixa, uma vez só', () => {
  const p = fluxo.migrarFluxoPavimento(pavLegado({
    acessos: [{ id: 'r1', nome: 'Escada', alimentaEm: null }],
    grupos: [{ id: 'g1', nome: 'Grupo 1', acessoId: 'r1' }],
    fluxoPos: { r1: { x: 900, y: -50 }, g1: { x: 100, y: 200 } },
  }))
  assert.deepEqual(p.fluxoPos, { r1: { x: 900 - 100 + fluxo.ORIGEM_X, y: fluxo.ORIGEM_Y }, g1: { x: fluxo.ORIGEM_X, y: 200 + 50 + fluxo.ORIGEM_Y } })
  assert.equal(p.fluxoVer, fluxo.FLUXO_VER)
  assert.deepEqual(fluxo.migrarFluxoPavimento(p).fluxoPos, p.fluxoPos)
})

test('a saída/escada padrão não pode ser excluída nem trocar de tipo; acompanha o piso de descarga', () => {
  const t = fluxo.migrarFluxoPavimento(pavLegado({ id: 'e1-P1', label: 'Térreo', pisoDescarga: true }))
  const u = fluxo.migrarFluxoPavimento(pavLegado())
  let s = { pavimentos: [t, u], estruturas: [] }
  s = reducer(s, { type: 'REMOVER_ACESSO', pavimentoId: 'e1-P1', acessoId: 'acs-fixo-e1-P1' })
  s = reducer(s, { type: 'SET_ACESSO_TIPO', pavimentoId: 'e1-P2', acessoId: 'acs-fixo-e1-P2', tipo: 'acesso' })
  assert.deepEqual(s.pavimentos.map(p => [p.acessos.length, p.acessos[0].tipo]), [[1, 'saida'], [1, 'escada']])
  // Mais de um piso de descarga: marcar o 1º pavimento não desmarca o térreo, e a
  // escada dele vira saída (nome e dimensionamento padrão acompanham).
  s = reducer(s, { type: 'SET_PISO_DESCARGA', pavimentoId: 'e1-P2', valor: true })
  assert.deepEqual(s.pavimentos.map(p => [p.pisoDescarga, p.acessos[0].tipo, p.acessos[0].nome]), [[true, 'saida', 'Saída 01'], [true, 'saida', 'Saída 01']])
  assert.deepEqual(s.pavimentos[1].acessos[0].dims, { AD: true, ER: false, PT: true })
  // Desmarcar só afeta o próprio pavimento: o térreo volta a ser escada/rampa.
  s = reducer(s, { type: 'SET_PISO_DESCARGA', pavimentoId: 'e1-P1', valor: false })
  assert.deepEqual(s.pavimentos.map(p => [p.pisoDescarga, p.acessos[0].tipo, p.acessos[0].nome]), [[false, 'escada', 'Escada/Rampa 01'], [true, 'saida', 'Saída 01']])
})

test('ligação: mesmo pavimento como antes; entre pavimentos só saída/escada <-> saída/escada, sem ciclo', () => {
  const acessos = [
    { id: 's1', tipo: 'saida', alimentaEm: null }, { id: 'e2', tipo: 'escada', alimentaEm: null, ligadoA: 's1' }, { id: 'e3', tipo: 'escada', alimentaEm: null },
    { id: 'a3', tipo: 'acesso', alimentaEm: 'e3' }, { id: 'a2', tipo: 'acesso', alimentaEm: 'e2' },
  ]
  const grupos = [{ id: 'g3', acessoId: null }]
  const pavDe = new Map([['s1', 'P1'], ['e2', 'P2'], ['a2', 'P2'], ['e3', 'P3'], ['a3', 'P3'], ['g3', 'P3']])
  const dados = { acessos, grupos, pavDe, ambientesNaArea: new Set() }
  const t = (o, d) => fluxo.tipoDeLigacao(o, d, dados)
  assert.equal(t('g3', 'a3'), 'local')            // grupo -> acesso do mesmo pavimento
  assert.equal(t('a3', 'e3'), 'local')            // acesso -> escada do mesmo pavimento
  assert.equal(t('e3', 'e2'), 'entre-pavimentos') // escada do 3º -> escada do 2º
  assert.equal(t('e2', 's1'), 'entre-pavimentos') // escada -> saída
  assert.equal(t('g3', 'e2'), null)               // grupo -> escada de outro pavimento
  assert.equal(t('a3', 'e2'), null)               // acesso -> escada de outro pavimento
  assert.equal(t('e3', 'a2'), null)               // escada -> acesso de outro pavimento
  assert.equal(t('s1', 'e3'), 'entre-pavimentos') // saída também pode ser origem...
  assert.equal(t('s1', 'e2'), null)               // ...mas não fecha ciclo (e2 já liga em s1)
  assert.equal(t('e3', 'e3'), null)
  assert.equal(t('e3', 'g3'), null)
})

test('ligação entre pavimentos: guarda em ligadoA, some com o nó de destino e ao virar acesso', () => {
  const mk = (id, piso) => fluxo.migrarFluxoPavimento(pavLegado({ id, pisoDescarga: piso }))
  let s = { pavimentos: [mk('e1-P1', true), mk('e1-P2', false), mk('e1-P3', false)], estruturas: [] }
  // Escada extra no 2º pavimento (removível) ligada à saída do térreo e à escada do 3º ligada a ela.
  s = reducer(s, { type: 'CRIAR_NO_FLUXO', pavimentoId: 'e1-P2', id: 'ex', tipo: 'escada', nome: 'Escada/Rampa 02', pos: { x: 1, y: 1 } })
  s = reducer(s, { type: 'LIGAR_ENTRE_PAVIMENTOS', pavimentoId: 'e1-P2', acessoId: 'ex', destinoId: 'acs-fixo-e1-P1' })
  s = reducer(s, { type: 'LIGAR_ENTRE_PAVIMENTOS', pavimentoId: 'e1-P3', acessoId: 'acs-fixo-e1-P3', destinoId: 'ex' })
  const todos = () => s.pavimentos.flatMap(p => p.acessos)
  assert.equal(todos().find(a => a.id === 'ex').ligadoA, 'acs-fixo-e1-P1')
  const dados = { acessos: todos(), grupos: [], ambientes: [] }
  assert.deepEqual(fluxo.caminhoAteSaida('acs-fixo-e1-P3', dados).nos, ['acs-fixo-e1-P3', 'ex', 'acs-fixo-e1-P1'])
  // Remover a escada extra desliga quem apontava pra ela, em outro pavimento.
  s = reducer(s, { type: 'REMOVER_ACESSO', pavimentoId: 'e1-P2', acessoId: 'ex' })
  assert.equal(todos().find(a => a.id === 'acs-fixo-e1-P3').ligadoA, null)
  // Virar acesso solta a ligação entre pavimentos.
  s = reducer(s, { type: 'CRIAR_NO_FLUXO', pavimentoId: 'e1-P3', id: 'ey', tipo: 'escada', nome: 'Escada/Rampa 02', pos: { x: 1, y: 1 } })
  s = reducer(s, { type: 'LIGAR_ENTRE_PAVIMENTOS', pavimentoId: 'e1-P3', acessoId: 'ey', destinoId: 'acs-fixo-e1-P1' })
  s = reducer(s, { type: 'SET_ACESSO_TIPO', pavimentoId: 'e1-P3', acessoId: 'ey', tipo: 'acesso' })
  assert.equal(todos().find(a => a.id === 'ey').ligadoA, undefined)
})

test('escada/rampa: um cálculo único por estrutura (pavimento mais populoso, sem o piso de descarga)', () => {
  const taxa = { 'C-1': { A: 3, AD: 100, ER: 75, PT: 100 } }
  const larg = { AD: 1.1, ER: 1.2, LARG_UP: 0.55, PT: [{ n_up: 1, largura: 0.8, tipo: '1 folha' }] }
  const pavs = [
    { id: 'P1', pisoDescarga: true, ambientes: [{ id: 'a', divisao: 'C-1', area: 3000 }] },   // térreo: 1000 pessoas, ignorado
    { id: 'P2', pisoDescarga: false, ambientes: [{ id: 'b', divisao: 'C-1', area: 300 }] },  // 100
    { id: 'P3', pisoDescarga: false, ambientes: [{ id: 'c', divisao: 'C-1', area: 600 }] },  // 200  <- mais populoso
  ]
  const er = calc.calcErEstrutura(pavs, taxa, larg)
  assert.deepEqual([er.pavimento.id, er.pop, er.er.n], ['P3', 200, 3])
  assert.equal(calc.calcErEstrutura([pavs[0]], taxa, larg), null)
  // Aplicado ao nó: o ER do nó usa o da estrutura (e a porta acompanha o N dele); sem ele, o cálculo local de sempre.
  const ambientes = [{ id: 'c', divisao: 'C-1', area: 30, acessoId: 'r' }]
  const acessos = [{ id: 'r', alimentaEm: null }]
  const dims = { AD: false, ER: true, PT: true }
  const local = calc.calcDimsAcesso('r', ambientes, acessos, taxa, larg, dims)
  const unico = calc.calcDimsAcesso('r', ambientes, acessos, taxa, larg, dims, er)
  assert.equal(local.er.n, 1)
  assert.equal(unico.er.n, 3)
  assert.equal(unico.nPorta, 3)
  assert.equal(unico.pop, 10) // população do nó continua a local
})

test('escada única ignora todos os pisos de descarga, não só o térreo', () => {
  const taxa = { 'C-1': { A: 3, AD: 100, ER: 75, PT: 100 } }
  const larg = { AD: 1.1, ER: 1.2, LARG_UP: 0.55, PT: [{ n_up: 1, largura: 0.8, tipo: '1 folha' }] }
  const pavs = [
    { id: 'P1', pisoDescarga: true, ambientes: [{ id: 'a', divisao: 'C-1', area: 900 }] },
    { id: 'P2', pisoDescarga: true, ambientes: [{ id: 'b', divisao: 'C-1', area: 3000 }] }, // 2º piso de descarga: fora
    { id: 'P3', pisoDescarga: false, ambientes: [{ id: 'c', divisao: 'C-1', area: 300 }] },
  ]
  assert.equal(calc.calcErEstrutura(pavs, taxa, larg).pavimento.id, 'P3')
})

// ── Escadas padrão ligadas à saída do piso de descarga ──
const pavEst = (id, piso, extra = {}) => fluxo.migrarFluxoPavimento({ id, estruturaId: 'e1', label: id, pisoDescarga: piso, ambientes: [], acessos: [], ...extra })
const raizDe = (pavs, id) => pavs.find(p => p.id === id).acessos.find(a => a.fixo)
const liga = pavs => Object.fromEntries(pavs.map(p => [p.id, raizDe(pavs, p.id).ligadoA]))

test('escadas padrão ligam em cadeia até a saída do piso de descarga', () => {
  const pavs = fluxo.ligarEscadasPadrao([pavEst('P1', true), pavEst('P2', false), pavEst('P3', false)])
  assert.deepEqual(liga(pavs), { P1: undefined, P2: 'acs-fixo-P1', P3: 'acs-fixo-P2' })
  assert.equal(raizDe(pavs, 'P2').ligacaoPadrao, true)
  // Idempotente (mesmas referências, nada a mudar).
  assert.equal(fluxo.ligarEscadasPadrao(pavs), pavs)
  // Subsolo liga pra cima, em direção ao térreo.
  const comSub = fluxo.ligarEscadasPadrao([pavEst('S1', false), pavEst('P1', true), pavEst('P2', false)])
  assert.deepEqual(liga(comSub), { S1: 'acs-fixo-P1', P1: undefined, P2: 'acs-fixo-P1' })
})

test('com dois pisos de descarga, cada escada vai pro mais próximo (empate: o de baixo)', () => {
  const pavs = fluxo.ligarEscadasPadrao([pavEst('P1', true), pavEst('P2', false), pavEst('P3', true), pavEst('P4', false), pavEst('P5', false)])
  assert.deepEqual(liga(pavs), { P1: undefined, P2: 'acs-fixo-P1', P3: undefined, P4: 'acs-fixo-P3', P5: 'acs-fixo-P4' })
  // Sem nenhum piso de descarga não liga nada.
  assert.deepEqual(liga(fluxo.ligarEscadasPadrao([pavEst('P1', false), pavEst('P2', false)])), { P1: undefined, P2: undefined })
})

test('ligação feita ou desfeita à mão não é refeita; mudar o piso de descarga refaz só as automáticas', () => {
  let s = { pavimentos: fluxo.ligarEscadasPadrao([pavEst('P1', true), pavEst('P2', false), pavEst('P3', false)]), estruturas: [] }
  // Usuário desliga a escada do 3º: fica desligada mesmo depois de mexer no piso de descarga.
  s = reducer(s, { type: 'LIGAR_ENTRE_PAVIMENTOS', pavimentoId: 'P3', acessoId: 'acs-fixo-P3', destinoId: null })
  s = reducer(s, { type: 'SET_PISO_DESCARGA', pavimentoId: 'P3', valor: false })
  assert.equal(raizDe(s.pavimentos, 'P3').ligadoA, null)
  // O 2º vira piso de descarga: a escada dele vira saída e larga a ligação automática.
  s = reducer(s, { type: 'SET_PISO_DESCARGA', pavimentoId: 'P2', valor: true })
  assert.deepEqual([raizDe(s.pavimentos, 'P2').tipo, raizDe(s.pavimentos, 'P2').ligadoA], ['saida', undefined])
  // Desmarcar de novo religa à saída mais próxima.
  s = reducer(s, { type: 'SET_PISO_DESCARGA', pavimentoId: 'P2', valor: false })
  assert.equal(raizDe(s.pavimentos, 'P2').ligadoA, 'acs-fixo-P1')
})
