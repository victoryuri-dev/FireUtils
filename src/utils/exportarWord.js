// exportarWord.js — salva o documento paginado (folhas do Paged.js já na
// tela) como .doc que o Word abre e edita: HTML no formato do Office, com os
// estilos calculados copiados em linha (o Word não lê as classes do app),
// linhas em flex/grid convertidas em tabelas (o Word não conhece flexbox) e
// uma quebra de página entre as folhas. Margens da folha medidas do Paged.js.

const PROPS_TEXTO = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'color', 'text-align',
  'text-decoration-line', 'line-height', 'text-indent', 'text-transform', 'vertical-align', 'white-space',
]
const PROPS_CAIXA = [
  'background-color',
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-right-width', 'border-right-style', 'border-right-color',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
  'border-left-width', 'border-left-style', 'border-left-color',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-bottom',
]
const PADRAO = {
  'background-color': ['rgba(0, 0, 0, 0)', 'transparent'],
  'text-decoration-line': ['none'], 'text-transform': ['none'], 'text-indent': ['0px'],
  'font-style': ['normal'], 'vertical-align': ['baseline'], 'white-space': ['normal'],
}
const IGNORAR = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'svg', 'SVG', 'BUTTON', 'INPUT'])

function estiloEmLinha(el, extra = '', { semCaixa = false } = {}) {
  const cs = getComputedStyle(el)
  const partes = []
  for (const p of [...PROPS_TEXTO, ...(semCaixa ? [] : PROPS_CAIXA)]) {
    const v = cs.getPropertyValue(p)
    if (!v || PADRAO[p]?.includes(v)) continue
    // Borda só do lado que tem traço.
    const lado = p.match(/^border-(top|right|bottom|left)-/)?.[1]
    if (lado && (cs.getPropertyValue(`border-${lado}-style`) === 'none' || cs.getPropertyValue(`border-${lado}-width`) === '0px')) continue
    if (/^(padding|margin)-/.test(p) && v === '0px') continue
    partes.push(`${p === 'text-decoration-line' ? 'text-decoration' : p}:${v}`)
  }
  return partes.join(';') + (extra ? `;${extra}` : '')
}

const visivel = el => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0
const filhosVisiveis = el => [...el.children].filter(c => !IGNORAR.has(c.tagName) && visivel(c))
const temTextoSolto = el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
const pct = (parte, todo) => `${Math.max(1, Math.round((parte / todo) * 1000) / 10)}%`

function celula(doc, conteudo, estilo, attrs = {}) {
  const td = doc.createElement('td')
  td.setAttribute('style', `vertical-align:top;${estilo}`)
  for (const [k, v] of Object.entries(attrs)) td.setAttribute(k, v)
  td.appendChild(conteudo)
  return td
}

function tabelaVazia(doc, el) {
  const t = doc.createElement('table')
  t.setAttribute('cellspacing', '0')
  t.setAttribute('cellpadding', '0')
  t.setAttribute('style', `border-collapse:collapse;width:100%;${estiloEmLinha(el)}`)
  return t
}

// Item de linha flex/grid virando célula: a borda/fundo/padding do item vão
// para a célula (o Word não desenha borda em <span>); o conteúdo, dentro.
function itemEmCelula(doc, f, largura, attrs) {
  const cs = getComputedStyle(f)
  const vira = ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row')) || cs.display.endsWith('grid')
  if (vira || f.tagName === 'IMG' || f.tagName === 'TABLE') return celula(doc, converter(doc, f), largura, attrs)
  const conteudo = doc.createElement('div')
  conteudo.setAttribute('style', estiloEmLinha(f, '', { semCaixa: true }))
  for (const n of f.childNodes) conteudo.appendChild(converter(doc, n))
  const centro = cs.justifyContent === 'center' || cs.alignItems === 'center' && cs.flexDirection.startsWith('column') ? ';text-align:center' : ''
  return celula(doc, conteudo, `${largura}${estiloEmLinha(f)}${centro}`, attrs)
}

// Linha em flex → tabela de uma linha, larguras proporcionais às medidas.
function flexEmTabela(doc, el, filhos) {
  const total = el.getBoundingClientRect().width || 1
  const t = tabelaVazia(doc, el)
  const tr = t.insertRow()
  for (const f of filhos) tr.appendChild(itemEmCelula(doc, f, `width:${pct(f.getBoundingClientRect().width, total)};`))
  return t
}

