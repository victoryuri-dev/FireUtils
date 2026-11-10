import { useCallback, useEffect, useRef, useState } from 'react'
import { LARGURA_QUADRO } from './MiniaturaArquivo'
import Icon from '../ui/Icon'

const LINHAS = 2

/**
 * Miniaturas dos arquivos em exatamente 2 linhas, que ocupam a largura disponível ao
 * lado da referência. Os itens se distribuem coluna a coluna (1º em cima, 2º embaixo,
 * 3º em cima da coluna seguinte...) e, quando não cabem todos na largura, a faixa
 * rola na horizontal: setas, rolagem do mouse/trackpad ou barra.
 */
export default function CarrosselMiniaturas({ rotulo, children }) {
  const faixa = useRef(null)
  const trilho = useRef(null)
  const [pode, setPode] = useState({ esq: false, dir: false })

  const medir = useCallback(() => {
    const el = faixa.current
    if (!el) return
    const esq = el.scrollLeft > 1
    const dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setPode(p => (p.esq === esq && p.dir === dir ? p : { esq, dir }))
  }, [])

  // Remede quando a faixa muda de largura ou o conteúdo ganha/perde itens. O primeiro
  // aviso do ResizeObserver já faz a medida inicial.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const obs = new ResizeObserver(medir)
    if (faixa.current) obs.observe(faixa.current)
    if (trilho.current) obs.observe(trilho.current)
    return () => obs.disconnect()
  }, [medir])

  function rolar(sentido) {
    const el = faixa.current
    if (!el) return
    const reduzido = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Uma "página": a largura visível, menos meia coluna para a pessoa não perder o fio.
    el.scrollBy({ left: sentido * Math.max(LARGURA_QUADRO, el.clientWidth - LARGURA_QUADRO / 2), behavior: reduzido ? 'auto' : 'smooth' })
  }

  const seta = (sentido, visivel, lado) => (
    <button
      type="button"
      onClick={() => rolar(sentido)}
      aria-label={sentido < 0 ? 'Ver miniaturas anteriores' : 'Ver mais miniaturas'}
      tabIndex={visivel ? 0 : -1}
      className={`absolute ${lado} top-[88px] z-10 w-8 h-8 grid place-items-center rounded-full border border-solid border-border bg-surface text-ink shadow-[var(--shadow-sm)] cursor-pointer transition-opacity hover:bg-surface-2 ${visivel ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <Icon name={sentido < 0 ? 'chevL' : 'chevR'} size={16}/>
    </button>
  )

  return (
    <div className="relative min-w-0" role="region" aria-roledescription="carrossel" aria-label={rotulo}>
      <div
        ref={faixa}
        onScroll={medir}
        className="overflow-x-auto overflow-y-hidden pb-2 snap-x snap-proximity"
      >
        <div
          ref={trilho}
          className="grid gap-x-4 gap-y-4 items-start w-max *:snap-start"
          style={{
            gridTemplateRows: `repeat(${LINHAS}, auto)`,
            gridAutoFlow: 'column',
            gridAutoColumns: `${LARGURA_QUADRO}px`,
          }}
        >
          {children}
        </div>
      </div>
      {seta(-1, pode.esq, 'left-1')}
      {seta(1, pode.dir, 'right-1')}
    </div>
  )
}
