// lib/pades.js — assinatura digital de PDF (PAdES-B-B) feita no navegador.
//
// O certificado (.pfx/.p12), a senha e o PDF nunca saem da máquina: tudo é
// lido e assinado aqui, em memória.
//
// Como funciona (o mesmo caminho de qualquer assinador PDF):
//   1. pdf-lib acrescenta ao PDF um campo de assinatura visível, na posição do
//      grupo, com um espaço reservado (/Contents) e um /ByteRange provisório;
//   2. o arquivo é salvo e o espaço reservado é localizado nos bytes;
//   3. o hash SHA-256 de TODO o arquivo, menos o espaço reservado, é assinado
//      com a chave privada do certificado (CMS destacado, ETSI.CAdES.detached);
//   4. o CMS é gravado no espaço reservado e o /ByteRange recebe os valores reais.
//
// O CMS segue o PAdES-B-B: atributos assinados contentType, messageDigest e
// signing-certificate-v2 (ESS). NÃO inclui carimbo do tempo nem a política de
// assinatura do ICP-Brasil (AD-RB): a assinatura é tecnicamente válida, mas só
// vale como assinatura ICP-Brasil se o certificado for ICP-Brasil e o validador
// aceitar este perfil.

import forge from 'node-forge'
import {
  PDFDocument, PDFName, PDFNumber, PDFString, PDFHexString, PDFArray, PDFDict, StandardFonts,
  EncryptedPDFError,
} from 'pdf-lib'
import { retanguloPdf, indiceDaPagina, normalizarRotacao } from '../utils/assinaturas/geometria.js'
import { normalizarSelo } from '../utils/assinaturas/selo.js'
import { NOME_DA_CIFRA } from './pkcs12Legado.js'
import { lerPfx, ErroPfx } from './pkcs12.js'

/** Erro com código para a interface mostrar a mensagem certa. */
export class ErroAssinatura extends Error {
  /** `detalhe`: texto técnico opcional, para a pessoa poder reportar o problema. */
  constructor(codigo, mensagem, detalhe) {
    super(mensagem)
    this.name = 'ErroAssinatura'
    this.codigo = codigo
    this.detalhe = detalhe
  }
}

const A = forge.asn1
const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha256WithRSA: '1.2.840.113549.1.1.11',
}

// Espaço reservado para o CMS (bytes). Com cadeia de 3 certificados o CMS tem
// ~6 KB; sobra folga para cadeias maiores.
const TAM_ASSINATURA = 16384
const TAM_HEX = TAM_ASSINATURA * 2

// ── Utilidades de bytes ───────────────────────────────────────────────

const paraBinario = bytes => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  const passo = 0x8000
  for (let i = 0; i < u8.length; i += passo) s += String.fromCharCode.apply(null, u8.subarray(i, i + passo))
  return s
}

const latin1 = u8 => new TextDecoder('latin1').decode(u8)

function escreverLatin1(destino, posicao, texto) {
  for (let i = 0; i < texto.length; i++) destino[posicao + i] = texto.charCodeAt(i) & 0xff
}

// ── Certificado ───────────────────────────────────────────────────────

const nomeDe = (dn, campo) => dn.getField(campo)?.value ?? ''

// Política de certificado ICP-Brasil: OIDs sob 2.16.76.1.2.* (certificatePolicies).
function ehIcpBrasil(cert) {
  try {
    const ext = cert.extensions?.find(e => e.id === '2.5.29.32')
    if (!ext) return false
    const politicas = A.fromDer(ext.value)
    return politicas.value.some(info => {
      const oid = A.derToOid(info.value[0].value)
      return oid.startsWith('2.16.76.1.2.')
    })
  } catch {
    return false
  }
}

/**
 * Lê o .pfx/.p12 e devolve o certificado pronto para assinar.
 * @param {Uint8Array|ArrayBuffer} pfx
 * @param {string} senha
 * @returns {{ titular, emissor, validoDe: Date, validoAte: Date, vencido: boolean,
 *             icpBrasil: boolean, autoassinado: boolean, certificados: object[],
 *             chave: object, cert: object }}
 */
