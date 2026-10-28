// ooxml.js — peças de WordprocessingML (o XML de dentro do .docx) para gerar
// documentos do Word de verdade a partir dos dados do memorial: texto,
// parágrafos, tabelas em grade, blocos do memorial (BlocosMemorial.jsx) e o
// pacote final (.docx) com rodapé e imagens.
import { montarZip } from './zip'

// Medidas do Word: twips (1/20 pt) e EMU (imagens).
export const mmTw = mm => Math.round((mm / 25.4) * 1440)
export const ptTw = pt => Math.round(pt * 20)
const mmEmu = mm => Math.round(mm * 36000)

export const esc = t => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Run de texto. `\n` vira quebra de linha. o: { b, i, u, cor, sz (pt), vert: 'superscript'|'subscript' } */
export function run(texto, o = {}) {
  const pr = [
    o.b ? '<w:b/><w:bCs/>' : '',
    o.i ? '<w:i/>' : '',
    o.u ? '<w:u w:val="single"/>' : '',
    o.cor ? `<w:color w:val="${o.cor}"/>` : '',
    o.sz ? `<w:sz w:val="${Math.round(o.sz * 2)}"/><w:szCs w:val="${Math.round(o.sz * 2)}"/>` : '',
    o.vert ? `<w:vertAlign w:val="${o.vert}"/>` : '',
  ].join('')
  const linhas = String(texto ?? '').split('\n')
  const corpo = linhas.map((l, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(l)}</w:t>`).join('')
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${corpo}</w:r>`
}

/** Texto com trechos marcados entre … (DESTAQUE do formulário) em negrito. */
export function runsComDestaque(texto, o = {}) {
  return String(texto ?? '').split(/[]/).map((parte, i) => (parte ? run(parte, i % 2 ? { ...o, b: true } : o) : '')).join('')
}

/** Parágrafo. o: { alinha: 'left'|'center'|'right'|'both', antes, depois (pt), recuo1 (mm, 1ª linha), esq (mm), quebraAntes, manterProximo, frame } */
export function par(runs, o = {}) {
  const pr = [
    o.manterProximo ? '<w:keepNext/>' : '',
    o.quebraAntes ? '<w:pageBreakBefore/>' : '',
    o.frame || '',
    `<w:spacing w:before="${ptTw(o.antes || 0)}" w:after="${ptTw(o.depois || 0)}" w:line="${o.linha || 240}" w:lineRule="auto"/>`,
    o.esq || o.recuo1 ? `<w:ind w:left="${mmTw(o.esq || 0)}" w:firstLine="${mmTw(o.recuo1 || 0)}"/>` : '',
    o.alinha ? `<w:jc w:val="${o.alinha}"/>` : '',
  ].join('')
  return `<w:p><w:pPr>${pr}</w:pPr>${runs || ''}</w:p>`
}

const BORDA = (cor = '000000', sz = 4) => ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map(l => `<w:${l} w:val="single" w:sz="${sz}" w:space="0" w:color="${cor}"/>`).join('')

/**
 * Tabela em grade a partir de linhas de células com largura absoluta.
 * linhas: [{ cels: [{ w (twips), conteudo (xml de parágrafos/tabelas), fundo, alinhaV, vMerge: 'restart'|'continue' }], cabecalho?, naoQuebrar? }]
 * As fronteiras de todas as linhas formam a grade; cada célula ocupa o gridSpan correspondente.
 */
export function tabelaGrade(linhas, { largura, borda = true, margemCel = { t: 20, b: 20, l: 80, r: 80 } } = {}) {
  const fronteiras = new Set([0])
  for (const l of linhas) {
    let x = 0
    for (const c of l.cels) { x += c.w; fronteiras.add(Math.round(x)) }
  }
  const xs = [...fronteiras].sort((a, b) => a - b)
  const total = largura || xs[xs.length - 1]
  const grid = xs.slice(1).map((x, i) => `<w:gridCol w:w="${x - xs[i]}"/>`).join('')
  const rows = linhas.map(l => {
    let x = 0
    const cels = l.cels.map(c => {
      const ini = xs.indexOf(Math.round(x)); x += c.w
      const fim = xs.indexOf(Math.round(x))
      const span = Math.max(1, fim - ini)
      const pr = [
        `<w:tcW w:w="${Math.round(c.w)}" w:type="dxa"/>`,
        span > 1 ? `<w:gridSpan w:val="${span}"/>` : '',
        c.vMerge ? `<w:vMerge${c.vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : '',
        c.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fundo}"/>` : '',
        `<w:vAlign w:val="${c.alinhaV || 'center'}"/>`,
      ].join('')
      // Célula do Word precisa terminar num parágrafo.
      const conteudo = (c.conteudo || '').trimEnd().endsWith('</w:p>') ? c.conteudo : `${c.conteudo || ''}${par('')}`
      return `<w:tc><w:tcPr>${pr}</w:tcPr>${conteudo}</w:tc>`
    }).join('')
    const trPr = [l.cabecalho ? '<w:tblHeader/>' : '', '<w:cantSplit/>', l.altura ? `<w:trHeight w:val="${l.altura}"/>` : ''].join('')
    return `<w:tr><w:trPr>${trPr}</w:trPr>${cels}</w:tr>`
  }).join('')
  const m = margemCel
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borda ? `<w:tblBorders>${BORDA()}</w:tblBorders>` : ''}<w:tblCellMar><w:top w:w="${m.t}" w:type="dxa"/><w:left w:w="${m.l}" w:type="dxa"/><w:bottom w:w="${m.b}" w:type="dxa"/><w:right w:w="${m.r}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`
}

