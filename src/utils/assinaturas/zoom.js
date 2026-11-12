// utils/assinaturas/zoom.js — conta do zoom do visor maximizado da folha.
//
// A folha fica num "conteúdo" rolável: se ela é menor que a janela, fica centralizada;
// se é maior, o conteúdo cresce e a janela rola. `escala` é em pixels por ponto do PDF.

/** 100% = tamanho real a 96 dpi (1 pt = 96/72 px). */
export const PX_POR_PT_100 = 96 / 72
export const MARGEM_VISOR = 24
/** Zoom máximo: 12 px por ponto (~900%): 1 mm ocupa ~34 px na tela. */
export const ESCALA_MAXIMA = 12
export const FATOR_ZOOM = 1.25

/** Escala em que a folha inteira cabe na janela (com margem). */
export function escalaDeAjuste(larguraJanela, alturaJanela, larguraPt, alturaPt, margem = MARGEM_VISOR) {
  const e = Math.min((larguraJanela - 2 * margem) / larguraPt, (alturaJanela - 2 * margem) / alturaPt)
  return Math.max(e, 0.01)
}

/** Mantém o zoom entre metade do "ajustar à tela" e o máximo. */
export function limitarEscala(escala, ajuste) {
  return Math.min(ESCALA_MAXIMA, Math.max(ajuste * 0.5, escala))
}

/** Zoom como o usuário vê: 100% = tamanho real. */
export function percentual(escala) {
  return Math.round((escala / PX_POR_PT_100) * 100)
}

/**
 * Tamanho do conteúdo rolável e onde a folha começa dentro dele (origem da folha).
 * Folha menor que a janela: centralizada; maior: com margem e rolagem.
 */
export function layoutDoConteudo(larguraJanela, alturaJanela, larguraFolhaPx, alturaFolhaPx, margem = MARGEM_VISOR) {
  const W = Math.max(larguraJanela, larguraFolhaPx + 2 * margem)
  const H = Math.max(alturaJanela, alturaFolhaPx + 2 * margem)
  return { W, H, ox: (W - larguraFolhaPx) / 2, oy: (H - alturaFolhaPx) / 2 }
}

/** Ponto da folha (em pt) que está sob a posição `ancora` da janela (em px, relativa a ela). */
export function pontoSobAncora({ scrollLeft, scrollTop, ancoraX, ancoraY, escala, layout }) {
  return { ptX: (scrollLeft + ancoraX - layout.ox) / escala, ptY: (scrollTop + ancoraY - layout.oy) / escala }
}

/**
 * Rolagem que, na nova escala, deixa o ponto da folha (ptX, ptY) na mesma posição da
 * janela: é o que faz o zoom "puxar" para onde o mouse está.
 */
export function rolagemParaAncora({ ptX, ptY, escala, larguraJanela, alturaJanela, larguraPt, alturaPt, ancoraX, ancoraY }) {
  const l = layoutDoConteudo(larguraJanela, alturaJanela, larguraPt * escala, alturaPt * escala)
  return { left: l.ox + ptX * escala - ancoraX, top: l.oy + ptY * escala - ancoraY }
}

/**
 * Fator de zoom de um giro da roda (ou gesto de pinça): proporcional ao giro, então
 * giros pequenos dão zoom pequeno e contínuo. Uma "volta" de mouse (100) ≈ ×1,25.
 */
export function fatorDaRoda(deltaY, deltaMode = 0) {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  const limitado = Math.max(-120, Math.min(120, px))
  return Math.exp(-limitado * (Math.log(FATOR_ZOOM) / 100))
}
