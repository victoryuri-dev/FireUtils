import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidorComNormas } from './helpers/normasDeTeste.mjs'

const server = await servidorComNormas({})
after(() => server.close())
const { analisarHidrantesRapido, completudeHidrantesRapido, divisoesDaEstruturaRapido } =
  await server.ssrLoadModule('/src/data/hidrantesRapido.js')
const { getHidrantes, getExtintores, getEstadosDisponiveis } = await server.ssrLoadModule('/src/data/normas/index.js')
const { carregarNormasRemotas } = await server.ssrLoadModule('/src/lib/normasRemote.js')
await carregarNormasRemotas('MA')

const norma = getHidrantes('MA')
const ext = getExtintores('MA')

function projeto({ area = '1000', principal = 'C-1', acess = [], cargas = { 'C-1': '500' }, chuveiros = 'nao', nome = 'Teste' } = {}) {
  return {
    uf: 'MA', tipoProjeto: 'hidrantes', nome,
    estruturas: [{ id: 'e1', nome: 'Bloco A', areaTotal: area }],
    pavimentos: [{ id: 'e1-P1', estruturaId: 'e1', divisao: principal, acess: acess.map(divisao => ({ divisao })) }],
    cargaState: { e1: Object.fromEntries(Object.entries(cargas).map(([d, v]) => [d, { metodo: 'levantamento', valorManual: v }])) },
    hidrantes: { chuveiros },
  }
}

test('estado MA libera o modo de hidrantes', () => {
  assert.equal(getEstadosDisponiveis().find(e => e.uf === 'MA').ativoHidrantes, true)
})

test('coluna 1 (A-2): duas opções, Tipo 1 ou 2, RTI pela faixa de área', () => {
  const a = analisarHidrantesRapido(projeto({ area: '1000', principal: 'A-2', cargas: { 'A-2': '300' } }), norma, ext)
  assert.equal(a.pendencias.length, 0)
  assert.deepEqual(a.sugestao.opcoes.map(o => [o.tipo, o.rti]), [[1, 6], [2, 8]])
})

test('coluna 3 (L-1): Tipo 4 com RTI da faixa; Nota 2 só com chuveiros não exigidos', () => {
  const base = projeto({ area: '3000', principal: 'L-1', cargas: { 'L-1': '2000' } })
  assert.deepEqual(analisarHidrantesRapido(base, norma, ext).sugestao.opcoes.map(o => o.tipo), [4])
  const voluntario = projeto({ area: '3000', principal: 'L-1', cargas: { 'L-1': '2000' }, chuveiros: 'instalado' })
  assert.deepEqual(analisarHidrantesRapido(voluntario, norma, ext).sugestao.opcoes.map(o => [o.tipo, o.origem]), [[4, 'normal'], [3, 'nota2']])
  const exigido = projeto({ area: '3000', principal: 'L-1', cargas: { 'L-1': '2000' }, chuveiros: 'exigido' })
  assert.deepEqual(analisarHidrantesRapido(exigido, norma, ext).sugestao.opcoes.map(o => o.tipo), [4])
})

test('coluna 4 Tipo 5: Nota 1 (exigido) e Nota 2 (instalado) oferecem Tipo 4', () => {
  const p = ch => projeto({ area: '30000', principal: 'L-2', cargas: { 'L-2': '3000' }, chuveiros: ch })
  assert.deepEqual(analisarHidrantesRapido(p('nao'), norma, ext).sugestao.opcoes.map(o => o.tipo), [5])
  assert.deepEqual(analisarHidrantesRapido(p('exigido'), norma, ext).sugestao.opcoes.map(o => [o.tipo, o.origem]), [[5, 'normal'], [4, 'nota1']])
  assert.deepEqual(analisarHidrantesRapido(p('instalado'), norma, ext).sugestao.opcoes.map(o => [o.tipo, o.origem]), [[5, 'normal'], [4, 'nota2']])
})

test('ocupação mista: a divisão de maior carga é a referência', () => {
  const a = analisarHidrantesRapido(projeto({ area: '1000', principal: 'A-2', acess: ['L-1'], cargas: { 'A-2': '300', 'L-1': '2000' } }), norma, ext)
  assert.equal(a.sugestao.divisao, 'L-1')
  assert.equal(a.sugestao.coluna, 3)
  assert.equal(a.risco, 'alto')
})

test('pendências: sem nome, área, ocupação ou carga não classifica', () => {
  const a = analisarHidrantesRapido(projeto({ nome: '', area: '', principal: '', cargas: {} }), norma, ext)
  assert.ok(a.pendencias.includes('Nome do projeto'))
  assert.ok(a.pendencias.some(p => p.startsWith('Área')))
  assert.ok(a.pendencias.some(p => p.startsWith('Ocupação')))
  assert.deepEqual(a.sugestao.opcoes, [])
  const semCarga = analisarHidrantesRapido(projeto({ cargas: {} }), norma, ext)
  assert.ok(semCarga.pendencias.some(p => p.startsWith('Carga de incêndio C-1')))
})

