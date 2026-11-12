import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoInicial, reducer, arquivosDoGrupo, grupoAtivo, formatarTamanho,
} from '../src/utils/assinaturas/grupos.js'

const arq = (id, nome = `${id}.pdf`) => ({ id, nome, tamanho: 1000, arquivo: {} })

test('estado inicial tem um grupo ativo e nenhum arquivo', () => {
  const s = estadoInicial('g1')
  assert.equal(s.grupos.length, 1)
  assert.equal(s.grupoAtivoId, 'g1')
  assert.equal(s.arquivos.length, 0)
})

test('arquivos novos entram no grupo ativo e só PDFs são aceitos', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('a'), arq('b', 'foto.png'), arq('c', 'Planta.PDF')] })
  assert.deepEqual(s.arquivos.map(a => a.id), ['a', 'c'])
  assert.ok(s.arquivos.every(a => a.grupoId === 'g1'))
})

test('novo grupo herda o campo do ativo e vira o ativo', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'DEFINIR_CAMPO', id: 'g1', campo: { dxMm: 33, ancora: 'superior-esquerda' } })
  s = reducer(s, { type: 'CRIAR_GRUPO', id: 'g2', nome: 'Memoriais' })
  assert.equal(s.grupoAtivoId, 'g2')
  assert.equal(grupoAtivo(s).nome, 'Memoriais')
  assert.equal(grupoAtivo(s).campo.dxMm, 33)
  assert.equal(grupoAtivo(s).campo.ancora, 'superior-esquerda')
  // mexer no novo não altera o antigo
  s = reducer(s, { type: 'DEFINIR_CAMPO', id: 'g2', campo: { dxMm: 5 } })
  assert.equal(s.grupos[0].campo.dxMm, 33)
})

test('mover arquivos entre grupos e limpar a seleção', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('a'), arq('b'), arq('c')] })
  s = reducer(s, { type: 'CRIAR_GRUPO', id: 'g2' })
  s = reducer(s, { type: 'ALTERNAR_SELECAO', id: 'a' })
  s = reducer(s, { type: 'ALTERNAR_SELECAO', id: 'c' })
  s = reducer(s, { type: 'MOVER_ARQUIVOS', ids: s.selecionados, grupoId: 'g2' })
  assert.deepEqual(arquivosDoGrupo(s, 'g2').map(a => a.id), ['a', 'c'])
  assert.deepEqual(arquivosDoGrupo(s, 'g1').map(a => a.id), ['b'])
  assert.deepEqual(s.selecionados, [])
})

test('mover para grupo inexistente é ignorado', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('a')] })
  const depois = reducer(s, { type: 'MOVER_ARQUIVOS', ids: ['a'], grupoId: 'nao-existe' })
  assert.equal(depois, s)
})

test('remover grupo devolve os arquivos ao vizinho e nunca fica sem grupo', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'CRIAR_GRUPO', id: 'g2' })
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('a')] }) // vai para g2 (ativo)
  s = reducer(s, { type: 'REMOVER_GRUPO', id: 'g2' })
  assert.equal(s.grupos.length, 1)
  assert.equal(s.arquivos[0].grupoId, 'g1')
  assert.equal(s.grupoAtivoId, 'g1')
  assert.equal(reducer(s, { type: 'REMOVER_GRUPO', id: 'g1' }), s)
})

test('remover arquivos também tira da seleção', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('a'), arq('b')] })
  s = reducer(s, { type: 'ALTERNAR_SELECAO', id: 'a' })
  s = reducer(s, { type: 'REMOVER_ARQUIVOS', ids: ['a'] })
  assert.deepEqual(s.arquivos.map(a => a.id), ['b'])
  assert.deepEqual(s.selecionados, [])
})

test('renomear grupo: ignora nome vazio, apara espaços e limita o tamanho', () => {
  let s = estadoInicial('g1')
  assert.equal(reducer(s, { type: 'RENOMEAR_GRUPO', id: 'g1', nome: '   ' }), s)
  s = reducer(s, { type: 'RENOMEAR_GRUPO', id: 'g1', nome: ' Pranchas A1 ' })
  assert.equal(s.grupos[0].nome, 'Pranchas A1')
  s = reducer(s, { type: 'RENOMEAR_GRUPO', id: 'g1', nome: 'x'.repeat(200) })
  assert.equal(s.grupos[0].nome.length, 60)
})

test('a página do grupo é mesclada', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'DEFINIR_PAGINA', id: 'g1', pagina: { modo: 'numero', numero: 2 } })
  assert.deepEqual(s.grupos[0].pagina, { modo: 'numero', numero: 2 })
})

test('formatarTamanho', () => {
  assert.equal(formatarTamanho(500), '1 KB')
  assert.equal(formatarTamanho(2048), '2 KB')
  assert.match(formatarTamanho(5 * 1024 * 1024), /^5 MB$/)
})

test('o mesmo arquivo (nome + tamanho) enviado de novo é ignorado', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('a', 'P-01.pdf'), arq('b', 'P-01.pdf')] })
  assert.equal(s.arquivos.length, 1)
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [arq('c', 'P-01.pdf'), arq('d', 'P-02.pdf')] })
  assert.deepEqual(s.arquivos.map(a => a.id), ['a', 'd'])
  // mesmo nome com outro tamanho é outro arquivo
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [{ ...arq('e', 'P-01.pdf'), tamanho: 2000 }] })
  assert.equal(s.arquivos.length, 3)
})

