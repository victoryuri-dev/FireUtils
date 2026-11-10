import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  retanguloVisivel, campoDoRetanguloVisivel, dimensoesVisiveis, ROTULO_ANCORA,
} from '../../utils/assinaturas/geometria'
import {
  escalaDeAjuste, limitarEscala, percentual, layoutDoConteudo, pontoSobAncora, rolagemParaAncora, FATOR_ZOOM,
} from '../../utils/assinaturas/zoom'
import CampoAssinatura from './CampoAssinatura'
import PreviaSelo from './PreviaSelo'
import Icon from '../ui/Icon'

const fmt = n => String(n).replace('.', ',')

/**
 * A folha em tela cheia, para posicionar o campo de assinatura com precisão em
 * pranchas grandes. O campo é o mesmo do grupo (arrastar, puxar os cantos, setas),
 * e o que se muda aqui vale para todos os arquivos dele.
 *
 * Em vez de um canvas do tamanho da folha inteira com zoom (centenas de MB numa A1),
 * desenha só a parte visível, na resolução da tela, e redesenha ao rolar ou dar zoom:
 * o texto da prancha fica nítido em qualquer zoom e a memória não cresce.
 *
 * Zoom: botões, teclas + / − / 0, ou Ctrl + roda do mouse (puxa para onde está o
 * mouse). Rolagem: roda, barras ou arrastando o fundo.
 */
