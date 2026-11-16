// lib/documentoPdf.js — PDF de um documento da plataforma, para ser assinado digitalmente.
//
// O "Imprimir / Salvar PDF" do navegador não entrega o arquivo ao site, e sem os bytes do PDF não
// há como assinar. Aqui o PDF é montado a partir das folhas que já estão na tela (as mesmas que
// saem na impressão): cada folha vira uma imagem de página A4 (fiel ao que se vê) e, por cima,
// uma camada de TEXTO INVISÍVEL na posição de cada palavra, para o PDF continuar pesquisável e
// com texto selecionável. A posição da assinatura digital é medida na própria folha (acima da
// linha de assinatura do responsável técnico), então vale para qualquer documento.

import { PDFDocument, StandardFonts, PDFString, PDFNumber, PDFOperator, PDFOperatorNames as Ops } from 'pdf-lib'
import { larguraDoTexto, winAnsi } from '../utils/assinaturas/seloLayout.js'

const LARGURA_MM = 210
const ALTURA_MM = 297
const PT_POR_MM = 72 / 25.4
const PX_POR_MM = 96 / 25.4

/** Campo de assinatura: tamanho em mm e folga entre o campo e a linha de assinatura. */
export const CAMPO_DOCUMENTO = Object.freeze({ larguraMm: 70, alturaMm: 18, folgaMm: 1.5 })

// Pixels CSS de uma folha A4 (sem zoom): o tamanho usado para desenhar a imagem de cada página.
const largPx = LARGURA_MM * PX_POR_MM
const altPx = ALTURA_MM * PX_POR_MM

const visivel = el => {
  if (!el.isConnected) return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  return el.getClientRects().length > 0
}

/**
 * Entre os blocos de assinatura achados, o que tem a linha de assinatura (borda superior). Se o bloco
 * foi partido entre folhas, vale o pedaço com a linha; senão o último.
 * @param {HTMLElement[]} blocos
 */
export function escolherBlocoDeAssinatura(blocos) {
  return blocos.find(b => temLinha(b)) ?? blocos[blocos.length - 1] ?? null
}

const temLinha = bloco => [bloco, ...bloco.querySelectorAll('*')].some(el => parseFloat(getComputedStyle(el).borderTopWidth) > 0)

/** Linha de assinatura dentro de `bloco`: o 1º elemento com borda superior (ou o próprio bloco). */
function linhaDaAssinatura(bloco) {
  const candidatos = [bloco, ...bloco.querySelectorAll('*')]
  return candidatos.find(el => parseFloat(getComputedStyle(el).borderTopWidth) > 0) ?? bloco
}

/**
 * Onde fica o campo de assinatura digital numa folha: logo ACIMA da linha de assinatura do
 * responsável técnico, centralizado nela (largura = a da linha, no máximo a do campo padrão).
 * @param {HTMLElement} folha   elemento da folha (mede-se em proporção, então o zoom da tela não importa)
 * @param {HTMLElement} bloco   bloco da assinatura dentro da folha
 * @returns {{ dxMm:number, dyMm:number, larguraMm:number, alturaMm:number }} a partir do canto superior esquerdo
 */
export function campoAcimaDaAssinatura(folha, bloco, tamanho = CAMPO_DOCUMENTO) {
  const f = folha.getBoundingClientRect()
  const linha = linhaDaAssinatura(bloco).getBoundingClientRect()
  const mm = v => (v / f.width) * LARGURA_MM
  const larguraLinhaMm = mm(linha.width)
  const larguraMm = Math.min(tamanho.larguraMm, Math.max(40, larguraLinhaMm))
  const centroMm = mm(linha.left - f.left) + larguraLinhaMm / 2
  const baseMm = mm(linha.top - f.top) - tamanho.folgaMm
  const dxMm = Math.min(Math.max(centroMm - larguraMm / 2, 5), LARGURA_MM - larguraMm - 5)
  const dyMm = Math.max(baseMm - tamanho.alturaMm, 5)
  const r = v => Math.round(v * 10) / 10
  return { dxMm: r(dxMm), dyMm: r(dyMm), larguraMm: r(larguraMm), alturaMm: tamanho.alturaMm }
}

