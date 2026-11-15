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
