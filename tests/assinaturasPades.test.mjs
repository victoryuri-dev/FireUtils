import test from 'node:test'
import assert from 'node:assert/strict'
import forge from 'node-forge'
import { PDFDocument, PDFName, PDFArray, PDFDict, degrees } from 'pdf-lib'
import { lerCertificado, assinarPdf, ErroAssinatura } from '../src/lib/pades.js'
import { retanguloPdf } from '../src/utils/assinaturas/geometria.js'

const SENHA = 'senha-de-teste'
const A = forge.asn1

// Certificado de teste: pessoa física com a política 2.16.76.1.2.* (ICP-Brasil).
// RSA de 1024 bits só para o teste ser rápido; a produção usa o que o .pfx trouxer.
function criarPfx({ politicaIcp = true } = {}) {
  const chaves = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
  const cert = forge.pki.createCertificate()
  cert.publicKey = chaves.publicKey
  cert.serialNumber = '0a1b2c'
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
  const dn = [{ name: 'commonName', value: 'MARIA DA SILVA:00000000000' }, { name: 'organizationName', value: 'ICP-Brasil' }, { shortName: 'C', value: 'BR' }]
  cert.setSubject(dn)
  cert.setIssuer(dn)
  if (politicaIcp) {
    const oid = A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer('2.16.76.1.2.1.1').getBytes())
    const info = A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [oid])
    const politicas = A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [info])
    cert.setExtensions([{ id: '2.5.29.32', critical: false, value: A.toDer(politicas).getBytes() }])
  }
  cert.sign(chaves.privateKey, forge.md.sha256.create())
  const der = A.toDer(forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], SENHA, { algorithm: '3des' })).getBytes()
  return { pfx: Uint8Array.from(der, c => c.charCodeAt(0)), cert, chaves }
}

const { pfx, cert: certForge } = criarPfx()
const certificado = lerCertificado(pfx, SENHA)

async function pdfDeTeste({ largura = 842, altura = 595, rotacao = 0, paginas = 1 } = {}) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) {
    const p = doc.addPage([largura, altura])
    if (rotacao) p.setRotation(degrees(rotacao))
  }
  return doc.save()
}

const campo = { ancora: 'inferior-direita', dxMm: 10, dyMm: 10, larguraMm: 70, alturaMm: 30 }
const ultima = { modo: 'ultima' }

const latin1 = u8 => new TextDecoder('latin1').decode(u8)
const hexParaBytes = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16))

// Extrai /ByteRange e o CMS (DER) de um PDF assinado.
function lerAssinatura(pdf) {
  const texto = latin1(pdf)
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(texto)
  assert.ok(m, 'o PDF assinado precisa ter /ByteRange')
  const [a, b, c, d] = m.slice(1).map(Number)
  return { a, b, c, d, texto }
}

test('lê o certificado: titular, validade e política ICP-Brasil', () => {
  assert.equal(certificado.titular, 'MARIA DA SILVA:00000000000')
  assert.equal(certificado.icpBrasil, true)
  assert.equal(certificado.vencido, false)
  assert.equal(lerCertificado(criarPfx({ politicaIcp: false }).pfx, SENHA).icpBrasil, false)
})

test('senha errada e arquivo inválido têm erros próprios', () => {
  assert.throws(() => lerCertificado(pfx, 'errada'), e => e instanceof ErroAssinatura && e.codigo === 'senha')
  assert.throws(() => lerCertificado(new TextEncoder().encode('lixo'), SENHA), e => e instanceof ErroAssinatura && e.codigo === 'formato')
})

test('a assinatura cobre o arquivo todo, menos o espaço reservado', async () => {
  const { pdf } = await assinarPdf(await pdfDeTeste(), certificado, { campo, pagina: ultima })
  const { a, b, c, d, texto } = lerAssinatura(pdf)
  assert.equal(a, 0)
  assert.equal(c + d, pdf.length, 'o último intervalo vai até o fim do arquivo')
  assert.equal(texto[b], '<', 'o intervalo exclui exatamente o <hex>')
  assert.equal(texto[c - 1], '>')
  assert.ok(!texto.includes('1000000001'), 'os valores provisórios foram substituídos')
})

