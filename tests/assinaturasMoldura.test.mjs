import test from 'node:test'
import assert from 'node:assert/strict'
import { detectarMoldura, margensEmPt } from '../src/utils/assinaturas/moldura.js'

// Folha w×h branca com uma moldura de linha de 2 px nas margens dadas e marcas de centro curtas.
function folha(w, h, { esq, dir, sup, inf }, extras = () => {}) {
  const lum = new Uint8Array(w * h).fill(255)
  const pinta = (x, y) => { lum[y * w + x] = 0 }
  for (let x = esq; x < w - dir; x++) for (const y of [sup, sup + 1, h - inf - 2, h - inf - 1]) pinta(x, y)
  for (let y = sup; y < h - inf; y++) for (const x of [esq, esq + 1, w - dir - 2, w - dir - 1]) pinta(x, y)
  extras(pinta)
  return lum
}

test('acha a moldura (centro da linha) em cada borda', () => {
  const r = detectarMoldura(folha(400, 300, { esq: 30, dir: 12, sup: 10, inf: 14 }), 400, 300)
  assert.ok(Math.abs(r.esq - 31) <= 1, `esq ${r.esq}`)
  assert.ok(Math.abs(r.dir - 13) <= 1, `dir ${r.dir}`)
  assert.ok(Math.abs(r.sup - 11) <= 1, `sup ${r.sup}`)
  assert.ok(Math.abs(r.inf - 15) <= 1, `inf ${r.inf}`)
})

test('marcas de centro que vão até a borda da folha não contam como moldura', () => {
  const lum = folha(400, 300, { esq: 30, dir: 12, sup: 10, inf: 14 }, pinta => {
    for (let y = 0; y < 30; y++) pinta(200, y)          // marca no topo
    for (let x = 0; x < 40; x++) pinta(x, 150)          // marca à esquerda
  })
  const r = detectarMoldura(lum, 400, 300)
  assert.ok(Math.abs(r.sup - 11) <= 1)
  assert.ok(Math.abs(r.esq - 31) <= 1)
})

test('com moldura dupla (corte + moldura) vale a mais interna', () => {
  const lum = folha(400, 300, { esq: 30, dir: 12, sup: 10, inf: 14 }, pinta => {
    for (let x = 0; x < 400; x++) { pinta(x, 0); pinta(x, 299) }
  })
  const r = detectarMoldura(lum, 400, 300)
  assert.ok(Math.abs(r.sup - 11) <= 1)
  assert.ok(Math.abs(r.inf - 15) <= 1)
})

test('folha sem moldura: nada achado e margens zero', () => {
  const lum = new Uint8Array(400 * 300).fill(255)
  for (let x = 50; x < 150; x++) lum[20 * 400 + x] = 0 // um traço curto
  const r = detectarMoldura(lum, 400, 300)
  assert.deepEqual(r, { esq: null, dir: null, sup: null, inf: null })
  assert.deepEqual(margensEmPt(r, 2), { esq: 0, dir: 0, sup: 0, inf: 0 })
})

test('faixa larga e cheia (barra de título) não é moldura', () => {
  const lum = new Uint8Array(400 * 300).fill(255)
  for (let y = 5; y < 30; y++) for (let x = 0; x < 400; x++) lum[y * 400 + x] = 0
  assert.equal(detectarMoldura(lum, 400, 300).sup, null)
})

test('margensEmPt converte px em pt', () => {
  assert.deepEqual(margensEmPt({ esq: 20, dir: 10, sup: null, inf: 5 }, 2), { esq: 10, dir: 5, sup: 0, inf: 2.5 })
})