// ── Documentos individuais (fora de grupos) ───────────────────────────
import { ID_INDIVIDUAIS, idIndividual } from '../src/utils/assinaturas/grupos.js'

const pdf = (id, nome = `${id}.pdf`, tamanho = 10) => ({ id, nome, tamanho, arquivo: null })

test('adicionar como individuais: um grupo individual por arquivo, com posição própria', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('a', 'Planta 1.pdf'), pdf('b', 'Planta 2.PDF')], grupoId: ID_INDIVIDUAIS })
  const ind = s.grupos.filter(g => g.individual)
  assert.equal(ind.length, 2)
  assert.deepEqual(ind.map(g => g.nome), ['Planta 1', 'Planta 2'])
  assert.equal(s.arquivos.find(a => a.id === 'a').grupoId, idIndividual('a'))
  s = reducer(s, { type: 'DEFINIR_CAMPO', id: idIndividual('a'), campo: { dxMm: 99 } })
  assert.equal(s.grupos.find(g => g.id === idIndividual('a')).campo.dxMm, 99)
  assert.notEqual(s.grupos.find(g => g.id === idIndividual('b')).campo.dxMm, 99, 'o outro não muda')
  assert.notEqual(s.grupos.find(g => g.id === 'g1').campo.dxMm, 99, 'o grupo também não')
  assert.equal(s.grupos.filter(g => !g.individual).length, 1)
})

test('tirar arquivos de um grupo os torna individuais, herdando a posição do grupo', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('a'), pdf('b'), pdf('c')], grupoId: 'g1' })
  s = reducer(s, { type: 'DEFINIR_CAMPO', id: 'g1', campo: { dxMm: 33 } })
  s = reducer(s, { type: 'MOVER_ARQUIVOS', ids: ['a', 'b'], grupoId: ID_INDIVIDUAIS })
  assert.equal(s.arquivos.find(a => a.id === 'c').grupoId, 'g1')
  assert.equal(s.arquivos.find(a => a.id === 'a').grupoId, idIndividual('a'))
  assert.equal(s.grupos.find(g => g.id === idIndividual('a')).campo.dxMm, 33)
  // já individual: mover de novo não duplica
  assert.equal(reducer(s, { type: 'MOVER_ARQUIVOS', ids: ['a'], grupoId: ID_INDIVIDUAIS }), s)
})

test('um individual que entra num grupo deixa de ser individual (o grupo dele some)', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('a')], grupoId: ID_INDIVIDUAIS })
  assert.equal(s.grupoAtivoId, idIndividual('a'))
  s = reducer(s, { type: 'MOVER_ARQUIVOS', ids: ['a'], grupoId: 'g1' })
  assert.equal(s.grupos.some(g => g.individual), false)
  assert.equal(s.arquivos[0].grupoId, 'g1')
  assert.equal(s.grupoAtivoId, 'g1', 'o grupo ativo que sumiu volta ao primeiro normal')
})

test('grupos individuais não recebem arquivos; remover o individual remove o arquivo', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('a'), pdf('b')], grupoId: 'g1' })
  s = reducer(s, { type: 'MOVER_ARQUIVOS', ids: ['a'], grupoId: ID_INDIVIDUAIS })
  assert.equal(reducer(s, { type: 'MOVER_ARQUIVOS', ids: ['b'], grupoId: idIndividual('a') }), s, 'mover para individual é ignorado')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('c')], grupoId: idIndividual('a') })
  assert.equal(s.arquivos.find(a => a.id === 'c').grupoId, 'g1', 'cai no primeiro grupo normal')
  s = reducer(s, { type: 'REMOVER_GRUPO', id: idIndividual('a') })
  assert.equal(s.arquivos.some(a => a.id === 'a'), false)
  assert.equal(s.grupos.some(g => g.individual), false)
})

test('remover arquivo individual remove o grupo dele; o último grupo normal não pode ser removido', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('a')], grupoId: ID_INDIVIDUAIS })
  assert.equal(reducer(s, { type: 'REMOVER_GRUPO', id: 'g1' }), s, 'só há um normal: fica (individuais não contam)')
  s = reducer(s, { type: 'REMOVER_ARQUIVOS', ids: ['a'] })
  assert.equal(s.grupos.length, 1)
  assert.equal(s.grupoAtivoId, 'g1')
})

test('renomear não afeta individuais; remover grupo normal leva arquivos ao normal vizinho', () => {
  let s = estadoInicial('g1')
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('a')], grupoId: ID_INDIVIDUAIS })
  assert.equal(reducer(s, { type: 'RENOMEAR_GRUPO', id: idIndividual('a'), nome: 'X' }), s)
  s = reducer(s, { type: 'CRIAR_GRUPO', id: 'g2' })
  s = reducer(s, { type: 'ADICIONAR_ARQUIVOS', arquivos: [pdf('b')], grupoId: 'g2' })
  s = reducer(s, { type: 'REMOVER_GRUPO', id: 'g2' })
  assert.equal(s.arquivos.find(a => a.id === 'b').grupoId, 'g1')
})
