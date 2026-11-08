import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

// Indicador de conceito — ícone "i" que, no hover, abre uma caixinha com a
// definição do campo (ex.: distinguir "altura total" de "altura da
// edificação" pros usuários que confundem as duas medidas).
//
// A caixinha é renderizada num portal no <body>, com posição fixa calculada a
// partir do ícone — assim nenhum contêiner com overflow (cards, tabelas,
// modais com rolagem) consegue cortá-la. `side` (top | bottom) e `align`
// (center | start | end) são só a preferência: se não couber, ela vira pro
// outro lado e é empurrada pra dentro da janela.
const MARGEM = 8   // folga mínima até a borda da janela
const FOLGA = 8    // distância entre o ícone e a caixinha

function posicionar(caixa, gatilho, side, align) {
  const g = gatilho.getBoundingClientRect()
  const c = caixa.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  const cabeAcima = g.top - FOLGA - c.height >= MARGEM
  const cabeAbaixo = g.bottom + FOLGA + c.height <= vh - MARGEM
  const acima = side === 'top' ? (cabeAcima || !cabeAbaixo) : !(cabeAbaixo || !cabeAcima)
  const top = acima ? g.top - FOLGA - c.height : g.bottom + FOLGA

  const base = align === 'start' ? g.left : align === 'end' ? g.right - c.width : g.left + g.width / 2 - c.width / 2
  const left = Math.min(Math.max(base, MARGEM), vw - c.width - MARGEM)

  caixa.style.top = `${Math.max(MARGEM, Math.min(top, vh - c.height - MARGEM))}px`
  caixa.style.left = `${Math.max(MARGEM, left)}px`
  caixa.style.visibility = 'visible'
}

export default function InfoTip({ text, side = 'top', align = 'center' }) {
  const id = useId()
  const gatilhoRef = useRef(null)
  const [aberto, setAberto] = useState(false)

  // A posição é fixa na janela: ao rolar ou redimensionar, fecha em vez de
  // ficar flutuando longe do ícone.
  useEffect(() => {
    if (!aberto) return
    const fechar = () => setAberto(false)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => {
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])

  return (
    <span
      ref={gatilhoRef}
      className="relative inline-flex items-center group/tip rounded-full outline-none focus-visible:ring-1 focus-visible:ring-red"
      tabIndex={0}
      aria-describedby={aberto ? id : undefined}
      aria-label="Mais informações"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onFocus={() => setAberto(true)}
      onBlur={() => setAberto(false)}
    >
      <Icon name="info" size={12} className="text-ink-faint group-hover/tip:text-ink group-focus-visible/tip:text-ink cursor-help shrink-0"/>
      {aberto && createPortal(
        <span
          id={id}
          role="tooltip"
          ref={caixa => { if (caixa && gatilhoRef.current) posicionar(caixa, gatilhoRef.current, side, align) }}
          style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className="pointer-events-none z-[2000] block whitespace-pre-line w-64 max-w-[80vw] rounded-md border border-solid border-border bg-surface py-2.5 px-3 text-left text-[12px] font-normal normal-case tracking-normal text-ink leading-[1.55] shadow-[var(--shadow-md)]"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