// ── Blocos do memorial (mesmos tipos de BlocosMemorial.jsx) ───────────────

// Fórmula em notação de engenharia: x^2 → sobrescrito; P_hd01 → subscrito.
function runsFormula(texto, sz) {
  const out = []
  const re = /\^(−?-?[0-9]+(?:,[0-9]+)?)|\b([A-Za-zΔ∆]+)_([A-Za-z0-9,]+)\b/g
  let i = 0, m
  while ((m = re.exec(texto))) {
    if (m.index > i) out.push(run(texto.slice(i, m.index), { sz }))
    if (m[1]) out.push(run(m[1], { sz, vert: 'superscript' }))
    else { out.push(run(m[2], { sz })); out.push(run(m[3], { sz, vert: 'subscript' })) }
    i = re.lastIndex
  }
  if (i < texto.length) out.push(run(texto.slice(i), { sz }))
  return out.join('')
}

function textoDaCelula(c) {
  if (c && typeof c === 'object') return c.tipo === 'imagem' ? (c.alt || '') : (c.texto ?? '')
  return c ?? ''
}

function blocoTabela(bloco, largura, sz) {
  const cabec = bloco.linhasCabecalho
    || [(bloco.colunas || []).map(texto => ({ texto }))]
  const nCol = Math.max(...cabec.map(l => l.reduce((s, c) => s + (c.colSpan || 1), 0)), ...(bloco.linhas || []).map(l => l.length), 1)
  const larg = bloco.larguras
    ? bloco.larguras.map(w => (String(w).endsWith('%') ? (parseFloat(w) / 100) * largura : largura / nCol))
    : Array(nCol).fill(largura / nCol)
  const soma = larg.reduce((s, w) => s + w, 0)
  const colW = larg.map(w => (w / soma) * largura)
  const alinha = j => (bloco.alinhas ? ({ left: 'left', center: 'center', right: 'right' }[bloco.alinhas[j]] || 'left') : bloco.centralizado ? 'center' : 'left')
  const linhas = []
  // Grade de ocupação para rowSpan (cabeçalho e corpo).
  const montar = (fonte, ehCabecalho) => {
    const pendentes = Array(nCol).fill(0)
    for (const linha of fonte) {
      const cels = []
      let j = 0, k = 0
      while (j < nCol) {
        if (pendentes[j] > 0) {
          // Coberta por um rowSpan de cima: no corpo os dados trazem `null` nessa posição.
          cels.push({ w: colW[j], conteudo: par(''), vMerge: 'continue', fundo: ehCabecalho ? 'F2F2F2' : undefined })
          pendentes[j]--; j++
          if (linha[k] === null) k++
          continue
        }
        const c = linha[k++]
        if (c === undefined || c === null) { cels.push({ w: colW[j], conteudo: par('') }); j++; continue }
        const span = (c && typeof c === 'object' && c.colSpan) || 1
        const rs = (c && typeof c === 'object' && c.rowSpan) || 1
        const w = colW.slice(j, j + span).reduce((s, x) => s + x, 0)
        cels.push({
          w, fundo: ehCabecalho ? 'F2F2F2' : undefined, vMerge: rs > 1 ? 'restart' : undefined,
          conteudo: par(run(textoDaCelula(c), { sz, b: ehCabecalho }), { alinha: ehCabecalho ? (bloco.centralizado ? 'center' : alinha(j)) : alinha(j) }),
        })
        if (rs > 1) for (let q = j; q < j + span; q++) pendentes[q] = rs - 1
        j += span
      }
      linhas.push({ cels, cabecalho: ehCabecalho })
    }
  }
  montar(cabec, true)
  montar(bloco.linhas || [], false)
  return tabelaGrade(linhas, { largura }) + par('', { depois: 4 })
}

