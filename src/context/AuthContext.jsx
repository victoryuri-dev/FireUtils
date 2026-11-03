import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const Ctx = createContext(null)

function traduzErro(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com esse e-mail.'
  if (/Password should be at least/i.test(msg)) return 'A senha não atende aos requisitos mínimos de segurança.'
  if (/Unable to validate email address|Email address .* is invalid/i.test(msg)) return 'E-mail inválido.'
  if (/New password should be different/i.test(msg)) return 'A nova senha precisa ser diferente da atual.'
  if (/weak|pwned|compromised/i.test(msg)) return 'Senha fraca ou já exposta em vazamentos — escolha outra.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.'
  return msg
}

// Mesmo e-mail em caixas diferentes ou com espaços não pode virar outra conta.
const normalizarEmail = email => (email || '').trim().toLowerCase()

export function AuthProvider({ children }) {
  // undefined = ainda carregando a sessão inicial; null = deslogado
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password })
    if (!error) return { ok: true }
    return { ok: false, error: traduzErro(error.message), naoConfirmado: error.code === 'email_not_confirmed' || /Email not confirmed/i.test(error.message) }
  }

  const resendConfirmation = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: normalizarEmail(email), options: { emailRedirectTo: `${window.location.origin}/login` } })
    return error ? { ok: false, error: traduzErro(error.message) } : { ok: true }
  }

  // `registro` ({ conselhoTipo, conselhoNumero }) vai em user_metadata; o
  // trigger criar_perfil_no_cadastro (migração 20261103120000) o copia pro perfil.
  const signUp = async (email, password, registro = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email: normalizarEmail(email), password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { conselho_tipo: registro.conselhoTipo || '', conselho_numero: (registro.conselhoNumero || '').trim() },
      },
    })
    if (error) return { ok: false, error: traduzErro(error.message) }
    return { ok: true, needsConfirmation: !data.session }
  }

  const signOut = () => supabase.auth.signOut()

  // Login social: o provedor precisa estar ligado no painel do Supabase. A
  // sessão volta pela URL e chega por onAuthStateChange (LoginRoute navega).
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    })
    return error ? { ok: false, error: traduzErro(error.message) } : { ok: true }
  }

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizarEmail(email), { redirectTo: `${window.location.origin}/redefinir-senha` })
    return error ? { ok: false, error: traduzErro(error.message) } : { ok: true }
  }

  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    return error ? { ok: false, error: traduzErro(error.message) } : { ok: true }
  }

  return (
    <Ctx.Provider value={{
      session,
      user: session?.user ?? null,
      loading: session === undefined,
      signIn, signUp, signOut, resendConfirmation, signInWithGoogle, resetPassword, updatePassword,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