test('o CMS é uma assinatura RSA/SHA-256 válida do conteúdo, feita pelo certificado', async () => {
  const { pdf } = await assinarPdf(await pdfDeTeste(), certificado, { campo, pagina: ultima })
  const { a, b, c, d, texto } = lerAssinatura(pdf)

  // O CMS ocupa o começo do espaço reservado; o resto são zeros de preenchimento.
  const der = Array.from(hexParaBytes(texto.slice(b + 1, c - 1)), x => String.fromCharCode(x)).join('')
  const cms = A.fromDer(der, { parseAllBytes: false })
  const signedData = cms.value[1].value[0]
  const signerInfo = signedData.value[4].value[0]
  const atributos = signerInfo.value[3] // [0] IMPLICIT SET OF Attribute
  const porOid = {}
  for (const at of atributos.value) porOid[A.derToOid(at.value[0].value)] = at.value[1].value[0]

  // messageDigest == SHA-256 do que foi assinado
  const conteudo = new Uint8Array([...pdf.subarray(a, b), ...pdf.subarray(c, c + d)])
  const md = forge.md.sha256.create()
  md.update(Array.from(conteudo, x => String.fromCharCode(x)).join(''))
  assert.equal(porOid['1.2.840.113549.1.9.4'].value, md.digest().getBytes(), 'messageDigest')
  assert.ok(porOid['1.2.840.113549.1.9.16.2.47'], 'signing-certificate-v2 presente')

  // Assinatura RSA sobre os atributos (com etiqueta de SET).
  const emSet = A.create(A.Class.UNIVERSAL, A.Type.SET, true, atributos.value)
  const hashAttrs = forge.md.sha256.create()
  hashAttrs.update(A.toDer(emSet).getBytes())
  const assinatura = signerInfo.value[5].value
  assert.ok(certForge.publicKey.verify(hashAttrs.digest().getBytes(), assinatura), 'assinatura RSA confere')
})

test('o campo cai onde a geometria manda, em todas as rotações', async () => {
  for (const rotacao of [0, 90, 180, 270]) {
    const { pdf } = await assinarPdf(await pdfDeTeste({ rotacao }), certificado, { campo, pagina: ultima })
    const doc = await PDFDocument.load(pdf)
    const pg = doc.getPages()[0]
    const annots = pg.node.Annots()
    assert.ok(annots instanceof PDFArray && annots.size() === 1, `rot ${rotacao}: uma anotação`)
    const widget = annots.lookup(0, PDFDict)
    const rect = widget.lookup(PDFName.of('Rect'), PDFArray).asArray().map(n => n.asNumber())
    const box = pg.getCropBox()
    const esperado = retanguloPdf(campo, { x0: box.x, y0: box.y, largura: box.width, altura: box.height, rotacao })
    const perto = (x, y) => Math.abs(x - y) < 0.01
    assert.ok(perto(rect[0], esperado.x) && perto(rect[1], esperado.y) && perto(rect[2], esperado.x + esperado.largura) && perto(rect[3], esperado.y + esperado.altura), `rot ${rotacao}: Rect ${rect}`)
  }
})

test('assina a página pedida (primeira, número específico)', async () => {
  const original = await pdfDeTeste({ paginas: 3 })
  for (const [pagina, esperada] of [[{ modo: 'primeira' }, 1], [{ modo: 'numero', numero: 2 }, 2], [ultima, 3]]) {
    const r = await assinarPdf(original, certificado, { campo, pagina })
    assert.equal(r.pagina, esperada)
    const doc = await PDFDocument.load(r.pdf)
    doc.getPages().forEach((p, i) => assert.equal(Boolean(p.node.Annots()), i + 1 === esperada, `anotação só na página ${esperada}`))
  }
})

test('recusa: já assinado, página inexistente, campo fora da página e arquivo que não é PDF', async () => {
  const original = await pdfDeTeste()
  const assinado = (await assinarPdf(original, certificado, { campo, pagina: ultima })).pdf
  const codigo = async fn => { try { await fn(); return null } catch (e) { return e.codigo } }
  assert.equal(await codigo(() => assinarPdf(assinado, certificado, { campo, pagina: ultima })), 'ja-assinado')
  assert.equal(await codigo(() => assinarPdf(original, certificado, { campo, pagina: { modo: 'numero', numero: 4 } })), 'sem-pagina')
  assert.equal(await codigo(() => assinarPdf(original, certificado, { campo: { ...campo, larguraMm: 600 }, pagina: ultima })), 'fora')
  assert.equal(await codigo(() => assinarPdf(new TextEncoder().encode('não é um pdf'), certificado, { campo, pagina: ultima })), 'leitura')
})

test('o selo aceita nomes com acento e caracteres fora do WinAnsi sem quebrar', async () => {
  const { pfx: pfx2 } = criarPfx()
  const c = lerCertificado(pfx2, SENHA)
  c.titular = 'JOÃO D’ÁVILA ÇÃO — 北京'
  const { pdf } = await assinarPdf(await pdfDeTeste(), c, { campo, pagina: ultima })
  assert.ok(pdf.length > 1000)
})

