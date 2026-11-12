import test from 'node:test'
import assert from 'node:assert/strict'
import { cifrarTexto, decifrarTexto } from '../src/lib/senhaLocal.js'

const nova = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

test('cifra e decifra a senha (ida e volta), com acentos', async () => {
  const k = await nova()
  const c = await cifrarTexto(k, 'Sênha#123 ção')
  assert.equal(await decifrarTexto(k, c), 'Sênha#123 ção')
})

test('o texto cifrado não contém a senha e muda a cada vez (iv aleatório)', async () => {
  const k = await nova()
  const a = await cifrarTexto(k, 'teste123'), b = await cifrarTexto(k, 'teste123')
  assert.ok(!Buffer.from(a.dados).toString('latin1').includes('teste123'))
  assert.notDeepEqual(Array.from(a.dados), Array.from(b.dados))
})

test('outra chave ou dados adulterados não decifram', async () => {
  const k = await nova()
  const c = await cifrarTexto(k, 'teste123')
  await assert.rejects(decifrarTexto(await nova(), c))
  const ruim = { iv: c.iv, dados: c.dados.map((v, i) => (i === 0 ? v ^ 1 : v)) }
  await assert.rejects(decifrarTexto(k, ruim))
})

test('a chave gerada não é extraível', async () => {
  await assert.rejects(crypto.subtle.exportKey('raw', await nova()))
})
