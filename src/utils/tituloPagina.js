import { SISTEMAS } from '../data/sistemasMenu'

// Título da aba do navegador: "FireUtils | {página}". Landing e Pricing
// definem o próprio título (null = não mexe).
const NOME = 'FireUtils'
const DO_PROJETO = { dashboard: 'Dashboard', auditoria: 'Auditoria', config: 'Configuração', documentos: 'Documentos' }

export function paginaDaRota(pathname) {
  const partes = pathname.split('/').filter(Boolean)
  if (partes[0] === 'landing' || partes[0] === 'pricing') return null
  if (partes[0] === 'projetos' || partes.length === 0) return 'Projetos'
  if (partes[0] === 'perfil') return 'Perfil'
  if (partes[0] === 'assinaturas') return 'Assinaturas'
  if (partes[0] === 'login') return 'Entrar'
  if (partes[0] === 'projeto') {
    if (partes[2] === 'medida') return SISTEMAS.find(s => s.key === partes[3])?.label || 'Medida de segurança'
    return DO_PROJETO[partes[2]] || 'Dashboard'
  }
  return null
}

export function tituloDaRota(pathname) {
  const pagina = paginaDaRota(pathname)
  return pagina ? `${NOME} | ${pagina}` : null
}
