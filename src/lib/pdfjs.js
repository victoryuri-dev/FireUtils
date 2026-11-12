// lib/pdfjs.js — pdf.js configurado para a ferramenta de assinaturas.
//
// Todo o processamento é local: o PDF é lido do File do navegador e nunca sai
// da máquina. O worker é empacotado pelo Vite (sem CDN).

import * as pdfjs from 'pdfjs-dist'
import { detectarMoldura, margensEmPt } from '../utils/assinaturas/moldura'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// File -> Promise<PDFDocumentProxy>. Um PDF aberto é reaproveitado entre o
// visualizador e as miniaturas.
const abertos = new WeakMap()

export function carregarPdf(arquivo) {
  let promessa = abertos.get(arquivo)
  if (!promessa) {
    promessa = arquivo.arrayBuffer().then(data => pdfjs.getDocument({ data: new Uint8Array(data) }).promise)
    // Falha de leitura (PDF corrompido/protegido) não fica em cache: assim dá
    // para tentar de novo e o erro chega a quem pediu.
    promessa.catch(() => abertos.delete(arquivo))
    abertos.set(arquivo, promessa)
  }
  return promessa
}

/** Libera a memória de um PDF que saiu da lista. */
export function liberarPdf(arquivo) {
  const promessa = abertos.get(arquivo)
  if (!promessa) return
  abertos.delete(arquivo)
  promessa.then(doc => doc.destroy()).catch(() => {})
}

/**
 * Geometria de uma página no formato de utils/assinaturas/geometria.js:
 * caixa da página (CropBox ∩ MediaBox, sem rotação), em pontos, e /Rotate.
 */
export function geometriaDaPagina(pagina) {
  const [x1, y1, x2, y2] = pagina.view
  return { x0: x1, y0: y1, largura: x2 - x1, altura: y2 - y1, rotacao: pagina.rotate }
}

// Margens (pt, orientação visível) entre a borda da folha e a moldura do desenho, por página.
const molduras = new WeakMap()
const LADO_DETECCAO = 1600 // px do lado maior da imagem usada para achar a moldura

/**
 * Acha a moldura da página (ver utils/assinaturas/moldura.js). Nunca falha: sem moldura
 * achada (ou erro), devolve margens zero e o campo é medido a partir da borda da folha.
 * @returns {Promise<{ esq:number, dir:number, sup:number, inf:number }>}
 */
export function molduraDaPagina(pagina) {
  let promessa = molduras.get(pagina)
  if (!promessa) {
    promessa = (async () => {
      const base = pagina.getViewport({ scale: 1 })
      const escala = Math.min(LADO_DETECCAO / Math.max(base.width, base.height), 4)
      const viewport = pagina.getViewport({ scale: escala })
      const w = Math.max(1, Math.round(viewport.width))
      const h = Math.max(1, Math.round(viewport.height))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      await pagina.render({ canvas, viewport }).promise
      const { data } = canvas.getContext('2d').getImageData(0, 0, w, h)
      canvas.width = canvas.height = 0
      const lum = new Uint8Array(w * h)
      for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000
      return margensEmPt(detectarMoldura(lum, w, h), escala)
    })().catch(() => ({ esq: 0, dir: 0, sup: 0, inf: 0 }))
    molduras.set(pagina, promessa)
  }
  return promessa
}

/**
 * Desenha uma página (já girada, como o usuário a vê) num canvas, com
 * `larguraPx` pixels de largura CSS. Devolve a tarefa de renderização, que
 * pode ser cancelada com `.cancel()`.
 */
export function desenharPagina(pagina, canvas, larguraPx, dpr = globalThis.devicePixelRatio || 1) {
  const base = pagina.getViewport({ scale: 1 })
  const escala = larguraPx / base.width
  const viewport = pagina.getViewport({ scale: escala * dpr })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${larguraPx}px`
  canvas.style.height = `${Math.round((base.height * larguraPx) / base.width)}px`
  return pagina.render({ canvas, viewport })
}