function itemLista(item, nivel, sz, estilo) {
  const marcador = estilo === 'lettered' || estilo === 'alerta' ? '' : '• '
  const runs = item && typeof item === 'object'
    ? (item.label ? run(`${item.label}: `, { sz, b: true }) + run(item.valor ?? '', { sz }) : run(item.texto ?? '', { sz }))
    : run(item ?? '', { sz })
  const p = par(run(marcador, { sz }) + runs, { esq: 4 + nivel * 4 })
  return p + (Array.isArray(item?.sub) ? item.sub : []).map(s => itemLista(s, nivel + 1, sz, estilo)).join('')
}

function noOrganograma(no, nivel, sz) {
  return par(run(no.texto, { sz, b: !!no.bold }), { esq: nivel * 5 }) + (no.sub || []).map(s => noOrganograma(s, nivel + 1, sz)).join('')
}

/** Blocos do memorial em OOXML. largura em twips (para as tabelas). */
export function blocosOoxml(blocos, { largura, sz = 10 } = {}) {
  return (blocos || []).map(b => {
    switch (b.tipo) {
      case 'titulo2': return par(run(`${b.numero ? `${b.numero} ` : ''}${b.texto}`, { sz, b: true }), { antes: 6, depois: 3, manterProximo: true })
      case 'titulo3': return par(run(`${b.numero ? `${b.numero} ` : ''}${b.texto}`, { sz, b: true }), { antes: 4, depois: 2, manterProximo: true })
      case 'paragrafo': return par(run(b.texto, { sz }), { alinha: 'both', recuo1: 10, depois: 4 })
      case 'formula': return String(b.texto).split('\n').map(l => par(runsFormula(l, sz), { esq: 4 })).join('') + par('', { depois: 2 })
      case 'campo': return par(run(`${b.label}: `, { sz, b: true }) + run(b.valor ?? '', { sz }), { recuo1: b.recuo ? 10 : 0, depois: 3 })
      case 'tabela': return blocoTabela(b, largura, sz)
      case 'lista': return (b.itens || []).map(it => itemLista(it, b.recuo ? 2 : 0, sz, b.estilo)).join('') + par('', { depois: 2 })
      case 'organograma': return (b.nos || []).map(n => noOrganograma(n, 0, sz)).join('') + par('', { depois: 4 })
      default: return ''
    }
  }).join('')
}

// ── Pacote .docx ───────────────────────────────────────────────────────────