// Grid → tabela montada pelas posições na tela (colspan/rowspan pelas bordas).
function gridEmTabela(doc, el, filhos) {
  const r = el.getBoundingClientRect()
  const arred = v => Math.round(v)
  const rects = filhos.map(f => f.getBoundingClientRect())
  const xs = [...new Set(rects.flatMap(q => [arred(q.left), arred(q.right)]))].sort((a, b) => a - b)
  const ys = [...new Set(rects.flatMap(q => [arred(q.top), arred(q.bottom)]))].sort((a, b) => a - b)
  const ix = v => xs.indexOf(arred(v)), iy = v => ys.indexOf(arred(v))
  const ocupado = new Set()
  const inicio = new Map()
  filhos.forEach((f, i) => {
    const q = rects[i]
    const c0 = ix(q.left), c1 = ix(q.right), r0 = iy(q.top), r1 = iy(q.bottom)
    inicio.set(`${r0},${c0}`, { f, cs: c1 - c0, rs: r1 - r0 })
    for (let a = r0; a < r1; a++) for (let b = c0; b < c1; b++) ocupado.add(`${a},${b}`)
  })
  const t = tabelaVazia(doc, el)
  for (let a = 0; a < ys.length - 1; a++) {
    const tr = t.insertRow()
    for (let b = 0; b < xs.length - 1; b++) {
      const item = inicio.get(`${a},${b}`)
      if (item) {
        const attrs = {}
        if (item.cs > 1) attrs.colspan = item.cs
        if (item.rs > 1) attrs.rowspan = item.rs
        const largura = a === 0 ? `width:${pct(xs[b + item.cs] - xs[b], r.width || 1)};` : ''
        tr.appendChild(itemEmCelula(doc, item.f, largura, attrs))
      } else if (!ocupado.has(`${a},${b}`)) {
        tr.appendChild(celula(doc, doc.createTextNode(''), ''))
      }
    }
  }
  return t
}

// Cópia do nó para o documento do Word, com os estilos em linha.
function converter(doc, no) {
  if (no.nodeType === Node.TEXT_NODE) return doc.createTextNode(no.textContent)
  if (no.nodeType !== Node.ELEMENT_NODE || IGNORAR.has(no.tagName) || !visivel(no)) return doc.createTextNode('')
  const cs = getComputedStyle(no)
  const filhos = filhosVisiveis(no)

  if (no.tagName === 'IMG') {
    const img = doc.createElement('img')
    const q = no.getBoundingClientRect(), base = no.closest('.pagedjs_page_content')?.getBoundingClientRect().width || q.width
    img.setAttribute('src', no.src)
    img.setAttribute('style', `width:${pct(q.width, base)}`)
    return img
  }
  if (no.tagName === 'BR') return doc.createElement('br')

  const ehFlex = cs.display === 'flex' || cs.display === 'inline-flex'
  if (ehFlex && cs.flexDirection.startsWith('row') && filhos.length > 1 && !temTextoSolto(no)) {
    const ordenados = cs.flexDirection === 'row-reverse' ? [...filhos].reverse() : filhos
    return flexEmTabela(doc, no, ordenados)
  }
  if ((cs.display === 'grid' || cs.display === 'inline-grid') && filhos.length > 1 && !temTextoSolto(no)) {
    return gridEmTabela(doc, no, filhos)
  }

  const tag = /^(TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|P|UL|OL|LI|H[1-6]|STRONG|B|EM|I|U|SPAN|A|SUB|SUP|COL|COLGROUP|CAPTION)$/.test(no.tagName)
    ? no.tagName.toLowerCase()
    : (cs.display.startsWith('inline') ? 'span' : 'div')
  const el = doc.createElement(tag)
  for (const a of ['colspan', 'rowspan']) if (no.hasAttribute(a)) el.setAttribute(a, no.getAttribute(a))
  // Largura de colunas vem do style em linha (o computado seria em px).
  if (tag === 'col' && no.style.width) el.setAttribute('width', no.style.width)
  let extra = ''
  if (tag === 'table') {
    el.setAttribute('cellspacing', '0')
    const pai = no.parentElement?.getBoundingClientRect().width || 1
    extra = `border-collapse:collapse;width:${pct(no.getBoundingClientRect().width, pai)}`
  }
  // Tabela de layout fixo (ex.: Anexo B, com <colgroup>): a largura de cada
  // coluna vem do que o navegador renderizou. Sem a largura em cada célula o
  // Word redistribui as colunas pelo conteúdo e a tabela desanda.
  if (tag === 'table' && cs.tableLayout === 'fixed') extra += ';table-layout:fixed'
  if ((tag === 'td' || tag === 'th') && no.closest('table') && getComputedStyle(no.closest('table')).tableLayout === 'fixed') {
    const larguraTabela = no.closest('table').getBoundingClientRect().width || 1
    const w = pct(no.getBoundingClientRect().width, larguraTabela)
    el.setAttribute('width', w)
    extra += `;width:${w}`
  }
  // Coluna em flex centralizada (ex.: assinatura): centraliza o texto.
  if (ehFlex && cs.flexDirection.startsWith('column') && cs.alignItems === 'center') extra += ';text-align:center'
  el.setAttribute('style', estiloEmLinha(no, extra))
  for (const filho of no.childNodes) el.appendChild(converter(doc, filho))
  return el
}