export default function VisorMaximizado({ pagina, geometria, grupo, titular, nomeArquivo, onCampo, onFechar }) {
  const janela = useRef(null)
  const tela = useRef(null)
  const desenhado = useRef(null) // { x, y } da rolagem em que a tela foi desenhada pela última vez
  const quadro = useRef(0)
  const pendente = useRef(null)  // ponto a manter sob o mouse depois de um zoom
  const arrasto = useRef(null)   // rolar arrastando o fundo
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const [rolagem, setRolagem] = useState({ x: 0, y: 0 })
  const [escalaManual, setEscalaManual] = useState(null) // null = ajustar à tela

  const vis = dimensoesVisiveis(geometria)
  const ajuste = dim.w ? escalaDeAjuste(dim.w, dim.h, vis.largura, vis.altura) : 1
  const escala = escalaManual == null ? ajuste : limitarEscala(escalaManual, ajuste)
  const layout = layoutDoConteudo(dim.w, dim.h, vis.largura * escala, vis.altura * escala)
  const rect = retanguloVisivel(grupo.campo, geometria)

  // Tamanho da janela de rolagem.
  useEffect(() => {
    const el = janela.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const obs = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Zoom: troca a escala e guarda qual ponto da folha deve ficar sob `ancora`.
  const zoomPara = useCallback((nova, ancora) => {
    const el = janela.current
    if (!el || !dim.w) return
    const alvo = limitarEscala(nova, ajuste)
    if (alvo === escala) return
    const ax = ancora?.x ?? dim.w / 2
    const ay = ancora?.y ?? dim.h / 2
    const ponto = pontoSobAncora({ scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, ancoraX: ax, ancoraY: ay, escala, layout })
    pendente.current = { ...ponto, ancoraX: ax, ancoraY: ay, escala: alvo }
    setEscalaManual(alvo)
  }, [ajuste, dim.w, dim.h, escala, layout])

  // Depois do zoom o conteúdo já tem o tamanho novo: ajusta a rolagem para manter o ponto.
  useLayoutEffect(() => {
    const el = janela.current
    const p = pendente.current
    if (!el) return
    if (p) {
      const { left, top } = rolagemParaAncora({
        ptX: p.ptX, ptY: p.ptY, escala: p.escala, larguraJanela: dim.w, alturaJanela: dim.h,
        larguraPt: vis.largura, alturaPt: vis.altura, ancoraX: p.ancoraX, ancoraY: p.ancoraY,
      })
      el.scrollLeft = left
      el.scrollTop = top
      pendente.current = null
    } else if (escalaManual == null) {
      el.scrollLeft = 0
      el.scrollTop = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalaManual])

  // Desenha a parte visível: num canvas de fora da tela e, pronto, copia de uma vez (sem piscar).
  useEffect(() => {
    if (!dim.w || !dim.h) return undefined
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
    const fora = document.createElement('canvas')
    fora.width = Math.round(dim.w * dpr)
    fora.height = Math.round(dim.h * dpr)
    const ctx = fora.getContext('2d')
    const viewport = pagina.getViewport({ scale: escala * dpr })
    const tx = (layout.ox - rolagem.x) * dpr
    const ty = (layout.oy - rolagem.y) * dpr
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(tx, ty, viewport.width, viewport.height) // o papel; o resto fica escuro
    const tarefa = pagina.render({ canvas: fora, viewport, transform: [1, 0, 0, 1, tx, ty], background: 'rgba(0,0,0,0)' })
    let cancelado = false
    tarefa.promise.then(() => {
      const visivel = tela.current
      if (cancelado || !visivel) return
      visivel.width = fora.width
      visivel.height = fora.height
      visivel.style.width = `${dim.w}px`
      visivel.style.height = `${dim.h}px`
      visivel.getContext('2d').drawImage(fora, 0, 0)
      visivel.style.transform = ''
      desenhado.current = { x: rolagem.x, y: rolagem.y }
    }).catch(() => {}) // cancelar uma renderização rejeita a promessa: esperado
    return () => { cancelado = true; tarefa.cancel() }
  }, [pagina, escala, rolagem.x, rolagem.y, dim.w, dim.h, layout.ox, layout.oy])

  // Rolagem: enquanto o redesenho não termina, desloca a imagem antiga junto.
  function aoRolar() {
    const el = janela.current
    const d = desenhado.current
    if (tela.current && d) tela.current.style.transform = `translate(${d.x - el.scrollLeft}px, ${d.y - el.scrollTop}px)`
    cancelAnimationFrame(quadro.current)
    quadro.current = requestAnimationFrame(() => setRolagem({ x: el.scrollLeft, y: el.scrollTop }))
  }

  const escalaAtual = useRef(escala)
  useEffect(() => { escalaAtual.current = escala })

  // Ctrl + roda: zoom ancorado no mouse (o ouvinte precisa ser não passivo para impedir o zoom da página).
  const zoomRef = useRef(zoomPara)
  useEffect(() => { zoomRef.current = zoomPara })
  useEffect(() => {
    const el = janela.current
    if (!el) return undefined
    const aoGirar = e => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const caixa = el.getBoundingClientRect()
      zoomRef.current(escalaAtual.current * (e.deltaY < 0 ? FATOR_ZOOM : 1 / FATOR_ZOOM), { x: e.clientX - caixa.left, y: e.clientY - caixa.top })
    }
    el.addEventListener('wheel', aoGirar, { passive: false })
    return () => el.removeEventListener('wheel', aoGirar)
  }, [])
  // Teclado: Esc fecha; + / − / 0 dão zoom.
  useEffect(() => {
    const aoTeclar = e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') onFechar()
      else if (e.key === '+' || e.key === '=') zoomRef.current(escalaAtual.current * FATOR_ZOOM)
      else if (e.key === '-' || e.key === '_') zoomRef.current(escalaAtual.current / FATOR_ZOOM)
      else if (e.key === '0') setEscalaManual(null)
    }
    window.addEventListener('keydown', aoTeclar)
    janela.current?.focus()
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  // Arrastar o fundo rola a folha (o campo cuida dos próprios eventos e não deixa chegar aqui).
  // No toque vale a rolagem nativa do navegador.
  function rolarPara(e) {
    const a = arrasto.current
    if (!a) return
    janela.current.scrollLeft = a.sx - (e.clientX - a.x)
    janela.current.scrollTop = a.sy - (e.clientY - a.y)
  }
  function iniciarArrasto(e) {
    if (e.button !== 0 || e.pointerType === 'touch') return
    const el = janela.current
    arrasto.current = { x: e.clientX, y: e.clientY, sx: el.scrollLeft, sy: el.scrollTop }
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
  }
  function terminarArrasto(e) {
    // O navegador junta os movimentos do mouse por quadro: aplica a posição final do próprio
    // evento de soltar, para o último trecho do arrasto não se perder.
    if (e?.type === 'pointerup') rolarPara(e)
    arrasto.current = null
    if (janela.current) janela.current.style.cursor = ''
  }

  const c = grupo.campo
  const botao = 'w-8 h-8 grid place-items-center rounded-md border border-solid border-border bg-surface text-ink hover:bg-surface-2 cursor-pointer disabled:opacity-40 disabled:cursor-default'

  return (
    <div className="fixed inset-0 z-[400] flex flex-col bg-black/90 select-none" role="dialog" aria-modal="true" aria-label={`Folha em tela cheia: ${nomeArquivo}`}>
      <header className="shrink-0 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 bg-surface border-b border-solid border-border">
        <div className="min-w-0 mr-auto">
          <div className="text-[13px] font-semibold text-ink truncate" title={nomeArquivo}>{nomeArquivo}</div>
          <div className="text-[11px] text-ink-faint tabular-nums">
            {grupo.nome} · {fmt(c.dxMm)} mm da borda {c.ancora.endsWith('direita') ? 'direita' : 'esquerda'}, {fmt(c.dyMm)} mm da {c.ancora.startsWith('inferior') ? 'inferior' : 'superior'} · {fmt(c.larguraMm)} × {fmt(c.alturaMm)} mm ({ROTULO_ANCORA[c.ancora].toLowerCase()})
          </div>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Zoom">
          <button type="button" className={botao} onClick={() => zoomPara(escala / FATOR_ZOOM)} aria-label="Diminuir o zoom" title="Diminuir (−)"><Icon name="minus" size={14}/></button>
          <span className="min-w-[52px] text-center text-[12px] text-ink tabular-nums" aria-live="polite">{percentual(escala)}%</span>
          <button type="button" className={botao} onClick={() => zoomPara(escala * FATOR_ZOOM)} aria-label="Aumentar o zoom" title="Aumentar (+)"><Icon name="plus" size={14}/></button>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2.5 ml-1" onClick={() => setEscalaManual(null)} title="Folha inteira na tela (0)">Ajustar</button>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2.5" onClick={() => zoomPara(96 / 72)} title="Tamanho real (100%)">100%</button>
        </div>

        <button type="button" className="btn-primary" onClick={onFechar}><Icon name="minimize" size={13}/> Concluir</button>
      </header>

      <div
        ref={janela}
        tabIndex={-1}
        className="flex-1 min-h-0 overflow-auto relative outline-none cursor-grab"
        onScroll={aoRolar}
        onDragStart={e => e.preventDefault()}
        onPointerDown={iniciarArrasto}
        onPointerMove={rolarPara}
        onPointerUp={terminarArrasto}
        onPointerCancel={terminarArrasto}
      >
        <div className="relative" style={{ width: layout.W, height: layout.H }}>
          {/* A tela fica fixa no canto da janela e mostra só a parte visível da folha. */}
          <div className="sticky top-0 left-0 overflow-hidden" style={{ width: dim.w, height: dim.h }}>
            <canvas ref={tela} className="block" aria-hidden="true"/>
          </div>
          <div className="absolute" style={{ left: layout.ox, top: layout.oy, width: vis.largura * escala, height: vis.altura * escala }}>
            <CampoAssinatura
              rect={rect}
              escala={escala}
              limite={vis}
              onMudar={novo => onCampo(campoDoRetanguloVisivel(novo, geometria, c.ancora))}
              previa={<PreviaSelo largura={rect.largura} altura={rect.altura} titular={titular} selo={grupo.selo}/>}
            />
          </div>
        </div>
      </div>

      <footer className="shrink-0 px-4 py-1.5 bg-surface border-t border-solid border-border text-[11px] text-ink-faint">
        Arraste o campo ou puxe os cantos. Com o campo selecionado, as setas movem 1 mm (Shift: 10 mm · Alt: 0,1 mm). Zoom: + / − / Ctrl + roda do mouse. Arraste o fundo para rolar. Esc fecha.
      </footer>
    </div>
  )
}
