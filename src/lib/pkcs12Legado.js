// lib/pkcs12Legado.js — suporte a cifras antigas de arquivos .pfx/.p12.
//
// O node-forge lê .pfx cifrados com 3DES (3 chaves), RC2 de 40 bits e AES, mas
// recusa três algoritmos legados que algumas certificadoras e versões antigas
// do Windows ainda usam:
//
//   1.2.840.113549.1.12.1.1  pbeWithSHAAnd128BitRC4
//   1.2.840.113549.1.12.1.2  pbeWithSHAAnd40BitRC4
//   1.2.840.113549.1.12.1.4  pbeWithSHAAnd2-KeyTripleDES-CBC
//   1.2.840.113549.1.12.1.5  pbeWithSHAAnd128BitRC2-CBC
//
// Esta função acrescenta esses quatro ao despachante de cifras do forge
// (forge.pki.pbe.getCipher), sem alterar o comportamento dos já suportados: o
// que não é nosso segue para a função original. É um ajuste global e idempotente.
// Só serve para DECIFRAR arquivos que o usuário já tem; nada é cifrado aqui.

import forge from 'node-forge'

const RAIZ = '1.2.840.113549.1.12.1.'

// RC4 (cifra de fluxo; o forge não tem). Mesma interface das cifras do forge.
function criarRc4(chave) {
  const S = Array.from({ length: 256 }, (_, i) => i)
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + chave.charCodeAt(i % chave.length)) & 255
    ;[S[i], S[j]] = [S[j], S[i]]
  }
  let a = 0
  let b = 0
  return {
    output: forge.util.createBuffer(),
    update(entrada) {
      const dados = entrada.getBytes()
      let saida = ''
      for (let k = 0; k < dados.length; k++) {
        a = (a + 1) & 255
        b = (b + S[a]) & 255
        ;[S[a], S[b]] = [S[b], S[a]]
        saida += String.fromCharCode(dados.charCodeAt(k) ^ S[(S[a] + S[b]) & 255])
      }
      this.output.putBytes(saida)
    },
    finish() { return true },
  }
}

const ALGORITMOS = {
  [`${RAIZ}1`]: { nome: 'RC4 de 128 bits', tamanhoChave: 16, tamanhoIv: 0, criar: chave => criarRc4(chave) },
  [`${RAIZ}2`]: { nome: 'RC4 de 40 bits', tamanhoChave: 5, tamanhoIv: 0, criar: chave => criarRc4(chave) },
  // 3DES de 2 chaves: a terceira chave repete a primeira.
  [`${RAIZ}4`]: {
    nome: '3DES de 2 chaves',
    tamanhoChave: 16,
    tamanhoIv: 8,
    criar: (chave, iv) => forge.des.startDecrypting(forge.util.createBuffer(chave + chave.slice(0, 8)), forge.util.createBuffer(iv)),
  },
  [`${RAIZ}5`]: {
    nome: 'RC2 de 128 bits',
    tamanhoChave: 16,
    tamanhoIv: 8,
    criar: (chave, iv) => {
      const cifra = forge.rc2.createDecryptionCipher(forge.util.createBuffer(chave), 128)
      cifra.start(forge.util.createBuffer(iv), null)
      return cifra
    },
  },
}

/** Nomes legíveis dos algoritmos de cifra de PKCS#12 (para mensagens de erro). */
export const NOME_DA_CIFRA = {
  [`${RAIZ}3`]: '3DES de 3 chaves',
  [`${RAIZ}6`]: 'RC2 de 40 bits',
  '1.2.840.113549.1.5.13': 'PBES2 (PBKDF2 + AES/3DES)',
  ...Object.fromEntries(Object.entries(ALGORITMOS).map(([oid, a]) => [oid, a.nome])),
}

let aplicado = false

/** Ativa a leitura das cifras legadas. Seguro chamar várias vezes. */
export function habilitarCifrasLegadas() {
  if (aplicado) return
  aplicado = true
  const original = forge.pki.pbe.getCipher
  forge.pki.pbe.getCipher = function getCipherComLegadas(oid, params, password) {
    const algoritmo = ALGORITMOS[oid]
    if (!algoritmo) return original.call(this, oid, params, password)

    // PKCS12PbeParams ::= SEQUENCE { salt OCTET STRING, iterations INTEGER }
    const sal = forge.util.createBuffer(params.value[0].value)
    const bytesIteracoes = forge.util.createBuffer(params.value[1].value)
    const iteracoes = bytesIteracoes.getInt(bytesIteracoes.length() << 3)

    // Derivação de chave e IV do PKCS#12 (RFC 7292, apêndice B) com SHA-1.
    const md = forge.md.sha1.create()
    const chave = forge.pki.pbe.generatePkcs12Key(password, sal, 1, iteracoes, algoritmo.tamanhoChave, md).getBytes()
    let iv = ''
    if (algoritmo.tamanhoIv) {
      md.start()
      iv = forge.pki.pbe.generatePkcs12Key(password, sal, 2, iteracoes, algoritmo.tamanhoIv, md).getBytes()
    }
    return algoritmo.criar(chave, iv)
  }
}
