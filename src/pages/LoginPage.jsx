import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Loader from '../components/ui/Loader'
import Icon from '../components/ui/Icon'
import CampoConselho from '../components/ui/CampoConselho'
import { avaliarSenha, SENHA_MIN } from '../utils/senha'
import { ModuleNetwork } from './LandingPage'
import './LoginPage.css'

function LoginNetwork() {
  const networkRef = useRef(null)
  const stageRef = useRef(null)

  useEffect(() => {
    const network = networkRef.current
    const stage = stageRef.current
    if (!network || !stage) return
    const resize = () => {
      if (window.innerWidth > 700) {
        stage.style.setProperty('--login-network-scale', Math.min(stage.clientWidth, 1250) / 1160)
        return
      }
      stage.style.removeProperty('--login-network-scale')
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(network)
    observer.observe(stage)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <aside ref={networkRef} className="login-network" aria-label="Ecossistema de módulos FireUtils"><div ref={stageRef} className="login-network-stage"><ModuleNetwork/></div></aside>
}

function GoogleIcone() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
      <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  )
}

// Indicador de força: barras + requisitos que ainda faltam.
export function ForcaSenha({ senha }) {
  if (!senha) return null
  const { requisitos, nivel, rotulo } = avaliarSenha(senha)
  const cor = ['var(--color-red)', 'var(--color-amber)', 'var(--color-blue)', 'var(--color-green)'][nivel]
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= nivel ? cor : 'var(--color-border)' }}/>)}
      </div>
      <div className="text-[11px] mt-1" style={{ color: cor }}>Força: {rotulo}</div>
      {requisitos.some(r => !r.ok) && (
        <ul className="text-[11px] text-ink-faint mt-0.5 list-none p-0 m-0">
          {requisitos.filter(r => !r.ok).map(r => <li key={r.texto}>• {r.texto}</li>)}
        </ul>
      )}
    </div>
  )
}