function margensDaFolha(pagina) {
  const p = pagina.getBoundingClientRect()
  const a = pagina.querySelector('.pagedjs_page_content')?.getBoundingClientRect()
  if (!a || !p.width) return '25mm'
  const mm = px => `${Math.max(0, Math.round((px / p.width) * 210))}mm`
  return `${mm(a.top - p.top)} ${mm(p.right - a.right)} ${mm(p.bottom - a.bottom)} ${mm(a.left - p.left)}`
}

/** Nome do arquivo dos memoriais: "Memorial Descritivo PPCI - {projeto}". */
export function nomeDocumentoMemorial(nomeProjeto) {
  const nome = (nomeProjeto || '').trim() || 'Sem nome'
  return `Memorial Descritivo PPCI - ${nome}`.replace(/[\\/:*?"<>|]+/g, '-')
}

function baixarDoc(corpo, nomeArquivo, margens) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${nomeArquivo}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: 21cm 29.7cm; margin: ${margens}; }
div.WordSection1 { page: WordSection1; }
body { font-family: Arial, sans-serif; }
table { border-collapse: collapse; }
p { margin: 0; }
</style></head><body>${corpo.outerHTML}</body></html>`
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeArquivo}.doc`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/** Gera e baixa o .doc a partir da área com as folhas paginadas. */
export function exportarWord(areaPaginada, nomeArquivo) {
  const paginas = [...(areaPaginada?.querySelectorAll('.pagedjs_page') || [])]
  if (!paginas.length) return false
  const doc = document.implementation.createHTMLDocument('')
  const corpo = doc.createElement('div')
  corpo.className = 'WordSection1'
  paginas.forEach((pagina, i) => {
    if (i > 0) {
      const br = doc.createElement('br')
      br.setAttribute('clear', 'all')
      br.setAttribute('style', 'page-break-before:always')
      corpo.appendChild(br)
    }
    const conteudo = pagina.querySelector('.pagedjs_page_content')
    if (conteudo) for (const filho of conteudo.childNodes) corpo.appendChild(converter(doc, filho))
  })
  return baixarDoc(corpo, nomeArquivo, margensDaFolha(paginas[0]))
}

/** Gera e baixa o .doc de um documento de uma folha só (sem Paged.js), como o
 *  Anexo B — converte o elemento na tela, com margens fixas. */
export function exportarWordElemento(elemento, nomeArquivo, margens = '20mm') {
  if (!elemento) return false
  const doc = document.implementation.createHTMLDocument('')
  const corpo = doc.createElement('div')
  corpo.className = 'WordSection1'
  corpo.appendChild(converter(doc, elemento))
  return baixarDoc(corpo, nomeArquivo, margens)
}

/** Nome do arquivo do Anexo B: "Anexo B - {projeto}". */
export function nomeDocumentoAnexoB(nomeProjeto) {
  const nome = (nomeProjeto || '').trim() || 'Sem nome'
  return `Anexo B - ${nome}`.replace(/[\\/:*?"<>|]+/g, '-')
}

/** Imprime com o título da aba trocado — o navegador usa ele como nome do PDF. */
export function imprimirComNome(nomeArquivo) {
  const anterior = document.title
  document.title = nomeArquivo
  const restaurar = () => { document.title = anterior; window.removeEventListener('afterprint', restaurar) }
  window.addEventListener('afterprint', restaurar)
  window.print()
}
