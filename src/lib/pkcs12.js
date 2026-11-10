// lib/pkcs12.js — leitor tolerante de arquivos .pfx/.p12 (PKCS#12, RFC 7292).
//
// Por que não usar forge.pkcs12.pkcs12FromAsn1: ele aborta com "Unsupported
// PKCS#12 SafeBag type" ao encontrar qualquer bolsa que não conhece (secretBag,
// crlBag, safeContentsBag...), e alguns programas (o Adobe Reader, por exemplo)
// gravam bolsas extras nos seus .pfx. Aqui o que não interessa é ignorado: só
// precisamos da chave privada e dos certificados.
//
// O que este leitor faz, passo a passo:
//   1. confere a versão e extrai o AuthenticatedSafe;
//   2. verifica o MAC com a senha (é o que distingue "senha errada");
//   3. decifra cada ContentInfo (dados em claro ou EncryptedData);
//   4. percorre as SafeBags: chave (em claro ou cifrada) e certificados X.509 são
//      lidos; qualquer outra bolsa é só registrada em `ignorados`.
//
// As cifras (3DES, RC2, RC4, AES...) vêm do forge, ampliado por pkcs12Legado.js.

import forge from 'node-forge'
import { habilitarCifrasLegadas } from './pkcs12Legado.js'

habilitarCifrasLegadas()

const A = forge.asn1

/** Erro de leitura do .pfx; `codigo` é 'senha' ou 'formato'. */
export class ErroPfx extends Error {
  constructor(codigo, mensagem, { detalhe, oid } = {}) {
    super(mensagem)
    this.name = 'ErroPfx'
    this.codigo = codigo
    this.detalhe = detalhe
    this.oid = oid
  }
}

const OID = {
  data: '1.2.840.113549.1.7.1',
  encryptedData: '1.2.840.113549.1.7.6',
  keyBag: '1.2.840.113549.1.12.10.1.1',
  pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  certBag: '1.2.840.113549.1.12.10.1.3',
  x509Certificate: '1.2.840.113549.1.9.22.1',
}

// MAC do PFX: algoritmo de hash -> (resumo, tamanho da chave em bytes).
const MACS = {
  '1.3.14.3.2.26': { md: () => forge.md.sha1.create(), bytes: 20 },
  '2.16.840.1.101.3.4.2.1': { md: () => forge.md.sha256.create(), bytes: 32 },
  '2.16.840.1.101.3.4.2.2': { md: () => forge.md.sha384.create(), bytes: 48 },
  '2.16.840.1.101.3.4.2.3': { md: () => forge.md.sha512.create(), bytes: 64 },
  '1.2.840.113549.2.5': { md: () => forge.md.md5.create(), bytes: 16 },
}

const paraBinario = bytes => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return s
}

// OCTET STRING simples ou "construída" (BER, em pedaços) -> bytes.
function bytesDe(no) {
  if (!no.constructed) return no.value
  return no.value.map(bytesDe).join('')
}

const oidDe = no => A.derToOid(no.value)
const inteiroDe = no => {
  const b = forge.util.createBuffer(no.value)
  return b.getInt(b.length() << 3)
}
const lerBer = bytes => A.fromDer(forge.util.createBuffer(bytes), { strict: false, parseAllBytes: false })

function verificarMac(macData, conteudo, senha) {
  const algoritmo = macData.value[0].value[0].value[0]
  const oid = oidDe(algoritmo)
  const mac = MACS[oid]
  if (!mac) throw new ErroPfx('formato', 'Este .pfx usa um algoritmo de integridade (MAC) que o navegador não consegue ler.', { detalhe: `MAC OID ${oid}` })
  const digest = macData.value[0].value[1].value
  const sal = forge.util.createBuffer(macData.value[1].value)
  const iteracoes = macData.value[2] ? inteiroDe(macData.value[2]) : 1
  const md = mac.md()
  const chave = forge.pki.pbe.generatePkcs12Key(senha, sal, 3, iteracoes, mac.bytes, md)
  const hmac = forge.hmac.create()
  hmac.start(md, chave)
  hmac.update(conteudo)
  if (hmac.getMac().getBytes() !== digest) {
    throw new ErroPfx('senha', 'Senha incorreta.', { detalhe: 'MAC do PKCS#12 não confere' })
  }
}