function dataUrlParaBytes(dataUrl) {
  const m = /^data:(image\/(png|jpe?g));base64,(.*)$/.exec(dataUrl || '')
  if (!m) return null
  const bin = atob(m[3])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, ext: m[2] === 'png' ? 'png' : 'jpeg' }
}

function tamanhoPng(bytes) {
  const dv = new DataView(bytes.buffer)
  return { w: dv.getUint32(16), h: dv.getUint32(20) }
}

export function imagemInline(rId, larguraMm, alturaMm, id) {
  const cx = mmEmu(larguraMm), cy = mmEmu(alturaMm)
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagem ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'

/**
 * Monta o .docx. o: { corpo (xml), margens: { t, r, b, l } mm, fonte, sz (pt),
 *   rodape: { rubrica (data URL) | null, comRubrica: bool, numeroPagina: bool }, titulo,
 *   imagens: [{ rId, nome ('logo.png'), bytes }] usadas no corpo (imagemInline) }
 */
export function montarDocx({ corpo, margens, fonte = 'Arial', sz = 10, rodape = {}, titulo = '', imagens = [] }) {
  const arquivos = imagens.map(i => ({ nome: `word/media/${i.nome}`, dados: i.bytes }))
  const relsDoc = [
    '<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdRodape" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
    ...imagens.map(i => `<Relationship Id="${i.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${i.nome}"/>`),
  ]

  // Rodapé: número da página à esquerda (opcional) e o quadro "Rubrica" à direita.
  const relsRodape = []
  let quadro = ''
  if (rodape.comRubrica) {
    const img = dataUrlParaBytes(rodape.rubrica)
    let conteudo = par(run('Rubrica', { sz: 9 }), { alinha: 'center' })
    if (img) {
      arquivos.push({ nome: `word/media/rubrica.${img.ext}`, dados: img.bytes })
      relsRodape.push(`<Relationship Id="rIdRubrica" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/rubrica.${img.ext}"/>`)
      const { w, h } = img.ext === 'png' ? tamanhoPng(img.bytes) : { w: 3, h: 1 }
      const escala = Math.min(30 / (w || 1), 8.6 / (h || 1))
      conteudo = par(imagemInline('rIdRubrica', (w || 1) * escala, (h || 1) * escala, 1), { alinha: 'center' })
    }
    const quadroW = mmTw(32)
    quadro = `<w:tbl><w:tblPr><w:tblW w:w="${quadroW}" w:type="dxa"/><w:jc w:val="right"/><w:tblLayout w:type="fixed"/><w:tblBorders>${BORDA('538135', 6)}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${quadroW}"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="${mmTw(10)}" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${quadroW}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${conteudo}</w:tc></w:tr></w:tbl>`
  }
  const numero = rodape.numeroPagina
    ? `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
    : ''
  const rodapeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${quadro}${numero || '<w:p/>'}</w:ftr>`

  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdRodape"/><w:pgSz w:w="${mmTw(210)}" w:h="${mmTw(297)}"/><w:pgMar w:top="${mmTw(margens.t)}" w:right="${mmTw(margens.r)}" w:bottom="${mmTw(margens.b)}" w:left="${mmTw(margens.l)}" w:header="${mmTw(8)}" w:footer="${mmTw(5)}" w:gutter="0"/></w:sectPr>`
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpo}${sect}</w:body></w:document>`
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${fonte}" w:hAnsi="${fonte}" w:cs="${fonte}" w:eastAsia="${fonte}"/><w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`

  arquivos.unshift(
    { nome: '[Content_Types].xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { nome: '_rels/.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { nome: 'docProps/core.xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(titulo)}</dc:title></cp:coreProperties>` },
    { nome: 'word/document.xml', dados: documento },
    { nome: 'word/styles.xml', dados: estilos },
    { nome: 'word/_rels/document.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsDoc.join('')}</Relationships>` },
    { nome: 'word/footer1.xml', dados: rodapeXml },
  )
  if (relsRodape.length) arquivos.push({ nome: 'word/_rels/footer1.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsRodape.join('')}</Relationships>` })
  return montarZip(arquivos, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

export function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
