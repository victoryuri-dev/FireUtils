// utils/assinaturas/saida.js — nomes dos arquivos e pastas do que é baixado.

const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Nome de arquivo assinado: o mesmo do original (sem sufixo); repetido ganha " (2)", " (3)"… */
export function nomeDeArquivo(nome, usados) {
  const base = String(nome).replace(/\.pdf$/i, '')
  let candidato = `${base}.pdf`
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base} (${n}).pdf`
  usados.add(candidato.toLowerCase())
  return candidato
}

/**
 * Nome de pasta a partir do nome do grupo: tira o que o Windows/ZIP não aceitam (\ / : * ? " < > |),
 * pontos e espaços nas pontas e nomes reservados; repetido ganha " (2)", " (3)"…
 * @param {string} nome
 * @param {Set<string>} usadas  nomes já usados (minúsculos); é atualizado
 */
export function nomeDePasta(nome, usadas) {
  let base = String(nome ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 60)
    .replace(/[\s.]+$/g, '')
  if (!base) base = 'Grupo'
  if (RESERVADOS.test(base)) base = `${base}_`
  let candidato = base
  for (let n = 2; usadas.has(candidato.toLowerCase()); n++) candidato = `${base} (${n})`
  usadas.add(candidato.toLowerCase())
  return candidato
}
