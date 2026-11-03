// Regra de senha do cadastro e da redefinição: mínimo de 10 caracteres, com
// letra e número. O Supabase aplica a sua própria política no servidor (ver
// supabase/email-templates/LEIA-ME.md); aqui é só o retorno imediato na tela.
export const SENHA_MIN = 10

export function avaliarSenha(senha = '') {
  const requisitos = [
    { ok: senha.length >= SENHA_MIN, texto: `Pelo menos ${SENHA_MIN} caracteres` },
    { ok: /[a-zA-Z]/.test(senha), texto: 'Uma letra' },
    { ok: /\d/.test(senha), texto: 'Um número' },
  ]
  const extras = [/[a-z]/.test(senha) && /[A-Z]/.test(senha), /[^a-zA-Z0-9]/.test(senha), senha.length >= 14].filter(Boolean).length
  const valida = requisitos.every(r => r.ok)
  const nivel = !valida ? 0 : Math.min(3, 1 + extras)
  return { requisitos, valida, nivel, rotulo: ['Fraca', 'Razoável', 'Boa', 'Forte'][nivel] }
}
