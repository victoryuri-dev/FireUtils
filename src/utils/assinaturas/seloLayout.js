// utils/assinaturas/seloLayout.js — o DESENHO do selo visível da assinatura.
//
// Função pura: dado o tamanho do quadro, o titular, a data e as opções do grupo
// (selo.js), devolve onde vai cada linha de texto e se há borda. O mesmo resultado
// alimenta o PDF (lib/pades.js, que o converte em operadores de desenho) e a
// prévia na tela (PreviaSelo.jsx, que o converte em SVG). Assim o que a pessoa vê
// antes de assinar é o que sai no documento: mesmas quebras de linha e tamanhos.
//
// Coordenadas no espaço do PDF: origem no canto inferior esquerdo do quadro, eixo
// y para cima, em pontos; `y` de cada texto é a linha de base. Texto em WinAnsi,
// fontes Helvetica (normal) e Helvetica-Bold (negrito).

import { normalizarSelo } from './selo.js'
import { LARGURA_NORMAL, LARGURA_NEGRITO } from './metricasHelvetica.js'

/** Largura do texto em pontos (soma das larguras dos caracteres; sem kerning, como o `Tj` do PDF). */
export function larguraDoTexto(fonte, texto, tamanho) {
  const tabela = fonte === 'negrito' ? LARGURA_NEGRITO : LARGURA_NORMAL
  let soma = 0
  for (let i = 0; i < texto.length; i++) soma += tabela[texto.charCodeAt(i)] || 0
  return (soma * tamanho) / 1000
}

/** Texto em WinAnsi: o que não existe nessa codificação vira "?". */
export function winAnsi(texto) {
  let s = ''
  for (const ch of String(texto)) {
    const c = ch.codePointAt(0)
    s += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : '?'
  }
  return s
}

const p2 = n => String(n).padStart(2, '0')
const fuso = d => {
  const off = -d.getTimezoneOffset()
  return { sinal: off >= 0 ? '+' : '-', h: p2(Math.floor(Math.abs(off) / 60)), m: p2(Math.abs(off) % 60) }
}

/** 10/11/2026 08:18:05 -03:00 */
export function dataParaSelo(d) {
  const f = fuso(d)
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${f.sinal}${f.h}:${f.m}`
}

/** Como o Adobe Acrobat escreve: 2020.07.23 01:48:53 -03'00' */
export function dataAdobe(d) {
  const f = fuso(d)
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${f.sinal}${f.h}'${f.m}'`
}

// Largura da maior palavra do texto no tamanho dado.
function palavraMaior(texto, fonte, tamanho) {
  return Math.max(0, ...texto.split(' ').filter(Boolean).map(p => larguraDoTexto(fonte, p, tamanho)))
}

// Quebra o texto em linhas de até `maximo` pontos (nas palavras; uma palavra maior
// que a linha é partida por caracteres).
function quebrarLinhas(texto, fonte, tamanho, maximo) {
  const largura = t => larguraDoTexto(fonte, t, tamanho)
  const linhas = []
  let atual = ''
  for (const palavra of texto.split(' ').filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (largura(tentativa) <= maximo) { atual = tentativa; continue }
    if (atual) linhas.push(atual)
    let resto = palavra
    while (largura(resto) > maximo && resto.length > 1) {
      let n = resto.length - 1
      while (n > 1 && largura(resto.slice(0, n)) > maximo) n--
      linhas.push(resto.slice(0, n))
      resto = resto.slice(n)
    }
    atual = resto
  }
  if (atual) linhas.push(atual)
  return linhas
}

// Encurta a linha com reticências até caber em `maximo` pontos.
function caberNaLargura(linha, tamanho, maximo) {
  if (larguraDoTexto(linha.fonte, linha.texto, tamanho) <= maximo) return
  let corte = linha.texto
  while (corte.length > 1 && larguraDoTexto(linha.fonte, `${corte}...`, tamanho) > maximo) corte = corte.slice(0, -1)
  linha.texto = `${corte}...`
}

/**
 * Selo "simples": linhas opcionais (rótulo, titular em negrito, data, texto
 * adicional), alinhadas à esquerda ou centralizadas, no maior tamanho que cabe.
 */
function layoutSimples({ largura, altura, titular, quando, selo }) {
  const pad = 3
  const maximo = largura - 2 * pad
  const linhas = []
  if (selo.mostrarRotulo) linhas.push({ texto: 'Assinado digitalmente por', fonte: 'normal', escala: 0.85 })
  linhas.push({ texto: winAnsi(titular), fonte: 'negrito', escala: 1 })
  if (selo.mostrarData) linhas.push({ texto: `Data: ${dataParaSelo(quando)}`, fonte: 'normal', escala: 0.85 })
  if (selo.textoExtra) linhas.push({ texto: winAnsi(selo.textoExtra), fonte: 'normal', escala: 0.85 })

  // O maior tamanho (até 14 pt) em que as linhas cabem na altura e na largura.
  let tam = Math.min(14, (altura - 2 * pad) / (linhas.length * 1.25))
  while (tam > 4 && !linhas.every(l => larguraDoTexto(l.fonte, l.texto, tam * l.escala) <= maximo)) tam -= 0.25
  for (const l of linhas) caberNaLargura(l, tam * l.escala, maximo)

  const passo = tam * 1.25
  const centralizado = selo.alinhamento === 'centro'
  const topo = centralizado ? altura - Math.max(pad, (altura - passo * linhas.length) / 2) : altura - pad
  return linhas.map((l, i) => {
    const tamanho = tam * l.escala
    return {
      texto: l.texto,
      fonte: l.fonte,
      tamanho,
      x: centralizado ? (largura - larguraDoTexto(l.fonte, l.texto, tamanho)) / 2 : pad,
      y: topo - tam * 0.95 - i * passo,
    }
  })
}