// ── Leitura de .pfx em vários formatos de cifra ───────────────────────
import { readFileSync, readdirSync } from 'node:fs'

const PASTA_PFX = new URL('./fixtures/pfx/', import.meta.url)

test('lê e assina com .pfx de todas as cifras legadas e modernas', async () => {
  const arquivos = readdirSync(PASTA_PFX).filter(f => f.endsWith('.pfx'))
  assert.ok(arquivos.length >= 6, 'fixtures presentes')
  for (const nome of arquivos) {
    const cert = lerCertificado(readFileSync(new URL(nome, PASTA_PFX)), 'teste123')
    assert.equal(cert.titular, 'FELLIPE ALVES DE SOUSA:00000000000', nome)
    assert.equal(cert.icpBrasil, true, nome)
    // lerCertificado já confere que a chave decifrada pertence ao certificado; aqui
    // garantimos que essa chave de fato assina.
    const { pdf } = await assinarPdf(await pdfDeTeste(), cert, { campo, pagina: ultima })
    assert.ok(lerAssinatura(pdf).d > 0, `${nome}: PDF assinado`)
  }
})

test('senha errada num .pfx legado é "senha", e erro de leitura traz detalhe técnico', () => {
  const rc4 = readFileSync(new URL('rc4-128-rc2-40.pfx', PASTA_PFX))
  assert.throws(() => lerCertificado(rc4, 'errada'), e => e.codigo === 'senha')
  assert.throws(() => lerCertificado(new TextEncoder().encode('lixo'), SENHA), e => e.codigo === 'formato' && typeof e.detalhe === 'string' && e.detalhe.length > 0)
})

// ── .pfx com bolsas extras (como os IDs digitais do Adobe Reader) ─────
// Monta um PFX à mão: chave cifrada + certificado + uma secretBag e uma crlBag que
// o leitor deve IGNORAR (o node-forge sozinho aborta com "Unsupported SafeBag type").
function pfxComBolsasExtras({ chaves, cert, senha, macCorrompido = false }) {
  const oidNo = o => A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer(o).getBytes())
  const seq = (...v) => A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, v)
  const ctx0 = v => A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [v])
  const octeto = b => A.create(A.Class.UNIVERSAL, A.Type.OCTETSTRING, false, b)
  const inteiro = n => A.create(A.Class.UNIVERSAL, A.Type.INTEGER, false, A.integerToDer(n).getBytes())
  const nulo = () => A.create(A.Class.UNIVERSAL, A.Type.NULL, false, '')
  const bolsa = (oid, valor) => seq(oidNo(oid), ctx0(valor))
  const DATA = '1.2.840.113549.1.7.1'

  const chaveCifrada = forge.pki.encryptPrivateKeyInfo(
    forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(chaves.privateKey)), senha, { algorithm: 'aes128' })
  const certDer = A.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const safeContents = seq(
    bolsa('1.2.840.113549.1.12.10.1.5', seq(oidNo('1.2.3.4.5'), ctx0(octeto('segredo')))),                 // secretBag
    bolsa('1.2.840.113549.1.12.10.1.2', chaveCifrada),                                                    // chave
    bolsa('1.2.840.113549.1.12.10.1.4', seq(oidNo('1.2.840.113549.1.9.23.1'), ctx0(octeto('crl')))),      // crlBag
    bolsa('1.2.840.113549.1.12.10.1.3', seq(oidNo('1.2.840.113549.1.9.22.1'), ctx0(octeto(certDer)))),    // certificado
  )
  const authSafeDer = A.toDer(seq(seq(oidNo(DATA), ctx0(octeto(A.toDer(safeContents).getBytes()))))).getBytes()

  const sal = forge.random.getBytesSync(8)
  const iteracoes = 2048
  const chaveMac = forge.pki.pbe.generatePkcs12Key(senha, forge.util.createBuffer(sal), 3, iteracoes, 20, forge.md.sha1.create())
  const hmac = forge.hmac.create()
  hmac.start(forge.md.sha1.create(), chaveMac)
  hmac.update(authSafeDer)
  let digest = hmac.getMac().getBytes()
  if (macCorrompido) digest = digest.replace(/^./, c => String.fromCharCode(c.charCodeAt(0) ^ 0xff))
  const macData = seq(seq(seq(oidNo('1.3.14.3.2.26'), nulo()), octeto(digest)), octeto(sal), inteiro(iteracoes))

  const pfx = seq(inteiro(3), seq(oidNo(DATA), ctx0(octeto(authSafeDer))), macData)
  return Uint8Array.from(A.toDer(pfx).getBytes(), c => c.charCodeAt(0))
}

