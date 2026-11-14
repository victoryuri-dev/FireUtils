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

test('migração: pavimento antigo vira boxes por acesso, com tipo e posições', () => {
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
  assert.deepEqual(p.ambientes.map(a => [a.grupoId, a.acessoId]), [['grp-mig-a1', 'a1'], ['grp-mig-a1', 'a1'], [null, null]])
  for (const id of ['r1', 'a1', 'grp-mig-a1']) assert.ok(p.fluxoPos[id], `posição de ${id}`)
  // Da esquerda pra direita: box -> acesso -> saída.
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

test('ligar um box a um acesso propaga acessoId pros ambientes dentro dele', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Box', acessoId: null }], ambientes: [amb('m1', 'g1'), amb('m2')] }))
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: 'a1' })
  assert.deepEqual(pavDe(s).ambientes.map(a => a.acessoId), ['a1', null])
  // Mover ambiente solto pra dentro do box herda a ligação; tirar do box solta.
  s = reducer(s, { type: 'MOVER_AMBIENTES_GRUPO', pavimentoId: 'p1', ambienteIds: ['m2'], grupoId: 'g1' })
  assert.deepEqual(pavDe(s).ambientes.map(a => a.acessoId), ['a1', 'a1'])
  s = reducer(s, { type: 'MOVER_AMBIENTES_GRUPO', pavimentoId: 'p1', ambienteIds: ['m1'], grupoId: null })
  assert.deepEqual(pavDe(s).ambientes.map(a => [a.grupoId, a.acessoId]), [[null, null], ['g1', 'a1']])
  // Desligar a seta zera o acessoId de todos do box.
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: null })
  assert.equal(pavDe(s).ambientes[1].acessoId, null)
})

test('ambiente novo dentro de um box já nasce ligado', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Box', acessoId: 'a1' }] }))
  s = reducer(s, { type: 'ADD_AMBIENTE_SE', pavimentoId: 'p1', id: 'n1', ambiente: { nome: 'Novo', grupoId: 'g1' } })
  assert.equal(pavDe(s).ambientes[0].acessoId, 'a1')
})

test('remover acesso desliga boxes e deixa os ambientes sem ligação (nada é apagado)', () => {
  let s = estado(pavBase({
    grupos: [{ id: 'g1', nome: 'Box', acessoId: 'a1' }], ambientes: [amb('m1', 'g1')],
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

test('remover box solta os ambientes; trocar o tipo do nó reinicia dims e desliga a saída seguinte', () => {
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Box', acessoId: 'a1' }], ambientes: [amb('m1', 'g1')] }))
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
  s = reducer(s, { type: 'CRIAR_GRUPO_AMBIENTES', pavimentoId: 'p1', id: 'g9', nome: 'Box 9', pos: { x: 1, y: 2 }, ambienteIds: [] })
  const p = pavDe(s)
  assert.deepEqual(p.acessos.find(a => a.id === 'n1'), { id: 'n1', nome: 'Escada 02', tipo: 'escada', alimentaEm: null, dims: { AD: false, ER: true, PT: true } })
  assert.deepEqual([p.fluxoPos.n1, p.fluxoPos.g9], [{ x: 5, y: 6 }, { x: 1, y: 2 }])
  assert.equal(p.grupos[0].acessoId, null)
})

test('dimensionamento: população de um box ligado soma no acesso e na saída', () => {
  const taxa = { 'C-1': { A: 3 } }
  let s = estado(pavBase({ grupos: [{ id: 'g1', nome: 'Box', acessoId: null }], ambientes: [{ ...amb('m1', 'g1'), popTipo: 'manual', popManual: 40 }] }))
  s = reducer(s, { type: 'LIGAR_GRUPO', pavimentoId: 'p1', grupoId: 'g1', acessoId: 'a1' })
  const p = pavDe(s)
  assert.equal(calc.calcPopAcesso('a1', p.ambientes, p.acessos, taxa), 40)
  assert.equal(calc.calcPopAcesso('s1', p.ambientes, p.acessos, taxa), 40)
})
