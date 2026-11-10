import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../lib/supabase'
import Icon from '../ui/Icon'

const reduzMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function BalaoIcon({ size = 22 }) {
  return (
    <svg width={size} height={size * 75 / 83} viewBox="0 0 83 75" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M83 54H32.7842L6.58691 74.5488L12.0254 54H0V0H83V54Z"/>
    </svg>
  )
}

// Botão flutuante presente em toda a plataforma — canto inferior direito.
// Sempre no tema escuro. Abre, acima dele, uma caixa que desliza da direita
// pra esquerda pra enviar sugestões ou relatar erros na tabela `feedbacks`.
export default function FeedbackWidget() {
  const { user } = useAuth()
  const location = useLocation()
  const toast = useToast()
  const painelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [montado, setMontado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)

  useLayoutEffect(() => {
    if (!montado || !painelRef.current) return
    const d = reduzMovimento() ? 0 : 1
    gsap.fromTo(painelRef.current,
      { x: 56, opacity: 0 },
      { x: 0, opacity: 1, duration: .38 * d, ease: 'power3.out', clearProps: 'transform,opacity' })
  }, [montado])

  const abrir = () => { setOpen(true); setMontado(true) }

  const fechar = () => {
    setOpen(false)
    setMensagem('')
    const el = painelRef.current
    if (!el) { setMontado(false); return }
    const d = reduzMovimento() ? 0 : 1
    gsap.to(el, { x: 56, opacity: 0, duration: .18 * d, ease: 'power2.in', onComplete: () => setMontado(false) })
  }

  const handleEnviar = async (e) => {
    e.preventDefault()
    const texto = mensagem.trim()
    if (!texto || enviando) return
    setEnviando(true)
    const { error } = await supabase.from('feedbacks').insert({
      user_id:  user?.id ?? null,
      usuario:  user?.email ?? '',
      pagina:   location.pathname,
      mensagem: texto,
    })
    setEnviando(false)
    if (error) {
      toast.error('Não foi possível enviar seu feedback. Tente novamente.')
      return
    }
    toast.success('Obrigado! Seu feedback foi enviado.')
    fechar()
  }

  return (
    // Em telas largas, a página pode declarar uma lateral fixa à direita (--feedback-direita,
    // ex.: 300px na ferramenta de assinaturas); o botão fica ao lado dela, e não por cima.
    <div className="platform-theme fixed bottom-6 right-0 lg:right-[var(--feedback-direita,0px)] z-[900] flex flex-col items-end gap-5" data-theme="dark">
      {open && <div className="fixed inset-0 z-40" onClick={fechar}/>}
      {montado && (
        <form
          ref={painelRef}
          onSubmit={handleEnviar}
          className="relative z-50 mr-6 w-[300px] max-w-[calc(100vw-48px)] border border-solid border-[rgba(255,255,255,.14)] bg-surface p-5 flex flex-col gap-5 shadow-[var(--shadow-md)]"
        >
          <textarea
            autoFocus
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            placeholder="Digite aqui sugestões de implementação ou relatos de erro para melhorar a ferramenta."
            rows={8}
            className="w-full resize-none text-[13px] text-ink bg-surface-2 border border-solid border-border rounded-md p-3 outline-none focus:border-ink-hint placeholder:text-ink-faint"
          />
          <button type="submit" className="btn-primary justify-center rounded-sm uppercase font-heading font-bold tracking-[.02em] disabled:opacity-60" disabled={!mensagem.trim() || enviando}>
            {enviando ? <Icon name="spinner" size={16} className="animate-spin"/> : <BalaoIcon size={16}/>}
            {enviando ? 'Enviando...' : 'Enviar feedback'}
          </button>
        </form>
      )}
      {/* Área de hover fixa, colada na borda: o botão dentro dela desliza 24px
          pra esquerda (e fica vermelho) sem perder o hover no meio do caminho.
          Em tela menor fica meio transparente (por cima do conteúdo). */}
      <div className="group relative z-50 w-12 h-12">
        <button
          type="button"
          onClick={() => (open ? fechar() : abrir())}
          title="Enviar feedback"
          aria-label="Enviar feedback"
          aria-expanded={open}
          className={`absolute inset-0 grid place-items-center border border-solid text-white shadow-[0_8px_24px_rgba(0,0,0,.38)] transition-[translate,background-color,border-color,box-shadow,opacity] duration-300 ease-out group-hover:-translate-x-6 group-hover:border-red group-hover:bg-red ${open ? '-translate-x-6 border-red bg-red' : 'border-[rgba(255,255,255,.16)] bg-[#24252c] max-[1280px]:opacity-50 max-[1280px]:group-hover:opacity-100 max-[1280px]:focus-visible:opacity-100'}`}
        >
          {open ? <Icon name="x" size={24} strokeWidth={3}/> : <BalaoIcon/>}
        </button>
      </div>
    </div>
  )
}
