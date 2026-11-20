// Site público (landing, planos, quiz) — repositório separado. Configure
// VITE_SITE_URL com o endereço dele, sem barra no final. Enquanto não houver
// domínio próprio, use o endereço da Vercel do site.
export const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/+$/, '')

export function urlDoSite(caminho = '/') {
  return `${SITE_URL}${caminho}`
}