// Palavras da folha com a posição (em proporção da folha), para a camada de texto invisível.
function palavrasDaFolha(folha) {
  const f = folha.getBoundingClientRect()
  const saida = []
  const andador = document.createTreeWalker(folha, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let no = andador.nextNode(); no; no = andador.nextNode()) {
    const pai = no.parentElement
    if (!pai || !no.data.trim() || ['SCRIPT', 'STYLE'].includes(pai.tagName) || !visivel(pai)) continue
    const maiuscula = getComputedStyle(pai).textTransform === 'uppercase'
    const negrito = Number(getComputedStyle(pai).fontWeight) >= 600
    for (const m of no.data.matchAll(/\S+/g)) {
      range.setStart(no, m.index)
      range.setEnd(no, m.index + m[0].length)
      const r = range.getBoundingClientRect()
      if (!r.width || !r.height) continue
      saida.push({
        texto: maiuscula ? m[0].toUpperCase() : m[0],
        negrito,
        x: (r.left - f.left) / f.width,
        y: (r.top - f.top) / f.height,
        w: r.width / f.width,
        h: r.height / f.height,
      })
    }
  }
  return saida
}

// Desenha as palavras como texto invisível (modo de renderização 3), esticadas à largura medida.
function desenharTextoInvisivel(pagina, fontes, palavras) {
  const chaves = {
    normal: pagina.node.newFontDictionary(fontes.normal.name, fontes.normal.ref),
    negrito: pagina.node.newFontDictionary(fontes.negrito.name, fontes.negrito.ref),
  }
  const op = (nome, args) => PDFOperator.of(Ops[nome], args)
  const num = n => PDFNumber.of(Number(n.toFixed(3)))
  const larg = LARGURA_MM * PT_POR_MM
  const alt = ALTURA_MM * PT_POR_MM
  const ops = [op('BeginText'), op('SetTextRenderingMode', [PDFNumber.of(3)])]
  for (const p of palavras) {
    const texto = winAnsi(p.texto.replace(/[\u2013\u2014]/g, '-').replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u2022/g, '*'))
    const fonte = p.negrito ? 'negrito' : 'normal'
    const tamanho = Math.max(2, p.h * alt * 0.8)
    const natural = larguraDoTexto(fonte, texto, tamanho)
    if (!natural) continue
    const aperto = Math.min(400, Math.max(20, (p.w * larg / natural) * 100))
    const x = p.x * larg
    const base = alt - (p.y + p.h * 0.8) * alt // linha de base aproximada
    ops.push(
      op('SetFontAndSize', [chaves[fonte], num(tamanho)]),
      op('SetTextHorizontalScaling', [num(aperto)]),
      op('MoveText', [num(x), num(base)]),
      op('ShowText', [PDFString.of(texto.replace(/[\\()]/g, '\\$&'))]),
      op('SetTextMatrix', [num(1), num(0), num(0), num(1), num(0), num(0)]),
    )
  }
  ops.push(op('EndText'))
  pagina.pushOperators(...ops)
}

/**
 * Monta o PDF (A4) das folhas dadas.
 * @param {HTMLElement[]} folhas  elementos das folhas, em ordem
 * @param {{ escala?: number, qualidade?: number, aoProgresso?: (feito:number, total:number)=>void }} [opcoes]
 * @returns {Promise<Uint8Array>}
 */
export async function folhasParaPdf(folhas, { escala = 2, qualidade = 0.92, aoProgresso } = {}) {
  const { toCanvas } = await import('html-to-image')
  const pdf = await PDFDocument.create()
  const fontes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  for (let i = 0; i < folhas.length; i++) {
    aoProgresso?.(i, folhas.length)
    const folha = folhas[i]
    // O texto invisível é medido ANTES de desenhar a imagem (a mesma folha, no mesmo estado).
    const palavras = palavrasDaFolha(folha)
    const canvas = await toCanvas(folha, {
      pixelRatio: escala,
      width: largPx,
      height: altPx,
      backgroundColor: '#ffffff',
      // A tela mostra a folha com sombra, zoom e posição de preview: aqui ela é desenhada limpa, em 100%.
      style: { zoom: '1', transform: 'none', margin: '0', boxShadow: 'none', width: `${LARGURA_MM}mm`, height: `${ALTURA_MM}mm` },
    })
    const jpg = await pdf.embedJpg(await (await new Promise(r => canvas.toBlob(r, 'image/jpeg', qualidade))).arrayBuffer())
    canvas.width = canvas.height = 0
    const pagina = pdf.addPage([LARGURA_MM * PT_POR_MM, ALTURA_MM * PT_POR_MM])
    pagina.drawImage(jpg, { x: 0, y: 0, width: pagina.getWidth(), height: pagina.getHeight() })
    desenharTextoInvisivel(pagina, fontes, palavras)
  }
  aoProgresso?.(folhas.length, folhas.length)
  pdf.setProducer('FireUtils')
  return pdf.save({ useObjectStreams: false })
}