/**
 * Selo no estilo do Adobe Acrobat: o NOME em destaque (negrito) na coluna da esquerda
 * (quebrado em linhas, centralizado, no maior tamanho que cabe) e, na da direita,
 * os detalhes pequenos: "Assinado de forma digital por NOME" e "Dados: AAAA.MM.DD
 * hh:mm:ss -03'00'", mais o texto adicional, se houver.
 */
function layoutAdobe({ largura, altura, titular, quando, selo }) {
  const pad = 4
  const nome = winAnsi(titular)
  const temDetalhes = selo.mostrarRotulo || selo.mostrarData || Boolean(selo.textoExtra)
  const colunaEsq = temDetalhes ? largura * 0.45 : largura // sem detalhes, o nome ocupa tudo
  const larguraNome = colunaEsq - 2 * pad
  const larguraDetalhes = largura - colunaEsq - pad - 2

  // Nome (em negrito): o maior tamanho (até 26 pt) em que nenhuma palavra precisa ser
  // partida e as linhas cabem na altura da coluna (como o Acrobat: reduz a fonte, não
  // parte palavras).
  let tamNome = Math.min(26, altura * 0.5)
  let linhasNome = quebrarLinhas(nome, 'negrito', tamNome, larguraNome)
  while (tamNome > 5 && (palavraMaior(nome, 'negrito', tamNome) > larguraNome || linhasNome.length * tamNome * 1.15 > altura - 2 * pad)) {
    tamNome -= 0.5
    linhasNome = quebrarLinhas(nome, 'negrito', tamNome, larguraNome)
  }

  // Detalhes: o maior tamanho em que cabem, sem passar do tamanho do nome (que deve
  // continuar sendo o destaque) nem de 14 pt.
  const textos = []
  if (selo.mostrarRotulo) textos.push(`Assinado de forma digital por ${nome}`)
  if (selo.mostrarData) textos.push(`Dados: ${dataAdobe(quando)}`)
  if (selo.textoExtra) textos.push(winAnsi(selo.textoExtra))
  const montar = t => textos.flatMap(x => quebrarLinhas(x, 'normal', t, larguraDetalhes))
  const maiorPalavra = t => Math.max(0, ...textos.map(x => palavraMaior(x, 'normal', t)))
  let tamDet = Math.min(14, tamNome)
  let linhasDet = montar(tamDet)
  while (tamDet > 4.5 && (maiorPalavra(tamDet) > larguraDetalhes || linhasDet.length * tamDet * 1.2 > altura - 2 * pad)) {
    tamDet -= 0.25
    linhasDet = montar(tamDet)
  }

  const saida = []
  // Coluna do nome: centralizada na horizontal e na vertical.
  const passoNome = tamNome * 1.15
  const topoNome = altura / 2 + (linhasNome.length * passoNome) / 2
  linhasNome.forEach((texto, i) => {
    saida.push({
      texto,
      fonte: 'negrito',
      tamanho: tamNome,
      x: (colunaEsq - larguraDoTexto('negrito', texto, tamNome)) / 2,
      y: topoNome - tamNome * 0.85 - i * passoNome,
    })
  })
  // Coluna dos detalhes: alinhada à esquerda, centralizada na vertical.
  const passoDet = tamDet * 1.2
  const topoDet = altura / 2 + (linhasDet.length * passoDet) / 2
  linhasDet.forEach((texto, i) => {
    saida.push({ texto, fonte: 'normal', tamanho: tamDet, x: colunaEsq + pad, y: topoDet - tamDet * 0.85 - i * passoDet })
  })
  return saida
}

/**
 * Desenho do selo.
 * @param {{ largura:number, altura:number, titular:string, quando:Date, selo?:object }} entrada
 *        largura/altura do quadro em pontos, na orientação em que o selo é lido
 * @returns {{ largura:number, altura:number, borda:boolean,
 *             textos: { texto:string, fonte:'normal'|'negrito', tamanho:number, x:number, y:number }[] }}
 */
export function montarSelo({ largura, altura, titular, quando, selo: entrada }) {
  const selo = normalizarSelo(entrada)
  const dados = { largura, altura, titular, quando, selo }
  return {
    largura,
    altura,
    borda: selo.borda,
    textos: selo.estilo === 'simples' ? layoutSimples(dados) : layoutAdobe(dados),
  }
}