// O redirecionamento após o login é controlado pelo LoginRoute em App.jsx,
// preservando a página de origem sem criar uma segunda navegação concorrente.
// Erros e avisos aparecem dentro do próprio card — os toasts ficam reservados
// ao retorno das importações do Revit.
export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, resetPassword, resendConfirmation } = useAuth()

  const [mode, setMode] = useState('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [conselhoTipo, setConselhoTipo] = useState('')
  const [conselhoNumero, setConselhoNumero] = useState('')
  const [busy, setBusy] = useState(false)
  const [mensagem, setMensagem] = useState(null) // { tipo: 'erro' | 'sucesso', texto }
  const [naoConfirmado, setNaoConfirmado] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMensagem(null)
    setNaoConfirmado(false)

    try {
      if (mode === 'recuperar') {
        const { ok, error: authError } = await resetPassword(email)
        // Mesma resposta exista ou não a conta, pra não revelar cadastros.
        setMensagem(ok
          ? { tipo: 'sucesso', texto: 'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.' }
          : { tipo: 'erro', texto: authError })
      } else if (mode === 'entrar') {
        const { ok, error: authError, naoConfirmado: pendente } = await signIn(email, password)
        if (!ok) { setMensagem({ tipo: 'erro', texto: authError }); setNaoConfirmado(!!pendente) }
      } else {
        if (!avaliarSenha(password).valida) {
          setMensagem({ tipo: 'erro', texto: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres, com letra e número.` })
          return
        }
        if (!conselhoTipo || !conselhoNumero.trim()) {
          setMensagem({ tipo: 'erro', texto: 'Informe o conselho (CREA ou CAU) e o número do registro.' })
          return
        }
        const { ok, needsConfirmation, error: authError } = await signUp(email, password, { conselhoTipo, conselhoNumero })
        if (!ok) {
          setMensagem({ tipo: 'erro', texto: authError })
          return
        }
        // Resposta neutra: com e-mail já cadastrado o Supabase também devolve
        // sucesso (e não envia nada) de propósito, pra ninguém descobrir quem tem conta.
        if (needsConfirmation) setMensagem({ tipo: 'sucesso', texto: 'Pronto! Se este e-mail ainda não tiver conta, enviamos um link de confirmação. Se você já tem cadastro, entre com sua senha ou use "Esqueci minha senha".' })
      }
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível conectar. Tente novamente em instantes.' })
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setBusy(true)
    setMensagem(null)
    const { ok, error: authError } = await signInWithGoogle()
    if (!ok) { setMensagem({ tipo: 'erro', texto: authError }); setBusy(false) }
  }

  const reenviar = async () => {
    setBusy(true)
    const { ok, error: authError } = await resendConfirmation(email)
    setBusy(false)
    setNaoConfirmado(false)
    setMensagem(ok ? { tipo: 'sucesso', texto: 'Se houver uma conta pendente com esse e-mail, enviamos um novo link de confirmação.' } : { tipo: 'erro', texto: authError })
  }

  const irPara = novo => { setMode(novo); setMensagem(null); setNaoConfirmado(false) }

  const isLogin = mode === 'entrar'
  const isCadastro = mode === 'cadastro'
  const isRecuperar = mode === 'recuperar'
  const erro = mensagem?.tipo === 'erro'

  return (
    <main className="login-original w-screen bg-bg">
      <LoginNetwork/>
      <div className="login-form-pane">
      <section className="login-original-card w-full max-w-[380px] bg-surface border border-border border-solid p-8" aria-labelledby="login-title">
        {busy && isLogin && (
          <div className="login-card-loader" role="status" aria-live="polite" aria-label="Entrando">
            <Loader size={44}/>
          </div>
        )}

        <h1 id="login-title" className="text-[15px] font-semibold text-ink mb-1">
          {isLogin ? 'Entrar' : isCadastro ? 'Criar conta' : 'Recuperar senha'}
        </h1>
        <p className="login-intro text-[12px] text-ink-faint mb-5">
          {isLogin ? 'Acesse seus projetos.' : isCadastro ? 'Comece a usar o Fire Utils.' : 'Enviaremos um link para você criar uma nova senha.'}
        </p>

        {!isRecuperar && (
          <>
            <button type="button" onClick={handleGoogle} disabled={busy}
              className="btn-ghost justify-center w-full mb-3.5">
              <GoogleIcone/> Continuar com o Google
            </button>
            <div className="flex items-center gap-3 mb-3.5 text-[11px] text-ink-faint" aria-hidden="true">
              <span className="flex-1 h-px bg-border"/>ou<span className="flex-1 h-px bg-border"/>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="fg">
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              type="email"
              placeholder=" "
              required
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </div>

          {!isRecuperar && (
            <div className="fg">
              <label htmlFor="login-password">Senha</label>
              <input
                id="login-password"
                type="password"
                placeholder=" "
                required
                minLength={isCadastro ? SENHA_MIN : undefined}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
              {isCadastro && <ForcaSenha senha={password}/>}
            </div>
          )}

          {isCadastro && (
            <CampoConselho tipo={conselhoTipo} numero={conselhoNumero}
              onTipo={event => setConselhoTipo(event.target.value)} onNumero={event => setConselhoNumero(event.target.value)}/>
          )}

          {isLogin && (
            <button type="button" onClick={() => irPara('recuperar')} disabled={busy}
              className="login-mode-toggle self-end text-[12px] text-ink-faint hover:text-ink -mt-1.5">
              Esqueci minha senha
            </button>
          )}

          {mensagem && (
            <div className={`ibox ${erro ? 'red' : 'green'} m-0`} role={erro ? 'alert' : 'status'}>
              <Icon name={erro ? 'warn' : 'check'} size={13} color={`var(--color-${erro ? 'red' : 'green'})`} className="shrink-0"/>
              <span className="text-xs">{mensagem.texto}</span>
            </div>
          )}

          {naoConfirmado && (
            <button type="button" onClick={reenviar} disabled={busy} className="login-mode-toggle self-start text-[12px] text-ink-muted hover:text-ink underline underline-offset-4">
              Reenviar e-mail de confirmação
            </button>
          )}

          <button type="submit" className="btn-primary justify-center mt-1" disabled={busy}>
            {busy ? 'Aguarde…' : (isLogin ? 'Entrar' : isCadastro ? 'Criar conta' : 'Enviar link')}
          </button>
        </form>

        <button type="button" onClick={() => irPara(isLogin ? 'cadastro' : 'entrar')} className="login-mode-toggle w-full text-center text-[12px] text-ink-faint hover:text-ink mt-4" disabled={busy}>
          {isLogin ? 'Não tem conta? Criar uma' : isCadastro ? 'Já tem conta? Entrar' : 'Voltar para o login'}
        </button>
      </section></div>
    </main>
  )
}

// Destino do link de recuperação enviado por e-mail (rota pública /redefinir-senha).
// O Supabase troca o link por uma sessão de recuperação (evento
// PASSWORD_RECOVERY / sessão ativa); só então o formulário de nova senha libera.
export function RedefinirSenhaPage({ onConcluir }) {
  const { session, loading, updatePassword } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [busy, setBusy] = useState(false)
  const [mensagem, setMensagem] = useState(null)

  const handleSubmit = async event => {
    event.preventDefault()
    setMensagem(null)
    if (!avaliarSenha(senha).valida) { setMensagem({ tipo: 'erro', texto: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres, com letra e número.` }); return }
    if (senha !== confirmar) { setMensagem({ tipo: 'erro', texto: 'As senhas não coincidem.' }); return }
    setBusy(true)
    const { ok, error: authError } = await updatePassword(senha)
    setBusy(false)
    if (!ok) { setMensagem({ tipo: 'erro', texto: authError }); return }
    setMensagem({ tipo: 'sucesso', texto: 'Senha alterada! Redirecionando…' })
    setTimeout(onConcluir, 1200)
  }

  const erro = mensagem?.tipo === 'erro'
  return (
    <main className="login-original w-screen bg-bg">
      <LoginNetwork/>
      <div className="login-form-pane">
        <section className="login-original-card w-full max-w-[380px] bg-surface border border-border border-solid p-8" aria-labelledby="redef-title">
          <h1 id="redef-title" className="text-[15px] font-semibold text-ink mb-1">Nova senha</h1>
          {loading ? <p className="login-intro text-[12px] text-ink-faint">Validando o link…</p>
            : !session ? (
              <>
                <p className="login-intro text-[12px] text-ink-faint mb-5">Este link é inválido ou expirou. Peça um novo na tela de login.</p>
                <button type="button" className="btn-primary justify-center w-full" onClick={onConcluir}>Ir para o login</button>
              </>
            ) : (
              <>
                <p className="login-intro text-[12px] text-ink-faint mb-5">Escolha uma nova senha para a sua conta.</p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                  <div className="fg">
                    <label htmlFor="nova-senha">Nova senha</label>
                    <input id="nova-senha" type="password" required minLength={SENHA_MIN} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)}/>
                    <ForcaSenha senha={senha}/>
                  </div>
                  <div className="fg">
                    <label htmlFor="confirmar-senha">Confirmar senha</label>
                    <input id="confirmar-senha" type="password" required autoComplete="new-password" value={confirmar} onChange={e => setConfirmar(e.target.value)}/>
                  </div>
                  {mensagem && (
                    <div className={`ibox ${erro ? 'red' : 'green'} m-0`} role={erro ? 'alert' : 'status'}>
                      <Icon name={erro ? 'warn' : 'check'} size={13} color={`var(--color-${erro ? 'red' : 'green'})`} className="shrink-0"/>
                      <span className="text-xs">{mensagem.texto}</span>
                    </div>
                  )}
                  <button type="submit" className="btn-primary justify-center mt-1" disabled={busy}>{busy ? 'Aguarde…' : 'Salvar nova senha'}</button>
                </form>
              </>
            )}
        </section>
      </div>
    </main>
  )
}