export function lerCertificado(pfx, senha) {
  let lido
  try {
    lido = lerPfx(pfx, senha || '')
  } catch (e) {
    if (!(e instanceof ErroPfx)) throw e
    if (e.codigo === 'senha') throw new ErroAssinatura('senha', 'Senha do certificado incorreta.')
    if (e.oid) {
      const nome = NOME_DA_CIFRA[e.oid] ? `“${NOME_DA_CIFRA[e.oid]}”` : `desconhecido (OID ${e.oid})`
      throw new ErroAssinatura('formato', `Este arquivo .pfx usa um algoritmo de criptografia ${nome} que o navegador ainda não consegue ler. Reexportar o certificado pelo Windows (ou com “openssl pkcs12 -export -legacy”) costuma resolver.`, e.detalhe)
    }
    throw new ErroAssinatura('formato', e.message, e.detalhe)
  }

  if (!lido.chaves.length) {
    throw new ErroAssinatura(
      lido.chavesNaoRsa ? 'chave' : 'formato',
      lido.chavesNaoRsa ? 'Só certificados com chave RSA são aceitos.' : 'O arquivo não contém uma chave privada.',
    )
  }
  if (!lido.certificados.length) {
    throw new ErroAssinatura('formato', 'O arquivo não contém um certificado.')
  }
  const chave = lido.chaves[0]
  const certificados = lido.certificados
  const cert = certificados.find(c => c.publicKey?.n && c.publicKey.n.compareTo(chave.n) === 0)
  if (!cert) {
    throw new ErroAssinatura('formato', 'Nenhum certificado do arquivo corresponde à chave privada.')
  }

  const agora = new Date()
  return {
    titular: nomeDe(cert.subject, 'CN') || nomeDe(cert.subject, 'O') || 'Titular do certificado',
    emissor: nomeDe(cert.issuer, 'CN') || nomeDe(cert.issuer, 'O'),
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
    vencido: agora > cert.validity.notAfter || agora < cert.validity.notBefore,
    icpBrasil: ehIcpBrasil(cert),
    autoassinado: cert.isIssuer(cert),
    certificados,
    chave,
    cert,
  }
}

// ── CMS (PKCS#7 SignedData) ───────────────────────────────────────────

const oidAsn1 = o => A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer(o).getBytes())
const seq = (...v) => A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, v)
const set = v => A.create(A.Class.UNIVERSAL, A.Type.SET, true, v)
const octeto = b => A.create(A.Class.UNIVERSAL, A.Type.OCTETSTRING, false, b)
const inteiro = n => A.create(A.Class.UNIVERSAL, A.Type.INTEGER, false, A.integerToDer(n).getBytes())
const nulo = () => A.create(A.Class.UNIVERSAL, A.Type.NULL, false, '')
const contexto = (tag, v) => A.create(A.Class.CONTEXT_SPECIFIC, tag, true, v)
const atributo = (oid, valor) => seq(oidAsn1(oid), set([valor]))
const derDe = asn1 => A.toDer(asn1).getBytes()

// Emissor e serial do certificado COMO ESTÃO no arquivo (re-codificar o nome
// pode mudar tipos de string e quebrar a comparação do validador).
function emissorESerial(cert) {
  const tbs = cert.tbsCertificate.value
  const temVersao = tbs[0].tagClass === A.Class.CONTEXT_SPECIFIC && tbs[0].type === 0
  return { serial: tbs[temVersao ? 1 : 0], emissor: tbs[temVersao ? 3 : 2] }
}

function construirCms(certificado, hashDoc) {
  const { cert, chave, certificados } = certificado
  const { serial, emissor } = emissorESerial(cert)
  const algSha256 = () => seq(oidAsn1(OID.sha256), nulo())

  // signing-certificate-v2 (ESS): amarra a assinatura a ESTE certificado.
  const md = forge.md.sha256.create()
  md.update(derDe(forge.pki.certificateToAsn1(cert)))
  const essCertId = seq(
    octeto(md.digest().getBytes()),
    seq(seq(contexto(4, [emissor])), serial), // IssuerSerial { GeneralNames{ directoryName }, serial }
  )
  const attrs = [
    atributo(OID.contentType, oidAsn1(OID.data)),
    atributo(OID.messageDigest, octeto(hashDoc)),
    atributo(OID.signingCertificateV2, seq(seq(essCertId))),
  ]
  // DER exige o SET OF ordenado pelos bytes de cada elemento.
  attrs.sort((a, b) => (derDe(a) < derDe(b) ? -1 : 1))

  // A assinatura cobre os atributos com a etiqueta de SET (0x31); no SignerInfo
  // eles vão com a etiqueta [0] IMPLICIT (0xA0).
  const aAssinar = forge.md.sha256.create()
  aAssinar.update(derDe(set(attrs)))
  const assinatura = chave.sign(aAssinar)

  const signerInfo = seq(
    inteiro(1),
    seq(emissor, serial),
    algSha256(),
    contexto(0, attrs),
    seq(oidAsn1(OID.sha256WithRSA), nulo()),
    octeto(assinatura),
  )
  const signedData = seq(
    inteiro(1),
    set([algSha256()]),
    seq(oidAsn1(OID.data)), // conteúdo destacado: o PDF
    contexto(0, certificados.map(c => forge.pki.certificateToAsn1(c))),
    set([signerInfo]),
  )
  return derDe(seq(oidAsn1(OID.signedData), contexto(0, [signedData])))
}