// EncryptedData -> bytes do SafeContents.
function decifrarEncryptedData(dados, senha, macVerificado) {
  const info = dados.value[1] // EncryptedContentInfo
  const algoritmo = info.value[1]
  const oidCifra = oidDe(algoritmo.value[0])
  const cifra = forge.pki.pbe.getCipher(oidCifra, algoritmo.value[1], senha)
  cifra.update(forge.util.createBuffer(bytesDe(info.value[2])))
  if (!cifra.finish()) {
    // Com o MAC conferido, a senha está certa; sem MAC, é o único sinal que temos.
    throw macVerificado
      ? new ErroPfx('formato', 'Não foi possível decifrar o conteúdo do arquivo.', { detalhe: `cifra ${oidCifra}` })
      : new ErroPfx('senha', 'Senha incorreta.', { detalhe: 'falha ao decifrar sem MAC' })
  }
  return cifra.output.getBytes()
}

function lerSafeContents(bytes, senha, saida) {
  const bolsas = lerBer(bytes)
  if (!bolsas.constructed) throw new ErroPfx('formato', 'Estrutura do arquivo inesperada.', { detalhe: 'SafeContents não é uma SEQUENCE' })
  for (const bolsa of bolsas.value) {
    const tipo = oidDe(bolsa.value[0])
    const valor = bolsa.value[1].value[0]
    if (tipo === OID.keyBag || tipo === OID.pkcs8ShroudedKeyBag) {
      let info = valor
      if (tipo === OID.pkcs8ShroudedKeyBag) {
        info = forge.pki.decryptPrivateKeyInfo(valor, senha)
        if (!info) throw new ErroPfx('senha', 'Senha incorreta.', { detalhe: 'chave privada não decifrou' })
      }
      try {
        saida.chaves.push(forge.pki.privateKeyFromAsn1(info))
      } catch {
        saida.chavesNaoRsa++ // ex.: chave EC; só RSA é suportada
      }
    } else if (tipo === OID.certBag) {
      // CertBag ::= SEQUENCE { certId OID, certValue [0] EXPLICIT ANY }
      if (oidDe(valor.value[0]) !== OID.x509Certificate) { saida.ignorados.push(`certBag:${oidDe(valor.value[0])}`); continue }
      try {
        saida.certificados.push(forge.pki.certificateFromAsn1(lerBer(bytesDe(valor.value[1].value[0])), true))
      } catch {
        saida.ignorados.push('certBag:ilegível')
      }
    } else {
      saida.ignorados.push(tipo) // secretBag, crlBag, safeContentsBag...
    }
  }
}

/**
 * Lê um .pfx/.p12.
 * @param {Uint8Array|ArrayBuffer} pfx
 * @param {string} senha
 * @returns {{ chaves: object[], certificados: object[], ignorados: string[], chavesNaoRsa: number }}
 * @throws {ErroPfx}
 */
export function lerPfx(pfx, senha) {
  const saida = { chaves: [], certificados: [], ignorados: [], chavesNaoRsa: 0 }
  try {
    const raiz = lerBer(paraBinario(pfx))
    if (!raiz.constructed || raiz.value.length < 2 || raiz.value[0].value.charCodeAt(0) !== 3) {
      throw new ErroPfx('formato', 'Isto não parece um certificado .pfx/.p12.', { detalhe: 'versão do PFX diferente de 3' })
    }
    const authSafe = raiz.value[1]
    if (oidDe(authSafe.value[0]) !== OID.data) {
      throw new ErroPfx('formato', 'Este .pfx usa proteção por chave pública, que não é suportada (só por senha).', { detalhe: `authSafe ${oidDe(authSafe.value[0])}` })
    }
    const conteudo = bytesDe(authSafe.value[1].value[0])

    const macData = raiz.value[2]
    if (macData) verificarMac(macData, conteudo, senha)

    const conteudos = lerBer(conteudo)
    for (const info of conteudos.value) {
      const tipo = oidDe(info.value[0])
      const dados = info.value[1].value[0]
      if (tipo === OID.data) lerSafeContents(bytesDe(dados), senha, saida)
      else if (tipo === OID.encryptedData) lerSafeContents(decifrarEncryptedData(dados, senha, Boolean(macData)), senha, saida)
      else saida.ignorados.push(tipo)
    }
  } catch (e) {
    if (e instanceof ErroPfx) throw e
    const msg = String(e?.message || e)
    // Cifra que o forge (mesmo ampliado) não conhece: traz o OID do algoritmo.
    if (e?.oid && /Unsupported OID/i.test(msg)) {
      throw new ErroPfx('formato', 'Este .pfx usa um algoritmo de criptografia que o navegador não consegue ler.', { detalhe: msg, oid: e.oid })
    }
    throw new ErroPfx('formato', 'Não foi possível ler o arquivo. Confira se é um certificado .pfx ou .p12 válido.', { detalhe: msg, oid: e?.oid })
  }
  return saida
}
