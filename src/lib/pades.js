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
import { montarSelo } from '../utils/assinaturas/seloLayout.js'
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
 * @returns {{ impressao: string, titular, emissor, validoDe: Date, validoAte: Date,
 *             vencido: boolean, icpBrasil: boolean, autoassinado: boolean,
 *             certificados: object[], chave: object, cert: object }}
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

  const resumo = forge.md.sha256.create()
  resumo.update(derDe(forge.pki.certificateToAsn1(cert)))

  const agora = new Date()
  return {
    impressao: resumo.digest().toHex(),
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

function dataPdf(d) {
  const p = n => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sinal}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`
}

/**
 * Operadores de desenho do selo: converte o layout (utils/assinaturas/seloLayout.js,
 * o mesmo da prévia na tela) em conteúdo de PDF. O que passar do quadro é recortado.
 */
function conteudoDoSelo(largura, altura, titular, quando, selo) {
  const layout = montarSelo({ largura, altura, titular, quando, selo })
  let ops = ''
  ops += `q 0 0 ${largura.toFixed(2)} ${altura.toFixed(2)} re W n\n`
  for (const t of layout.textos) {
    const fonte = t.fonte === 'negrito' ? 'F2' : 'F1'
    ops += `BT /${fonte} ${t.tamanho.toFixed(2)} Tf 0.1 0.1 0.1 rg ${t.x.toFixed(2)} ${t.y.toFixed(2)} Td ${literalPdf(t.texto)} Tj ET\n`
  }
  return `${ops}Q\n`
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
    conteudoDoSelo(largVisivel, altVisivel, certificado.titular, agora, selo),
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
