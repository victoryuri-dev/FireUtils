// utils/assinaturas/certificadosSalvos.js — funções puras dos certificados salvos na conta.

/** Uint8Array -> base64 (em blocos, para arquivos grandes). */
export function bytesParaBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(s)
}

/** base64 -> Uint8Array. */
export function base64ParaBytes(base64) {
  const s = atob(base64)
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return u8
}

/** Date -> 'AAAA-MM-DD' no fuso local (o formato da coluna `date`). */
export function dataParaIso(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 'AAAA-MM-DD' -> Date à meia-noite LOCAL (new Date(texto) leria como UTC e cairia no dia anterior no Brasil). */
export function isoParaData(texto) {
  if (!texto) return null
  const [a, m, d] = String(texto).slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

const DIAS_AVISO = 30

/**
 * Situação de um certificado salvo (linha da tabela): vencido, vencendo ou ok.
 * @returns {{ status: 'ok'|'vencendo'|'vencido', dias: number, rotulo: string }}
 */
export function situacaoDoCertificado(certificado, hoje = new Date()) {
  const fim = isoParaData(certificado.valido_ate)
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const dias = fim ? Math.round((fim - inicioDoDia) / 86400000) : 0
  if (dias < 0) return { status: 'vencido', dias, rotulo: 'Vencido' }
  if (dias <= DIAS_AVISO) return { status: 'vencendo', dias, rotulo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}` }
  return { status: 'ok', dias, rotulo: 'Válido' }
}

/**
 * Qual certificado fica selecionado: o preferido (se ainda existe), senão o primeiro
 * que não está vencido, senão o primeiro; `null` se não há nenhum.
 */
export function escolherSelecionado(lista, preferidoId, hoje = new Date()) {
  if (!lista.length) return null
  const preferido = lista.find(c => c.id === preferidoId)
  if (preferido) return preferido.id
  const valido = lista.find(c => situacaoDoCertificado(c, hoje).status !== 'vencido')
  return (valido ?? lista[0]).id
}

/** Apelido padrão do certificado: o nome do titular, limitado a 80 caracteres. */
export function apelidoPadrao(titular) {
  return String(titular || 'Certificado').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Certificado'
}
