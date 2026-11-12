// lib/recarregarPorVersao.js — versão nova publicada com a aba aberta.
//
// Depois de um deploy, uma aba com a versão antiga procura arquivos (chunks) que não existem mais
// e o carregamento falha (404). Recarregar a página pega a versão nova. Só tenta uma vez a cada
// 30 s: se falhar de novo logo em seguida é um problema real, e o erro aparece.

const CHAVE = 'fireutils.recarregou-por-versao'

/** Recarrega a página, no máximo uma vez a cada 30 s. @returns {boolean} true se recarregou */
export function recarregarPorVersao() {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) || 0)
    if (Date.now() - ultima < 30000) return false
    sessionStorage.setItem(CHAVE, String(Date.now()))
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  window.location.reload()
  return true
}

/**
 * `import()` para usar com `lazy`: se o arquivo da versão antiga sumiu, recarrega a página em vez
 * de quebrar. Enquanto recarrega, a promessa fica pendente (a tela de carregando continua).
 */
export function importarOuRecarregar(carregar) {
  return carregar().catch(erro => {
    if (recarregarPorVersao()) return new Promise(() => {})
    throw erro
  })
}
