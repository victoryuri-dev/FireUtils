import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mmParaPt, ptParaMm, normalizarRotacao, dimensoesVisiveis, retanguloVisivel,
  campoDoRetanguloVisivel, trocarAncora, trocarProporcional, retanguloPdf, indiceDaPagina, ANCORAS,
} from '../src/utils/assinaturas/geometria.js'

const perto = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a}`)

// A4 retrato em pontos
const A4 = { largura: 595.2756, altura: 841.8898, rotacao: 0 }
const campo = { ancora: 'inferior-direita', dxMm: 10, dyMm: 10, larguraMm: 60, alturaMm: 25 }

test('conversão mm <-> pt', () => {
  perto(mmParaPt(25.4), 72)
  perto(ptParaMm(72), 25.4)
})

test('rotação é normalizada para 0/90/180/270', () => {
  assert.equal(normalizarRotacao(0), 0)
  assert.equal(normalizarRotacao(90), 90)
  assert.equal(normalizarRotacao(-90), 270)
  assert.equal(normalizarRotacao(450), 90)
  assert.equal(normalizarRotacao(undefined), 0)
  assert.equal(normalizarRotacao(NaN), 0)
})

test('dimensões visíveis trocam largura e altura em 90/270', () => {
  assert.deepEqual(dimensoesVisiveis({ largura: 100, altura: 200, rotacao: 0 }), { largura: 100, altura: 200 })
  assert.deepEqual(dimensoesVisiveis({ largura: 100, altura: 200, rotacao: 90 }), { largura: 200, altura: 100 })
  assert.deepEqual(dimensoesVisiveis({ largura: 100, altura: 200, rotacao: 180 }), { largura: 100, altura: 200 })
  assert.deepEqual(dimensoesVisiveis({ largura: 100, altura: 200, rotacao: 270 }), { largura: 200, altura: 100 })
})

test('âncora inferior direita: o selo fica a 10 mm das bordas', () => {
  const r = retanguloVisivel(campo, A4)
  perto(r.x + r.largura, A4.largura - mmParaPt(10), 'borda direita')
  perto(r.y + r.altura, A4.altura - mmParaPt(10), 'borda inferior')
  perto(r.largura, mmParaPt(60))
  assert.equal(r.fora, false)
})

test('as quatro âncoras medem a partir do canto certo', () => {
  const esperado = {
    'superior-esquerda': { x: mmParaPt(10), y: mmParaPt(10) },
    'superior-direita': { x: A4.largura - mmParaPt(70), y: mmParaPt(10) },
    'inferior-esquerda': { x: mmParaPt(10), y: A4.altura - mmParaPt(35) },
    'inferior-direita': { x: A4.largura - mmParaPt(70), y: A4.altura - mmParaPt(35) },
  }
  for (const ancora of ANCORAS) {
    const r = retanguloVisivel({ ...campo, ancora }, A4)
    perto(r.x, esperado[ancora].x, `${ancora} x`)
    perto(r.y, esperado[ancora].y, `${ancora} y`)
  }
})

test('mesmo campo em A1 e A4: tamanho e distância da borda não mudam', () => {
  const A1 = { largura: 1683.78, altura: 2383.94, rotacao: 0 }
  const a = retanguloVisivel(campo, A4)
  const b = retanguloVisivel(campo, A1)
  perto(a.largura, b.largura)
  perto(A4.largura - (a.x + a.largura), A1.largura - (b.x + b.largura), 'distância da borda direita')
  perto(A4.altura - (a.y + a.altura), A1.altura - (b.y + b.altura), 'distância da borda inferior')
})

test('campo maior que a página é sinalizado como fora', () => {
  const pequena = { largura: 100, altura: 100, rotacao: 0 }
  assert.equal(retanguloVisivel(campo, pequena).fora, true)
})

test('campoDoRetanguloVisivel é o inverso de retanguloVisivel, em qualquer âncora e rotação', () => {
  for (const rotacao of [0, 90, 180, 270]) {
    for (const ancora of ANCORAS) {
      const pagina = { largura: 1200, altura: 800, rotacao }
      const c = { ancora, dxMm: 12.3, dyMm: 45.6, larguraMm: 70, alturaMm: 30 }
      const volta = campoDoRetanguloVisivel(retanguloVisivel(c, pagina), pagina, ancora)
      perto(volta.dxMm, c.dxMm, `${ancora}/${rotacao} dx`, 0.06)
      perto(volta.dyMm, c.dyMm, `${ancora}/${rotacao} dy`, 0.06)
      perto(volta.larguraMm, c.larguraMm, `${ancora}/${rotacao} largura`, 0.06)
      perto(volta.alturaMm, c.alturaMm, `${ancora}/${rotacao} altura`, 0.06)
    }
  }
})

test('trocar a âncora mantém o selo no mesmo lugar da página', () => {
  const pagina = { largura: 800, altura: 600, rotacao: 90 }
  const antes = retanguloVisivel(campo, pagina)
  const novo = trocarAncora(campo, pagina, 'superior-esquerda')
  assert.equal(novo.ancora, 'superior-esquerda')
  const depois = retanguloVisivel(novo, pagina)
  perto(depois.x, antes.x, 'x', 0.2)
  perto(depois.y, antes.y, 'y', 0.2)
})

// ── Espaço PDF ────────────────────────────────────────────────────────
// Casos conferidos à mão. Página 1000 x 500 pt (sem rotação), campo colado no
// canto inferior direito VISÍVEL, de 100 x 50 pt.
const colado = { ancora: 'inferior-direita', dxMm: 0, dyMm: 0, larguraMm: ptParaMm(100), alturaMm: ptParaMm(50) }

test('PDF sem rotação: canto inferior direito visível = inferior direito do PDF', () => {
  const r = retanguloPdf(colado, { largura: 1000, altura: 500, rotacao: 0 })
  perto(r.x, 900, 'x'); perto(r.y, 0, 'y'); perto(r.largura, 100); perto(r.altura, 50)
})

test('PDF girado 90°: o canto inferior direito visível é o canto superior direito do PDF', () => {
  // Vista: 500 x 1000. Selo 100 x 50 (largura x altura visíveis) no canto
  // inferior direito -> no PDF vira 50 x 100, encostado em (1000, 500).
  const r = retanguloPdf(colado, { largura: 1000, altura: 500, rotacao: 90 })
  perto(r.x, 950, 'x'); perto(r.y, 400, 'y'); perto(r.largura, 50); perto(r.altura, 100)
})

test('PDF girado 180°: o canto inferior direito visível é o superior esquerdo do PDF', () => {
  const r = retanguloPdf(colado, { largura: 1000, altura: 500, rotacao: 180 })
  perto(r.x, 0, 'x'); perto(r.y, 450, 'y'); perto(r.largura, 100); perto(r.altura, 50)
})

test('PDF girado 270°: o canto inferior direito visível é o inferior esquerdo do PDF', () => {
  const r = retanguloPdf(colado, { largura: 1000, altura: 500, rotacao: 270 })
  perto(r.x, 0, 'x'); perto(r.y, 0, 'y'); perto(r.largura, 50); perto(r.altura, 100)
})

test('o retângulo PDF, girado de volta, coincide com o visível (todas as rotações)', () => {
  // Mapa independente PDF -> visível, escrito a partir da definição de /Rotate.
  const paraVisivel = (px, py, w, h, rot) => ({
    0: [px, h - py], 90: [py, px], 180: [w - px, py], 270: [h - py, w - px],
  })[rot]
  for (const rotacao of [0, 90, 180, 270]) {
    const pagina = { largura: 1200, altura: 800, rotacao }
    const c = { ancora: 'superior-direita', dxMm: 15, dyMm: 22, larguraMm: 70, alturaMm: 30 }
    const vis = retanguloVisivel(c, pagina)
    const pdf = retanguloPdf(c, pagina)
    const cantos = [[pdf.x, pdf.y], [pdf.x + pdf.largura, pdf.y + pdf.altura]]
      .map(([px, py]) => paraVisivel(px, py, pagina.largura, pagina.altura, rotacao))
    const xs = cantos.map(p => p[0]); const ys = cantos.map(p => p[1])
    perto(Math.min(...xs), vis.x, `rot ${rotacao} x`)
    perto(Math.min(...ys), vis.y, `rot ${rotacao} y`)
    perto(Math.max(...xs), vis.x + vis.largura, `rot ${rotacao} x2`)
    perto(Math.max(...ys), vis.y + vis.altura, `rot ${rotacao} y2`)
  }
})

test('caixa da página com origem deslocada (MediaBox não começa em 0,0)', () => {
  const r = retanguloPdf(colado, { x0: 30, y0: 40, largura: 1000, altura: 500, rotacao: 0 })
  perto(r.x, 930, 'x'); perto(r.y, 40, 'y')
})

// ── Escolha da página ─────────────────────────────────────────────────
test('indiceDaPagina: última, primeira e número específico', () => {
  assert.equal(indiceDaPagina({ modo: 'ultima' }, 5), 4)
  assert.equal(indiceDaPagina({ modo: 'primeira' }, 5), 0)
  assert.equal(indiceDaPagina({ modo: 'numero', numero: 3 }, 5), 2)
  assert.equal(indiceDaPagina({ modo: 'numero', numero: 6 }, 5), -1)
  assert.equal(indiceDaPagina({ modo: 'numero', numero: 0 }, 5), -1)
  assert.equal(indiceDaPagina({ modo: 'ultima' }, 0), -1)
})

// ── Arrastar e redimensionar ──────────────────────────────────────────
import { moverRedimensionar } from '../src/utils/assinaturas/geometria.js'

const lim = { largura: 500, altura: 400 }
const ret = { x: 100, y: 100, largura: 80, altura: 40 }
const min = { largura: 20, altura: 10 }

test('mover desloca o retângulo e para na borda da página', () => {
  assert.deepEqual(moverRedimensionar(ret, 'mover', 10, -20, lim), { ...ret, x: 110, y: 80 })
  const a = moverRedimensionar(ret, 'mover', 9999, 9999, lim)
  assert.equal(a.x, 500 - 80); assert.equal(a.y, 400 - 40)
  const b = moverRedimensionar(ret, 'mover', -9999, -9999, lim)
  assert.equal(b.x, 0); assert.equal(b.y, 0)
})

test('redimensionar pelo canto sudeste aumenta largura e altura', () => {
  const r = moverRedimensionar(ret, 'se', 30, 15, lim, min)
  assert.deepEqual(r, { x: 100, y: 100, largura: 110, altura: 55 })
})

test('redimensionar pelo canto noroeste move a origem e mantém o canto oposto fixo', () => {
  const r = moverRedimensionar(ret, 'nw', -20, -10, lim, min)
  assert.deepEqual(r, { x: 80, y: 90, largura: 100, altura: 50 })
  assert.equal(r.x + r.largura, 180); assert.equal(r.y + r.altura, 140)
})

test('redimensionar respeita o tamanho mínimo e a página', () => {
  const pequeno = moverRedimensionar(ret, 'se', -9999, -9999, lim, min)
  assert.equal(pequeno.largura, 20); assert.equal(pequeno.altura, 10)
  const grande = moverRedimensionar(ret, 'se', 9999, 9999, lim, min)
  assert.equal(grande.x + grande.largura, 500); assert.equal(grande.y + grande.altura, 400)
  const nw = moverRedimensionar(ret, 'nw', 9999, 9999, lim, min)
  assert.equal(nw.largura, 20); assert.equal(nw.x + nw.largura, 180)
})

// ── Acompanhar o tamanho da folha ─────────────────────────────────────
test('proporcional: o mesmo campo cai no mesmo lugar relativo em A1 e A0', () => {
  const A1p = { largura: 1683.78, altura: 2383.94, rotacao: 0 }
  const A0p = { largura: 2383.94, altura: 3370.39, rotacao: 0 }
  const ret = { x: A1p.largura - 300 - 80, y: A1p.altura - 200 - 90, largura: 300, altura: 90 }
  const c = campoDoRetanguloVisivel(ret, A1p, 'inferior-direita')
  const a1 = retanguloVisivel(c, A1p)
  const a0 = retanguloVisivel(c, A0p)
  const k = Math.sqrt((A0p.largura * A0p.altura) / (A1p.largura * A1p.altura))
  perto(a1.x, ret.x, 'A1 x', 0.5)
  perto(a0.largura, a1.largura * k, 'largura', 0.5)
  perto(A0p.largura - (a0.x + a0.largura), (A1p.largura - (a1.x + a1.largura)) * k, 'borda direita', 0.5)
  perto(A0p.altura - (a0.y + a0.altura), (A1p.altura - (a1.y + a1.altura)) * k, 'borda inferior', 0.5)
  // proporção em relação à folha praticamente igual
  perto((A0p.largura - (a0.x + a0.largura)) / A0p.largura, (A1p.largura - (a1.x + a1.largura)) / A1p.largura, 'fração', 0.002)
})

test('proporcional desligado ou sem base: milímetros fixos', () => {
  const A1p = { largura: 1683.78, altura: 2383.94, rotacao: 0 }
  const A0p = { largura: 2383.94, altura: 3370.39, rotacao: 0 }
  const c = { ...campo, base: { largura: 1683.78, altura: 2383.94 } }
  perto(retanguloVisivel({ ...c, proporcional: false }, A0p).largura, mmParaPt(60))
  perto(retanguloVisivel(campo, A0p).largura, mmParaPt(60))
  perto(retanguloVisivel(c, A1p).largura, mmParaPt(60))
})

test('trocarProporcional não move o campo na folha mostrada', () => {
  const pagina = { largura: 2383.94, altura: 3370.39, rotacao: 0 }
  const c = { ...campo, base: { largura: 1683.78, altura: 2383.94 }, proporcional: true }
  const antes = retanguloVisivel(c, pagina)
  const novo = trocarProporcional(c, pagina, false)
  const depois = retanguloVisivel(novo, pagina)
  for (const k of ['x', 'y', 'largura', 'altura']) perto(depois[k], antes[k], k, 0.3)
})
