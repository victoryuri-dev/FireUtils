import test from 'node:test'
import assert from 'node:assert/strict'
import { SELO_PADRAO, normalizarSelo, MAX_TEXTO_EXTRA } from '../src/utils/assinaturas/selo.js'
import { estadoInicial, reducer } from '../src/utils/assinaturas/grupos.js'

test('o padrão mostra tudo e não tem opções de estilo nem de borda', () => {
  for (const k of ['estilo', 'alinhamento', 'borda']) assert.equal(k in SELO_PADRAO, false, k)
  assert.deepEqual(normalizarSelo(undefined), normalizarSelo({}))
  assert.deepEqual(normalizarSelo({}), { ...SELO_PADRAO })
})

test('valores inválidos voltam ao padrão; válidos são mantidos', () => {
  const s = normalizarSelo({ estilo: 'simples', alinhamento: 'centro', borda: true, mostrarData: 0, mostrarRotulo: false })
  assert.equal(s.mostrarData, true, 'só `false` desliga')
  assert.equal(s.mostrarRotulo, false)
  for (const k of ['estilo', 'alinhamento', 'borda']) assert.equal(k in s, false, `${k} ignorado`)
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
  s = reducer(s, { type: 'DEFINIR_SELO', id: 'g1', selo: { mostrarData: false, textoExtra: 'CREA 1' } })
  assert.equal(s.grupos[0].selo.mostrarData, false)
  assert.equal(s.grupos[0].selo.mostrarRotulo, true, 'o resto não muda')
  s = reducer(s, { type: 'CRIAR_GRUPO', id: 'g2' })
  assert.equal(s.grupos[1].selo.textoExtra, 'CREA 1', 'herda do grupo ativo')
  s = reducer(s, { type: 'DEFINIR_SELO', id: 'g2', selo: { textoExtra: 'outro' } })
  assert.equal(s.grupos[0].selo.textoExtra, 'CREA 1', 'mexer no novo não altera o antigo')
})