test('divisão fora da Tabela 3 sinaliza semClassificacao', () => {
  const a = analisarHidrantesRapido(projeto({ principal: 'Z-9', cargas: { 'Z-9': '100' } }), norma, ext)
  assert.equal(a.semClassificacao, true)
})

test('divisões da estrutura: principal + subsidiárias, sem repetir', () => {
  assert.deepEqual(divisoesDaEstruturaRapido(projeto({ principal: 'A-2', acess: ['C-1', 'A-2'] }), 'e1'), ['A-2', 'C-1'])
})

test('completude: 100% só com tudo preenchido e o Tipo definido', () => {
  const p = projeto()
  assert.ok(completudeHidrantesRapido(p) < 100)
  p.hidrantes.tipo = 4
  assert.equal(completudeHidrantesRapido(p), 100)
})

test('a auditoria (usada pelo CnaeBusca/Obrigatorio) não quebra num projeto de hidrantes', async () => {
  const { camposObrigatorios } = await server.ssrLoadModule('/src/data/auditoriaProjeto.js')
  const state = { ...projeto(), sistemas: {}, sistemasPorEstrutura: {}, riscosEspeciaisPorEstrutura: {}, riscosOutrosDescPorEstrutura: {}, memorialPB: {} }
  assert.doesNotThrow(() => camposObrigatorios(state, []))
})

test('avulso: completude é só nome, Tipo e RTI (sem área/ocupação/carga)', () => {
  const p = { nome: 'Avulso', avulso: true, estruturas: [{ id: 'e1', areaTotal: '' }], pavimentos: [], cargaState: {}, hidrantes: {} }
  assert.equal(completudeHidrantesRapido(p), 33)
  p.hidrantes = { tipo: 4, rti: '' }
  assert.equal(completudeHidrantesRapido(p), 67)
  p.hidrantes = { tipo: 4, rti: '25' }
  assert.equal(completudeHidrantesRapido(p), 100)
})

test('sistema personalizado: parâmetros digitados viram os dados e os parâmetros do plugin', async () => {
  const { dadosDoSistemaDoProjeto, parametrosDoSistema } = await server.ssrLoadModule('/src/data/hidrantes_calc.js')
  const h = { tipo: 'personalizado', personalizado: { vazaoMin: '250,5', pressaoMin: '40', esguicho: '45', mangueiraDn: '50', mangueiraComprimento: '20', expedicoes: 'duplo' } }
  const dados = dadosDoSistemaDoProjeto(h, norma)
  assert.equal(dados.label, 'Personalizado')
  assert.deepEqual(parametrosDoSistema(dados), { vazaoMin: 250.5, pressaoMin: 40, esguicho: 45, mangueiraDn: 50, mangueiraComprimento: 20, expedicoes: 'duplo' })
  // parâmetro vazio, zero ou expedição inválida: sem sistema (não inventa valor)
  assert.equal(dadosDoSistemaDoProjeto({ ...h, personalizado: { ...h.personalizado, vazaoMin: '' } }, norma), null)
  assert.equal(dadosDoSistemaDoProjeto({ ...h, personalizado: { ...h.personalizado, pressaoMin: '0' } }, norma), null)
  assert.equal(dadosDoSistemaDoProjeto({ ...h, personalizado: { ...h.personalizado, expedicoes: 'x' } }, norma), null)
})

test('Tipo da norma: os parâmetros do plugin saem da tabela do estado (Tipo 4, variante B)', async () => {
  const { dadosDoSistemaDoProjeto, parametrosDoSistema } = await server.ssrLoadModule('/src/data/hidrantes_calc.js')
  const p = parametrosDoSistema(dadosDoSistemaDoProjeto({ tipo: 4, tipoVariante: 1 }, norma))
  assert.deepEqual(p, { vazaoMin: 300, pressaoMin: 30, esguicho: 60, mangueiraDn: 65, mangueiraComprimento: 30, expedicoes: 'simples' })
  assert.equal(parametrosDoSistema(dadosDoSistemaDoProjeto({ tipo: '' }, norma)), null)
})

test('avulso personalizado: completude exige os parâmetros', () => {
  const base = { nome: 'A', avulso: true, estruturas: [], pavimentos: [], cargaState: {}, hidrantes: { tipo: 'personalizado', rti: '10', personalizado: {} } }
  assert.equal(completudeHidrantesRapido(base), 75)
  base.hidrantes.personalizado = { vazaoMin: '150', pressaoMin: '30', esguicho: '40', mangueiraDn: '40', mangueiraComprimento: '30', expedicoes: 'simples' }
  assert.equal(completudeHidrantesRapido(base), 100)
})
