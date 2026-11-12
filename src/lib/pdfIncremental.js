// lib/pdfIncremental.js — atualização INCREMENTAL de um PDF (acrescenta, não reescreve).
//
// Um PDF que já tem assinatura não pode ser regravado: qualquer mudança nos bytes cobertos pela
// assinatura anterior a invalida. A saída (a mesma de Acrobat e de qualquer assinador) é
// acrescentar ao FIM do arquivo os objetos novos e os alterados, mais uma nova tabela de
// referências cruzadas apontando para a anterior (/Prev). Os bytes originais ficam intactos.
//
// O pdf-lib só sabe regravar o arquivo inteiro; aqui ele serve para ler o PDF e criar os objetos,
// e só os objetos que mudaram são serializados e acrescentados.

import { PDFName, PDFRef } from 'pdf-lib'

const latin1 = u8 => new TextDecoder('latin1').decode(u8)
const codificar = texto => Uint8Array.from(texto, c => c.charCodeAt(0) & 0xff)
const ref = r => `${r.objectNumber} ${r.generationNumber} R`

/** O que o último `startxref` do arquivo diz: onde está a tabela anterior e de que tipo ela é. */
export function lerTabelaAnterior(bytes) {
  const cauda = latin1(bytes.subarray(Math.max(0, bytes.length - 2048)))
  const i = cauda.lastIndexOf('startxref')
  const m = i >= 0 ? /startxref\s+(\d+)/.exec(cauda.slice(i)) : null
  if (!m) throw new Error('startxref não encontrado')
  const prev = Number(m[1])
  // Só o começo da seção anterior interessa (limite de 8 MB para uma tabela clássica enorme).
  const resto = latin1(bytes.subarray(prev, Math.min(bytes.length, prev + 8 * 1024 * 1024)))
  const emFluxo = !/^\s*xref/.test(resto.slice(0, 64))
  // /Size está no trailer (tabela clássica) ou no dicionário do fluxo (antes de "stream").
  const t = resto.indexOf(emFluxo ? 'stream' : 'trailer')
  const dic = emFluxo ? resto.slice(0, t >= 0 ? t : resto.length) : (t >= 0 ? resto.slice(t) : '')
  const s = /\/Size\s+(\d+)/.exec(dic)
  return { prev, emFluxo, tamanho: s ? Number(s[1]) : 0 }
}

// Bytes de um objeto indireto: "N G obj ... endobj".
function objetoEmBytes(r, obj) {
  const cab = codificar(`${r.objectNumber} ${r.generationNumber} obj\n`)
  const corpo = new Uint8Array(obj.sizeInBytes())
  obj.copyBytesInto(corpo, 0)
  const rod = codificar('\nendobj\n')
  const saida = new Uint8Array(cab.length + corpo.length + rod.length)
  saida.set(cab, 0)
  saida.set(corpo, cab.length)
  saida.set(rod, cab.length + corpo.length)
  return saida
}

// Agrupa números consecutivos: [3,4,5,9] -> [[3,3],[9,1]] (primeiro, quantidade).
function subsecoes(numeros) {
  const grupos = []
  for (const n of [...numeros].sort((a, b) => a - b)) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo[0] + ultimo[1] === n) ultimo[1]++
    else grupos.push([n, 1])
  }
  return grupos
}

/**
 * Acrescenta ao PDF original os objetos `refs` (novos ou alterados) tal como estão em `pdfDoc`.
 *
 * @param {Uint8Array} original  bytes do arquivo como veio (ficam intactos no começo da saída)
 * @param {import('pdf-lib').PDFDocument} pdfDoc  o mesmo arquivo lido pelo pdf-lib e já modificado
 * @param {import('pdf-lib').PDFRef[]} refs  objetos a gravar
 * @returns {Uint8Array}
 */
