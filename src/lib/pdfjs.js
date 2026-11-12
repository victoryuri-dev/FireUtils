// lib/pdfjs.js — pdf.js configurado para a ferramenta de assinaturas.
//
// Todo o processamento é local: o PDF é lido do File do navegador e nunca sai
// da máquina. O worker é empacotado pelo Vite (sem CDN).

import * as pdfjs from 'pdfjs-dist'
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
