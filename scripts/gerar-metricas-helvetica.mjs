// Gera src/utils/assinaturas/metricasHelvetica.js: a largura de cada caractere
// (WinAnsi, códigos 32–255, em milésimos de em) das fontes Helvetica e
// Helvetica-Bold do PDF.
//
// Por que existe: o desenho do selo (utils/assinaturas/seloLayout.js) precisa medir
// texto igual no PDF e na prévia da tela, sem carregar o pdf-lib na página. A
// soma das larguras é também a largura REAL do texto desenhado com `Tj` (o PDF
// não aplica kerning nesse operador).
//
//   node scripts/gerar-metricas-helvetica.mjs
import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const doc = await PDFDocument.create()
const larguras = async nome => {
  const fonte = await doc.embedFont(nome)
  return Array.from({ length: 256 }, (_, codigo) => {
    if (codigo < 32 || (codigo > 126 && codigo < 160)) return 0
    try { return Math.round(fonte.widthOfTextAtSize(String.fromCharCode(codigo), 1000)) } catch { return 0 }
  })
}
const normal = await larguras(StandardFonts.Helvetica)
const negrito = await larguras(StandardFonts.HelveticaBold)
const formatar = v => {
  const linhas = []
  for (let i = 0; i < v.length; i += 16) linhas.push('  ' + v.slice(i, i + 16).join(', ') + ',')
  return `[\n${linhas.join('\n')}\n]`
}
writeFileSync(new URL('../src/utils/assinaturas/metricasHelvetica.js', import.meta.url), `// GERADO por scripts/gerar-metricas-helvetica.mjs — não edite à mão.
// Largura de cada caractere (código WinAnsi 0–255) em milésimos de em.
// Vale para as fontes padrão Helvetica e Helvetica-Bold do PDF.

export const LARGURA_NORMAL = ${formatar(normal)}

export const LARGURA_NEGRITO = ${formatar(negrito)}
`)
console.log('gerado:', normal.filter(Boolean).length, 'caracteres por fonte')