// ── Aparência (selo visível) ──────────────────────────────────────────

// Texto do selo em WinAnsi: o que não existe nessa codificação vira "?".
function winAnsi(texto) {
  let s = ''
  for (const ch of String(texto)) {
    const c = ch.codePointAt(0)
    s += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : '?'
  }
  return s
}

// Literal de string PDF: (…) com escape de ( ) \ e octal para bytes altos.
function literalPdf(texto) {
  let s = '('
  for (const ch of texto) {
    const c = ch.charCodeAt(0)
    if (ch === '(' || ch === ')' || ch === '\\') s += '\\' + ch
    else if (c < 0x20 || c > 0x7e) s += '\\' + c.toString(8).padStart(3, '0')
    else s += ch
  }
  return s + ')'
}

function dataParaSelo(d) {
  const p = n => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  const fuso = `${sinal}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${fuso}`
}

function dataPdf(d) {
  const p = n => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sinal}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`
}

// Data como o Adobe Acrobat escreve: 2020.07.23 01:48:53 -03'00'
function dataAdobe(d) {
  const p = n => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${sinal}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`
}

// Largura da maior palavra do texto no tamanho dado.
function palavraMaior(texto, fonte, tamanho) {
  return Math.max(0, ...texto.split(' ').filter(Boolean).map(p => fonte.widthOfTextAtSize(p, tamanho)))
}