test('lê um .pfx com bolsas extras (secretBag, crlBag), ignora o que não interessa e assina', async () => {
  const { cert, chaves } = criarPfx({ politicaIcp: false })
  const pfxExtras = pfxComBolsasExtras({ chaves, cert, senha: SENHA })

  // O forge sozinho recusa este arquivo: é exatamente o defeito que o leitor próprio corrige.
  assert.throws(() => forge.pkcs12.pkcs12FromAsn1(A.fromDer(forge.util.createBuffer(pfxExtras)), SENHA), /SafeBag/)

  const c = lerCertificado(pfxExtras, SENHA)
  assert.equal(c.titular, 'MARIA DA SILVA:00000000000')
  assert.equal(c.autoassinado, true, 'emissor == titular')
  assert.equal(c.icpBrasil, false)
  const { pdf } = await assinarPdf(await pdfDeTeste(), c, { campo, pagina: ultima })
  assert.ok(lerAssinatura(pdf).d > 0)
})

test('com bolsas extras, senha errada e MAC corrompido ainda são detectados como "senha"', () => {
  const { cert, chaves } = criarPfx({ politicaIcp: false })
  assert.throws(() => lerCertificado(pfxComBolsasExtras({ chaves, cert, senha: SENHA }), 'errada'), e => e.codigo === 'senha')
  assert.throws(() => lerCertificado(pfxComBolsasExtras({ chaves, cert, senha: SENHA, macCorrompido: true }), SENHA), e => e.codigo === 'senha')
})

// ── Aparência do selo ─────────────────────────────────────────────────
import { PDFRawStream } from 'pdf-lib'

// Texto do desenho do selo (o /AP /N do campo de assinatura) num PDF assinado.
async function desenhoDoSelo(pdf) {
  const doc = await PDFDocument.load(pdf)
  const widget = doc.getPages()[0].node.Annots().lookup(0, PDFDict)
  const normal = widget.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFRawStream)
  return latin1(normal.contents)
}

const agoraFixo = new Date(2026, 10, 10, 8, 18, 5) // 10/11/2026 08:18:05, no fuso local
const campoGrande = { ...campo, larguraMm: 140, alturaMm: 40 } // sem quebra de linha

async function assinarComSelo(selo, c = campoGrande) {
  const { pdf } = await assinarPdf(await pdfDeTeste(), certificado, { campo: c, pagina: ultima, selo, agora: agoraFixo })
  return desenhoDoSelo(pdf)
}

test('selo padrão: estilo Adobe Acrobat, sem borda, com "Assinado de forma digital por" e "Dados: AAAA.MM.DD hh:mm:ss -03\'00\'"', async () => {
  const d = await assinarComSelo(undefined)
  // O texto dos detalhes pode quebrar em linhas; junta o que foi desenhado (cada Tj é uma linha).
  const desenhado = [...d.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map(m => m[1]).join(' ')
  assert.match(desenhado, /Assinado de forma digital por MARIA DA SILVA:00000000000/)
  assert.match(desenhado, /Dados: 2026\.11\.10 08:18:05 [+-]\d{2}'\d{2}'/)
  assert.ok(!d.includes(' re S'), 'sem borda')
})

test('opções do selo: ocultar linhas e texto adicional', async () => {
  const sem = await assinarComSelo({ mostrarData: false, mostrarRotulo: false, textoExtra: 'CREA 1234-MA' })
  assert.doesNotMatch(sem, /Dados:/)
  assert.doesNotMatch(sem, /Assinado de forma digital/)
  assert.match(sem, /CREA 1234-MA/)
})

test('estilo Adobe desenha o nome em negrito (/F2) e os detalhes em fonte normal (/F1)', async () => {
  const d = await assinarComSelo(undefined)
  assert.match(d, /\/F2 [\d.]+ Tf[^\n]*\(MARIA/, 'nome em negrito')
  assert.match(d, /\/F1 [\d.]+ Tf[^\n]*\(Dados:/, 'detalhes em fonte normal')
})

test('o selo nunca parte palavras do nome e continua assinando com nome longo em quadro pequeno', async () => {
  const c = lerCertificado(criarPfx().pfx, SENHA)
  c.titular = 'FELLIPE ALVES DE SOUSA - CPF: 000.000.000-00'
  const { pdf } = await assinarPdf(await pdfDeTeste(), c, { campo: { ...campo, larguraMm: 50, alturaMm: 20 }, pagina: ultima, agora: agoraFixo })
  const d = latin1(new TextEncoder().encode(await desenhoDoSelo(pdf)))
  for (const palavra of ['FELLIPE', 'ALVES', 'SOUSA', '000.000.000-00']) assert.ok(d.includes(palavra), `palavra inteira: ${palavra}`)
})
