import test from 'node:test'
import assert from 'node:assert/strict'
import {
  escalaDeAjuste, limitarEscala, percentual, layoutDoConteudo, pontoSobAncora, rolagemParaAncora,
  ESCALA_MAXIMA, PX_POR_PT_100, MARGEM_VISOR,
} from '../src/utils/assinaturas/zoom.js'

const A1 = { largura: 2383.94, altura: 1683.78 } // pt, paisagem

test('ajustar à tela: a folha inteira cabe na janela, com margem, pelo lado mais apertado', () => {
  const e = escalaDeAjuste(1600, 900, A1.largura, A1.altura)
  assert.ok(A1.largura * e <= 1600 - 2 * MARGEM_VISOR + 1e-6)
  assert.ok(A1.altura * e <= 900 - 2 * MARGEM_VISOR + 1e-6)
  assert.ok(Math.abs(A1.largura * e - (1600 - 2 * MARGEM_VISOR)) < 1e-6 || Math.abs(A1.altura * e - (900 - 2 * MARGEM_VISOR)) < 1e-6, 'encosta num dos lados')
  assert.ok(escalaDeAjuste(10, 10, 100, 100) > 0, 'nunca zero, mesmo com janela minúscula')
})

test('limites do zoom e percentual (100% = tamanho real a 96 dpi)', () => {
  assert.equal(limitarEscala(999, 0.5), ESCALA_MAXIMA)
  assert.equal(limitarEscala(0.01, 0.5), 0.25)
  assert.equal(limitarEscala(2, 0.5), 2)
  assert.equal(percentual(PX_POR_PT_100), 100)
  assert.equal(percentual(PX_POR_PT_100 * 2.5), 250)
})

test('folha menor que a janela fica centralizada; maior ganha margem e rolagem', () => {
  const pequena = layoutDoConteudo(1000, 800, 400, 300)
  assert.deepEqual([pequena.W, pequena.H, pequena.ox, pequena.oy], [1000, 800, 300, 250])
  const grande = layoutDoConteudo(1000, 800, 3000, 2000)
  assert.equal(grande.W, 3000 + 2 * MARGEM_VISOR); assert.equal(grande.ox, MARGEM_VISOR)
  assert.equal(grande.H, 2000 + 2 * MARGEM_VISOR); assert.equal(grande.oy, MARGEM_VISOR)
})

test('zoom ancorado: o ponto da folha sob o mouse continua sob o mouse depois do zoom', () => {
  const janela = { w: 1600, h: 900 }
  for (const [escalaAntes, escalaDepois, scrollLeft, scrollTop, ancoraX, ancoraY] of [
    [0.4, 1.0, 0, 0, 800, 450], [1.0, 3.0, 640, 410, 1200, 200], [3.0, 1.0, 5000, 3000, 100, 800], [0.3, 12, 0, 0, 10, 10],
  ]) {
    const antes = layoutDoConteudo(janela.w, janela.h, A1.largura * escalaAntes, A1.altura * escalaAntes)
    const ponto = pontoSobAncora({ scrollLeft, scrollTop, ancoraX, ancoraY, escala: escalaAntes, layout: antes })
    const { left, top } = rolagemParaAncora({
      ...ponto, escala: escalaDepois, larguraJanela: janela.w, alturaJanela: janela.h, larguraPt: A1.largura, alturaPt: A1.altura, ancoraX, ancoraY,
    })
    // O ponto da folha que está em (ancoraX, ancoraY) depois do zoom é o mesmo de antes.
    const depois = layoutDoConteudo(janela.w, janela.h, A1.largura * escalaDepois, A1.altura * escalaDepois)
    const verifica = pontoSobAncora({ scrollLeft: left, scrollTop: top, ancoraX, ancoraY, escala: escalaDepois, layout: depois })
    assert.ok(Math.abs(verifica.ptX - ponto.ptX) < 1e-6 && Math.abs(verifica.ptY - ponto.ptY) < 1e-6, `zoom ${escalaAntes} -> ${escalaDepois}`)
  }
})