// Quebra o texto em linhas de até `maximo` pontos (nas palavras; uma palavra maior
// que a linha é partida por caracteres).
function quebrarLinhas(texto, fonte, tamanho, maximo) {
  const largura = t => fonte.widthOfTextAtSize(t, tamanho)
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

// Encurta o texto com reticências até caber em `maximo` pontos.
function caberNaLargura(linha, tamanho, maximo) {
  if (linha.obj.widthOfTextAtSize(linha.texto, tamanho) <= maximo) return
  let corte = linha.texto
  while (corte.length > 1 && linha.obj.widthOfTextAtSize(`${corte}...`, tamanho) > maximo) corte = corte.slice(0, -1)
  linha.texto = `${corte}...`
}

/**
 * Selo "simples": linhas opcionais (rótulo, titular, data, texto adicional), borda opcional,
 * alinhamento à esquerda ou centralizado e tamanho de texto automático (o maior
 * que cabe) ou fixo. O que passar do quadro é cortado pelo recorte do desenho.
 */
function conteudoSimples(largura, altura, titular, quando, fontes, selo) {
  const pad = 3
  const maximo = largura - 2 * pad
  const linhas = []
  if (selo.mostrarRotulo) linhas.push({ texto: 'Assinado digitalmente por', fonte: 'F1', obj: fontes.normal, escala: 0.85 })
  linhas.push({ texto: winAnsi(titular), fonte: 'F2', obj: fontes.negrito, escala: 1 })
  if (selo.mostrarData) linhas.push({ texto: `Data: ${dataParaSelo(quando)}`, fonte: 'F1', obj: fontes.normal, escala: 0.85 })
  if (selo.textoExtra) linhas.push({ texto: winAnsi(selo.textoExtra), fonte: 'F1', obj: fontes.normal, escala: 0.85 })

  let tam
  if (selo.fonte === 'auto') {
    // O maior tamanho (até 14 pt) em que as linhas cabem na altura e na largura.
    tam = Math.min(14, (altura - 2 * pad) / (linhas.length * 1.25))
    while (tam > 4 && !linhas.every(l => l.obj.widthOfTextAtSize(l.texto, tam * l.escala) <= maximo)) tam -= 0.25
  } else {
    tam = selo.fonte
  }
  for (const l of linhas) caberNaLargura(l, tam * l.escala, maximo)

  const passo = tam * 1.25
  const centralizado = selo.alinhamento === 'centro'
  const topo = centralizado ? altura - Math.max(pad, (altura - passo * linhas.length) / 2) : altura - pad

  let ops = ''
  if (selo.borda) ops += `q 0.5 w 0.45 0.45 0.45 RG 0.25 0.25 ${(largura - 0.5).toFixed(2)} ${(altura - 0.5).toFixed(2)} re S Q\n`
  ops += `q 0 0 ${largura.toFixed(2)} ${altura.toFixed(2)} re W n\n` // recorta o que passar do quadro
  linhas.forEach((l, i) => {
    const t = tam * l.escala
    const x = centralizado ? (largura - l.obj.widthOfTextAtSize(l.texto, t)) / 2 : pad
    const y = topo - tam * 0.95 - i * passo
    ops += `BT /${l.fonte} ${t.toFixed(2)} Tf 0.1 0.1 0.1 rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${literalPdf(l.texto)} Tj ET\n`
  })
  return `${ops}Q\n`
}

/**
 * Selo no estilo do Adobe Acrobat: o NOME em destaque na coluna da esquerda
 * (quebrado em linhas, centralizado, no maior tamanho que cabe) e, na da direita,
 * os detalhes pequenos: "Assinado de forma digital por NOME" e "Dados: AAAA.MM.DD
 * hh:mm:ss -03'00'", mais o texto adicional, se houver.
 */
function conteudoAdobe(largura, altura, titular, quando, fontes, selo) {
  const pad = 4
  const nome = winAnsi(titular)
  const temDetalhes = selo.mostrarRotulo || selo.mostrarData || Boolean(selo.textoExtra)
  const colunaEsq = temDetalhes ? largura * 0.45 : largura // sem detalhes, o nome ocupa tudo
  const larguraNome = colunaEsq - 2 * pad
  const larguraDetalhes = largura - colunaEsq - pad - 2

  // Nome: o maior tamanho (até 26 pt) em que nenhuma palavra precisa ser partida e
  // as linhas cabem na altura da coluna (como o Acrobat: reduz a fonte, não parte palavras).
  let tamNome = Math.min(26, altura * 0.5)
  let linhasNome = quebrarLinhas(nome, fontes.normal, tamNome, larguraNome)
  while (tamNome > 5 && (palavraMaior(nome, fontes.normal, tamNome) > larguraNome || linhasNome.length * tamNome * 1.15 > altura - 2 * pad)) {
    tamNome -= 0.5
    linhasNome = quebrarLinhas(nome, fontes.normal, tamNome, larguraNome)
  }

  // Detalhes: texto corrido em até 9 pt (ou o tamanho escolhido).
  const textos = []
  if (selo.mostrarRotulo) textos.push(`Assinado de forma digital por ${nome}`)
  if (selo.mostrarData) textos.push(`Dados: ${dataAdobe(quando)}`)
  if (selo.textoExtra) textos.push(winAnsi(selo.textoExtra))
  const montar = t => textos.flatMap(x => quebrarLinhas(x, fontes.normal, t, larguraDetalhes))
  let tamDet = selo.fonte === 'auto' ? 9 : selo.fonte
  let linhasDet = montar(tamDet)
  if (selo.fonte === 'auto') {
    const maiorPalavra = t => Math.max(0, ...textos.map(x => palavraMaior(x, fontes.normal, t)))
    while (tamDet > 4.5 && (maiorPalavra(tamDet) > larguraDetalhes || linhasDet.length * tamDet * 1.2 > altura - 2 * pad)) {
      tamDet -= 0.25
      linhasDet = montar(tamDet)
    }
  }

  let ops = ''
  if (selo.borda) ops += `q 0.5 w 0.45 0.45 0.45 RG 0.25 0.25 ${(largura - 0.5).toFixed(2)} ${(altura - 0.5).toFixed(2)} re S Q\n`
  ops += `q 0 0 ${largura.toFixed(2)} ${altura.toFixed(2)} re W n\n`

  // Coluna do nome: centralizada na horizontal e na vertical.
  const passoNome = tamNome * 1.15
  const topoNome = altura / 2 + (linhasNome.length * passoNome) / 2
  linhasNome.forEach((linha, i) => {
    const x = (colunaEsq - fontes.normal.widthOfTextAtSize(linha, tamNome)) / 2
    const y = topoNome - tamNome * 0.85 - i * passoNome
    ops += `BT /F1 ${tamNome.toFixed(2)} Tf 0.1 0.1 0.1 rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${literalPdf(linha)} Tj ET\n`
  })

  // Coluna dos detalhes: alinhada à esquerda, centralizada na vertical.
  const passoDet = tamDet * 1.2
  const topoDet = altura / 2 + (linhasDet.length * passoDet) / 2
  linhasDet.forEach((linha, i) => {
    const y = topoDet - tamDet * 0.85 - i * passoDet
    ops += `BT /F1 ${tamDet.toFixed(2)} Tf 0.1 0.1 0.1 rg ${(colunaEsq + pad).toFixed(2)} ${y.toFixed(2)} Td ${literalPdf(linha)} Tj ET\n`
  })
  return `${ops}Q\n`
}

/** Escolhe o estilo do selo conforme as opções do grupo (utils/assinaturas/selo.js). */
function conteudoDoSelo(largura, altura, titular, quando, fontes, seloEntrada) {
  const selo = normalizarSelo(seloEntrada)
  return selo.estilo === 'simples'
    ? conteudoSimples(largura, altura, titular, quando, fontes, selo)
    : conteudoAdobe(largura, altura, titular, quando, fontes, selo)
}

// Matriz do formulário: o selo é desenhado em pé (orientação VISÍVEL); em
// páginas com /Rotate ele precisa ser girado no sentido contrário para ficar
// em pé na tela.
const MATRIZ_ROTACAO = { 0: [1, 0, 0, 1, 0, 0], 90: [0, 1, -1, 0, 0, 0], 180: [-1, 0, 0, -1, 0, 0], 270: [0, -1, 1, 0, 0, 0] }

// ── Assinatura de um PDF ──────────────────────────────────────────────

// PDF já assinado: regravá-lo invalidaria a assinatura anterior.
function jaTemAssinatura(pdfDoc) {
  try {
    const acro = pdfDoc.catalog.lookup(PDFName.of('AcroForm'))
    if (!(acro instanceof PDFDict)) return false
    const visitar = (lista, nivel) => {
      if (!(lista instanceof PDFArray) || nivel > 4) return false
      for (let i = 0; i < lista.size(); i++) {
        const campo = lista.lookup(i)
        if (!(campo instanceof PDFDict)) continue
        const tipo = campo.lookup(PDFName.of('FT'))
        if (tipo && tipo.toString() === '/Sig' && campo.lookup(PDFName.of('V'))) return true
        if (visitar(campo.lookup(PDFName.of('Kids')), nivel + 1)) return true
      }
      return false
    }
    return visitar(acro.lookup(PDFName.of('Fields')), 0)
  } catch {
    return false
  }
}

/**
 * Assina um PDF no campo do grupo e devolve os bytes do PDF assinado.
 *
 * @param {Uint8Array|ArrayBuffer} bytes   PDF original
 * @param {object} certificado             resultado de lerCertificado
 * @param {{ campo: object, pagina: { modo: string, numero?: number }, selo?: object,
 *           agora?: Date, motivo?: string, local?: string }} opcoes
 * @returns {Promise<{ pdf: Uint8Array, pagina: number }>}  `pagina` é base 1
 */
export async function assinarPdf(bytes, certificado, { campo, pagina, selo, agora = new Date(), motivo, local }) {
  let pdfDoc
  try {
    pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e) {
    if (e instanceof EncryptedPDFError) {
      throw new ErroAssinatura('criptografado', 'O PDF é protegido por senha e não pode ser assinado aqui.')
    }
    throw new ErroAssinatura('leitura', 'Não foi possível ler este PDF. Ele pode estar corrompido.')
  }
  if (jaTemAssinatura(pdfDoc)) {
    throw new ErroAssinatura('ja-assinado', 'O arquivo já tem assinatura digital; assiná-lo de novo invalidaria a anterior.')
  }

  const paginas = pdfDoc.getPages()
  const indice = indiceDaPagina(pagina, paginas.length)
  if (indice < 0) {
    throw new ErroAssinatura('sem-pagina', `A página escolhida não existe (o arquivo tem ${paginas.length}).`)
  }
  const pg = paginas[indice]
  const caixa = pg.getCropBox()
  const rotacao = normalizarRotacao(pg.getRotation().angle)
  const ret = retanguloPdf(campo, { x0: caixa.x, y0: caixa.y, largura: caixa.width, altura: caixa.height, rotacao })
  if (ret.fora) {
    throw new ErroAssinatura('fora', 'O campo de assinatura não cabe nesta página.')
  }

  const ctx = pdfDoc.context
  const fonteNormal = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fonteNegrito = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Aparência: desenhada na orientação visível, com a matriz compensando a rotação.
  const girada = rotacao % 180 !== 0
  const largVisivel = girada ? ret.altura : ret.largura
  const altVisivel = girada ? ret.largura : ret.altura
  const aparencia = ctx.register(ctx.stream(
    conteudoDoSelo(largVisivel, altVisivel, certificado.titular, agora, { normal: fonteNormal, negrito: fonteNegrito }, selo),
    {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, largVisivel, altVisivel],
      Matrix: MATRIZ_ROTACAO[rotacao],
      Resources: { Font: { F1: fonteNormal.ref, F2: fonteNegrito.ref } },
    },
  ))

  // /ByteRange e /Contents provisórios (valores distintos e de largura fixa,
  // para localizá-los e trocá-los sem mudar o tamanho do arquivo).
  const assinaturaDict = ctx.register(ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'ETSI.CAdES.detached',
    ByteRange: [0, 1000000001, 1000000002, 1000000003],
    Contents: PDFHexString.of('0'.repeat(TAM_HEX)),
    M: PDFString.of(dataPdf(agora)),
    Name: PDFHexString.fromText(certificado.titular),
    ...(motivo ? { Reason: PDFHexString.fromText(motivo) } : {}),
    ...(local ? { Location: PDFHexString.fromText(local) } : {}),
  }))

  const widget = ctx.register(ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFString.of(`Assinatura_${Date.now().toString(36)}`),
    Rect: [ret.x, ret.y, ret.x + ret.largura, ret.y + ret.altura],
    F: 132, // imprimível + travado
    V: assinaturaDict,
    P: pg.ref,
    AP: { N: aparencia },
  }))
  pg.node.addAnnot(widget)
  const acro = pdfDoc.catalog.getOrCreateAcroForm()
  acro.addField(widget)
  acro.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3)) // SignaturesExist | AppendOnly

  // Sem object streams: o dicionário da assinatura precisa estar em texto puro.
  const salvo = await pdfDoc.save({ useObjectStreams: false })
  return { pdf: await selar(salvo, certificado), pagina: indice + 1 }
}

