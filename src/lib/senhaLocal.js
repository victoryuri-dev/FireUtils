// lib/senhaLocal.js — "lembrar a senha do certificado NESTE dispositivo".
//
// A senha NUNCA vai para a conta/servidor: quem tivesse acesso ao banco teria o arquivo .pfx E a
// senha, ou seja, a chave de assinatura inteira. Em vez disso ela fica só neste navegador,
// cifrada (AES-GCM) com uma chave NÃO EXTRAÍVEL do WebCrypto guardada no IndexedDB: o código da
// página consegue usá-la, mas ninguém consegue copiar a chave para fora. Em outro dispositivo ou
// navegador a senha é pedida de novo, uma vez. Sem IndexedDB/WebCrypto (janela anônima, bloqueio):
// tudo aqui falha em silêncio e a senha simplesmente é pedida a cada assinatura.

const BANCO = 'fireutils-assinaturas'
const LOJA = 'senhas'
const CHAVE_MESTRA = '__chave__'

/** Cifra um texto com a chave dada. @returns {Promise<{ iv: Uint8Array, dados: Uint8Array }>} */
export async function cifrarTexto(chave, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const dados = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto)))
  return { iv, dados }
}

/** Inverso de `cifrarTexto`; lança se a chave ou os dados não conferem. */
export async function decifrarTexto(chave, { iv, dados }) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, dados))
}

const pedido = req => new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error) })

let bancoAberto = null
function abrir() {
  if (!bancoAberto) {
    bancoAberto = new Promise((ok, falha) => {
      const req = indexedDB.open(BANCO, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA)
      req.onsuccess = () => ok(req.result)
      req.onerror = () => falha(req.error)
    })
    bancoAberto.catch(() => { bancoAberto = null })
  }
  return bancoAberto
}

async function loja(modo) {
  const db = await abrir()
  return db.transaction(LOJA, modo).objectStore(LOJA)
}

// A chave mestra é criada na primeira vez. extractable=false: não dá para exportá-la.
async function chaveMestra(criar) {
  let chave = await pedido((await loja('readonly')).get(CHAVE_MESTRA))
  if (!chave && criar) {
    chave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await pedido((await loja('readwrite')).put(chave, CHAVE_MESTRA))
  }
  return chave ?? null
}

const registro = id => `senha:${id}`

/** Guarda a senha do certificado `id` neste dispositivo. @returns {Promise<boolean>} se conseguiu */
export async function guardarSenha(id, senha) {
  try {
    const chave = await chaveMestra(true)
    await pedido((await loja('readwrite')).put(await cifrarTexto(chave, senha), registro(id)))
    return true
  } catch { return false }
}

/** A senha guardada neste dispositivo, ou null (não há, ou não foi possível ler). */
export async function lerSenha(id) {
  try {
    const chave = await chaveMestra(false)
    const r = chave && await pedido((await loja('readonly')).get(registro(id)))
    return r ? await decifrarTexto(chave, r) : null
  } catch { return null }
}

export async function temSenha(id) {
  try { return Boolean(await pedido((await loja('readonly')).getKey(registro(id)))) } catch { return false }
}

export async function apagarSenha(id) {
  try { await pedido((await loja('readwrite')).delete(registro(id))) } catch { /* nada a apagar */ }
}
