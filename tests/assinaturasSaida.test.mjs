import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, unzipSync } from 'fflate'
import { nomeDeArquivo, nomeDePasta } from '../src/utils/assinaturas/saida.js'

test('arquivo: mesmo nome do original, sem sufixo; repetido ganha (2), (3)', () => {
  const u = new Set()
  assert.equal(nomeDeArquivo('PR-01.pdf', u), 'PR-01.pdf')
  assert.equal(nomeDeArquivo('PR-01.PDF', u), 'PR-01 (2).pdf')
  assert.equal(nomeDeArquivo('pr-01.pdf', u), 'pr-01 (3).pdf')
})

test('pasta: usa o nome do grupo e troca caracteres inválidos', () => {
  const u = new Set()
  assert.equal(nomeDePasta('Pranchas A1', u), 'Pranchas A1')
  assert.equal(nomeDePasta('Plantas: 1/2 "teste"?', u), 'Plantas- 1-2 -teste--')
  assert.equal(nomeDePasta('  ..Memorial..  ', u), 'Memorial')
})

test('pasta: vazio, reservado e repetido', () => {
  const u = new Set()
  assert.equal(nomeDePasta('   ', u), 'Grupo')
  assert.equal(nomeDePasta('', u), 'Grupo (2)')
  assert.equal(nomeDePasta('CON', u), 'CON_')
  assert.equal(nomeDePasta('pranchas', u), 'pranchas')
  assert.equal(nomeDePasta('Pranchas', u), 'Pranchas (2)')
  assert.ok(nomeDePasta('x'.repeat(200), u).length <= 60)
})

test('ZIP com "pasta/arquivo" cria as pastas', () => {
  const zip = zipSync({ 'Grupo 1/a.pdf': [new Uint8Array([1]), { level: 0 }], 'Grupo 2/a.pdf': [new Uint8Array([2]), { level: 0 }] })
  assert.deepEqual(Object.keys(unzipSync(zip)).sort(), ['Grupo 1/a.pdf', 'Grupo 2/a.pdf'])
})