export function acrescentarObjetos(original, pdfDoc, refs) {
  const ctx = pdfDoc.context
  const { prev, emFluxo, tamanho } = lerTabelaAnterior(original)
  const info = ctx.trailerInfo
  const unicos = [...new Map(refs.map(r => [r.objectNumber, r])).values()]

  const partes = [original, codificar(original[original.length - 1] === 0x0a ? '' : '\n')]
  let posicao = partes[0].length + partes[1].length
  const offsets = new Map()
  for (const r of unicos) {
    const bytes = objetoEmBytes(r, ctx.lookup(r))
    offsets.set(r.objectNumber, { offset: posicao, gen: r.generationNumber })
    partes.push(bytes)
    posicao += bytes.length
  }

  const maior = Math.max(tamanho - 1, ...unicos.map(r => r.objectNumber))
  const chaves = `/Root ${ref(info.Root)}${info.Info ? ` /Info ${ref(info.Info)}` : ''}${info.ID ? ` /ID ${info.ID.toString()}` : ''} /Prev ${prev}`
  const inicioXref = posicao

  if (!emFluxo) {
    let tabela = 'xref\n'
    for (const [primeiro, qtd] of subsecoes(offsets.keys())) {
      tabela += `${primeiro} ${qtd}\n`
      for (let n = primeiro; n < primeiro + qtd; n++) {
        const { offset, gen } = offsets.get(n)
        tabela += `${String(offset).padStart(10, '0')} ${String(gen).padStart(5, '0')} n \n`
      }
    }
    tabela += `trailer\n<< /Size ${maior + 1} ${chaves} >>\nstartxref\n${inicioXref}\n%%EOF\n`
    partes.push(codificar(tabela))
  } else {
    // O próprio fluxo de referências também é um objeto, com o número seguinte ao maior.
    const numeroDoFluxo = maior + 1
    offsets.set(numeroDoFluxo, { offset: inicioXref, gen: 0 })
    const grupos = subsecoes(offsets.keys())
    const dados = new Uint8Array(offsets.size * 7)
    let k = 0
    for (const [primeiro, qtd] of grupos) {
      for (let n = primeiro; n < primeiro + qtd; n++) {
        const { offset, gen } = offsets.get(n)
        dados[k++] = 1
        dados[k++] = (offset >>> 24) & 0xff
        dados[k++] = (offset >>> 16) & 0xff
        dados[k++] = (offset >>> 8) & 0xff
        dados[k++] = offset & 0xff
        dados[k++] = (gen >>> 8) & 0xff
        dados[k++] = gen & 0xff
      }
    }
    const indice = grupos.map(([a, b]) => `${a} ${b}`).join(' ')
    const cab = codificar(`${numeroDoFluxo} 0 obj\n<< /Type /XRef /Size ${numeroDoFluxo + 1} /W [1 4 2] /Index [${indice}] ${chaves} /Length ${dados.length} >>\nstream\n`)
    const rod = codificar(`\nendstream\nendobj\nstartxref\n${inicioXref}\n%%EOF\n`)
    partes.push(cab, dados, rod)
  }

  const total = partes.reduce((s, p) => s + p.length, 0)
  const saida = new Uint8Array(total)
  let p = 0
  for (const parte of partes) { saida.set(parte, p); p += parte.length }
  return saida
}

/** Referências dos objetos EXISTENTES que o pdf-lib altera ao acrescentar uma assinatura a uma página. */
export function refsAlteradasPorAssinatura(pdfDoc, pagina) {
  const ctx = pdfDoc.context
  const refs = [pagina.ref, ctx.trailerInfo.Root]
  const anots = pagina.node.get(PDFName.of('Annots'))
  if (anots instanceof PDFRef) refs.push(anots)
  const acro = pdfDoc.catalog.get(PDFName.of('AcroForm'))
  if (acro instanceof PDFRef) {
    refs.push(acro)
    const campos = ctx.lookup(acro).get?.(PDFName.of('Fields'))
    if (campos instanceof PDFRef) refs.push(campos)
  }
  return refs
}