// Localiza o espaço reservado, calcula o hash do resto do arquivo e grava o CMS.
async function selar(pdf, certificado) {
  const total = pdf.length
  // Os objetos novos têm os números mais altos, então ficam no fim do arquivo.
  const tamCauda = Math.min(total, 4 * 1024 * 1024)
  const base = total - tamCauda
  const cauda = latin1(pdf.subarray(base))

  const marcador = '/Contents <' + '0'.repeat(64)
  const iContents = cauda.lastIndexOf(marcador)
  const re = /\/ByteRange\s*\[\s*0\s+1000000001\s+1000000002\s+1000000003\s*\]/g
  let achado = null
  for (let m; (m = re.exec(cauda)); ) achado = m
  if (iContents < 0 || !achado) {
    throw new ErroAssinatura('interno', 'Não foi possível localizar o campo de assinatura no arquivo gerado.')
  }

  const inicioHex = base + iContents + '/Contents '.length // índice do '<'
  const fimHex = inicioHex + 1 + TAM_HEX + 1 // logo após o '>'
  if (latin1(pdf.subarray(fimHex - 1, fimHex)) !== '>') {
    throw new ErroAssinatura('interno', 'O espaço reservado da assinatura está inconsistente.')
  }

  // /ByteRange real: mesma largura que o provisório (números preenchidos com espaço).
  const intervalo = [0, inicioHex, fimHex, total - fimHex]
  const largo = n => String(n).padEnd(10, ' ')
  const novoTexto = achado[0]
    .replace('1000000001', largo(intervalo[1]))
    .replace('1000000002', largo(intervalo[2]))
    .replace('1000000003', largo(intervalo[3]))
  escreverLatin1(pdf, base + achado.index, novoTexto)

  // Hash de tudo, exceto o espaço reservado.
  const aAssinar = new Uint8Array(inicioHex + (total - fimHex))
  aAssinar.set(pdf.subarray(0, inicioHex), 0)
  aAssinar.set(pdf.subarray(fimHex), inicioHex)
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', aAssinar))

  const cms = forge.util.bytesToHex(construirCms(certificado, paraBinario(hash))).toUpperCase()
  if (cms.length > TAM_HEX) {
    throw new ErroAssinatura('interno', 'A assinatura (com a cadeia de certificados) não cabe no espaço reservado.')
  }
  escreverLatin1(pdf, inicioHex + 1, cms.padEnd(TAM_HEX, '0'))
  return pdf
}
