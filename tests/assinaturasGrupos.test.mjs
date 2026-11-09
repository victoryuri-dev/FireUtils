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

test('renomear ignora nome vazio; página do grupo é mesclada', () => {
  let s = estadoInicial('g1')
  assert.equal(reducer(s, { type: 'RENOMEAR_GRUPO', id: 'g1', nome: '   ' }), s)
  s = reducer(s, { type: 'RENOMEAR_GRUPO', id: 'g1', nome: ' Pranchas A1 ' })
  assert.equal(s.grupos[0].nome, 'Pranchas A1')
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
