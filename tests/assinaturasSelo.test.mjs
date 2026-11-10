import test from 'node:test'
import assert from 'node:assert/strict'
import { SELO_PADRAO, normalizarSelo, MAX_TEXTO_EXTRA } from '../src/utils/assinaturas/selo.js'
import { estadoInicial, reducer } from '../src/utils/assinaturas/grupos.js'

test('o padrão é o estilo Adobe Acrobat, com tudo visível', () => {
  assert.equal(SELO_PADRAO.estilo, 'adobe')
  assert.deepEqual(normalizarSelo(undefined), normalizarSelo({}))
  assert.deepEqual(normalizarSelo({}), { ...SELO_PADRAO })
})

test('valores inválidos voltam ao padrão; válidos são mantidos', () => {
  const s = normalizarSelo({ estilo: 'xyz', alinhamento: 'direita', mostrarData: 0, borda: false })
  assert.equal(s.estilo, 'adobe')
  assert.equal(s.alinhamento, 'esquerda')
  assert.equal(s.mostrarData, true, 'só `false` desliga')
  assert.equal(s.borda, false)
  assert.equal(normalizarSelo({ estilo: 'simples' }).estilo, 'simples')
})

test('o tamanho do texto não é opção: qualquer `fonte` recebida é ignorada', () => {
  assert.equal('fonte' in normalizarSelo({ fonte: 12 }), false)
  assert.equal('fonte' in SELO_PADRAO, false)
})

test('texto adicional: espaços normalizados e limite de tamanho', () => {
  assert.equal(normalizarSelo({ textoExtra: '  CREA   1234-MA \n' }).textoExtra, 'CREA 1234-MA')
  assert.equal(normalizarSelo({ textoExtra: 'x'.repeat(500) }).textoExtra.length, MAX_TEXTO_EXTRA)
  assert.equal(normalizarSelo({ textoExtra: null }).textoExtra, '')
})

test('grupos: novo grupo começa com o selo padrão, herda o do ativo e DEFINIR_SELO mescla', () => {
  let s = estadoInicial('g1')
  assert.deepEqual(s.grupos[0].selo, { ...SELO_PADRAO })
  s = reducer(s, { type: 'DEFINIR_SELO', id: 'g1', selo: { estilo: 'simples', textoExtra: 'CREA 1' } })
  assert.equal(s.grupos[0].selo.estilo, 'simples')
  assert.equal(s.grupos[0].selo.mostrarData, true, 'o resto não muda')
  s = reducer(s, { type: 'CRIAR_GRUPO', id: 'g2' })
  assert.equal(s.grupos[1].selo.textoExtra, 'CREA 1', 'herda do grupo ativo')
  s = reducer(s, { type: 'DEFINIR_SELO', id: 'g2', selo: { textoExtra: 'outro' } })
  assert.equal(s.grupos[0].selo.textoExtra, 'CREA 1', 'mexer no novo não altera o antigo')
})
