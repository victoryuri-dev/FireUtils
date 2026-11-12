// utils/assinaturas/moldura.js — acha a moldura (margem) do desenho numa folha.
//
// Pranchas de tamanhos diferentes (A1, A0...) costumam ter margens diferentes entre a borda
// da folha e a moldura, e o carimbo é alinhado à MOLDURA. Medir o campo a partir da borda da
// folha faz o selo errar o lugar de uma folha para outra. Aqui a moldura é achada olhando a
// imagem da página: de cada borda para dentro, a primeira linha (horizontal ou vertical) que
// atravessa quase toda a folha. Marcas de centro e cortes ficam de fora por serem curtos.

/** Fração da folha, a partir de cada borda, onde se procura a moldura. */
export const FAIXA = 0.08
/** Uma linha só conta como moldura se cobrir ao menos esta fração da folha. */
export const COBERTURA_MINIMA = 0.6
/** Pixel "com tinta" quando a luminância (0–255) fica abaixo disto. */
export const LIMIAR_TINTA = 225

// Procura, em `n` linhas a partir da borda (índice 0), as linhas com cobertura suficiente,
// agrupa as vizinhas e devolve o centro do grupo MAIS INTERNO (distância da borda em px),
// ou null. `cobertura(i)` é a fração de tinta da linha i.
function acharLinha(n, cobertura, faixaPx, espessuraMax) {
  const grupos = []
  let atual = null
  for (let i = 0; i < Math.min(n, faixaPx); i++) {
    if (cobertura(i) >= COBERTURA_MINIMA) {
      if (atual && i - atual.fim <= 2) atual.fim = i
      else { atual = { ini: i, fim: i }; grupos.push(atual) }
    }
  }
  const validos = grupos.filter(g => g.fim - g.ini + 1 <= espessuraMax)
  if (!validos.length) return null
  const g = validos[validos.length - 1]
  return (g.ini + g.fim) / 2 + 0.5
}

/**
 * @param {Uint8Array|Uint8ClampedArray} lum luminância (0–255), `w`×`h`, linha a linha
 * @returns {{ esq:number|null, dir:number|null, sup:number|null, inf:number|null }} distâncias
 *          da borda da folha até a linha da moldura, em pixels (null = não achada)
 */
export function detectarMoldura(lum, w, h) {
  const linha = (y) => { let c = 0; const o = y * w; for (let x = 0; x < w; x++) if (lum[o + x] < LIMIAR_TINTA) c++; return c / w }
  const coluna = (x) => { let c = 0; for (let y = 0; y < h; y++) if (lum[y * w + x] < LIMIAR_TINTA) c++; return c / h }
  const fx = Math.max(3, Math.round(w * FAIXA))
  const fy = Math.max(3, Math.round(h * FAIXA))
  const ex = Math.max(4, Math.round(w * 0.015))
  const ey = Math.max(4, Math.round(h * 0.015))
  return {
    sup: acharLinha(h, i => linha(i), fy, ey),
    inf: acharLinha(h, i => linha(h - 1 - i), fy, ey),
    esq: acharLinha(w, i => coluna(i), fx, ex),
    dir: acharLinha(w, i => coluna(w - 1 - i), fx, ex),
  }
}

/** Margens em pt (null vira 0) a partir das distâncias em px e da escala (px por pt). */
export function margensEmPt(pxs, escala) {
  const pt = v => (v == null ? 0 : v / escala)
  return { esq: pt(pxs.esq), dir: pt(pxs.dir), sup: pt(pxs.sup), inf: pt(pxs.inf) }
}
