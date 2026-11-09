import test from 'node:test'
import assert from 'node:assert/strict'
import { situacaoLicenca, temAcesso } from '../src/hooks/useLicencas.js'

const hoje = new Date(2026, 9, 14, 12)
const base = {
  plano: 'Anual',
  situacao: 'ativa',
  inicio_em: '2026-01-01',
  expira_em: '2026-12-31',
}

test('licença ativa dentro da vigência libera acesso', () => {
  assert.equal(situacaoLicenca(base, hoje).valida, true)
  assert.equal(temAcesso({ memorial: base }, 'memorial', hoje), true)
})

test('conta sem licença não recebe acesso', () => {
  assert.equal(temAcesso({}, undefined, hoje), false)
  assert.equal(temAcesso({}, 'memorial', hoje), false)
})

test('licenças futuras, expiradas e com situação desconhecida são bloqueadas', () => {
  assert.equal(situacaoLicenca({ ...base, inicio_em: '2026-10-15' }, hoje).valida, false)
  assert.equal(situacaoLicenca({ ...base, expira_em: '2026-10-13' }, hoje).valida, false)
  assert.equal(situacaoLicenca({ ...base, situacao: 'pendente' }, hoje).valida, false)
})

test('licença PRO válida libera os módulos incluídos', () => {
  assert.equal(temAcesso({ pro: base }, 'memorial', hoje), true)
  assert.equal(temAcesso({ pro: base }, 'hidrantes', hoje), true)
  assert.equal(temAcesso({ pro: base }, 'saidas', hoje), true)
})

test('suspensão do PRO bloqueia todos os módulos', () => {
  const suspensa = { ...base, situacao: 'suspensa' }
  assert.equal(temAcesso({ pro: suspensa }, 'memorial', hoje), false)
  assert.equal(temAcesso({ pro: suspensa }, undefined, hoje), false)
})

test('módulo Assinaturas: licença própria ou PRO libera; outro módulo não', () => {
  assert.equal(temAcesso({ assinaturas: base }, 'assinaturas', hoje), true)
  assert.equal(temAcesso({ pro: base }, 'assinaturas', hoje), true)
  assert.equal(temAcesso({ memorial: base }, 'assinaturas', hoje), false)
  assert.equal(temAcesso({}, 'assinaturas', hoje), false)
})
