import { useRef } from 'react'
import { mmParaPt, moverRedimensionar } from '../../utils/assinaturas/geometria'

const MIN_MM = { largura: 25, altura: 10 }
const CANTOS = [
  { modo: 'nw', pos: '-top-1.5 -left-1.5', cursor: 'nwse-resize' },
  { modo: 'ne', pos: '-top-1.5 -right-1.5', cursor: 'nesw-resize' },
  { modo: 'sw', pos: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
  { modo: 'se', pos: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
]

/**
 * Retângulo do campo de assinatura sobre a página: arrasta pelo corpo,
 * redimensiona pelos cantos e, com foco, anda 1 mm pelas setas (10 mm com
 * Shift, 0,1 mm com Alt). Trabalha em pontos da página visível; `escala` converte para pixels.
 *
 * @param rect      { x, y, largura, altura } em pt (visível)
 * @param limite    { largura, altura } da página visível, em pt
 * @param onMudar   recebe o novo retângulo em pt
 * @param editavel  false = só mostra (miniaturas)
 * @param previa    nó opcional (prévia do selo) mostrado dentro do campo
 */
export default function CampoAssinatura({ rect, escala, limite, onMudar, editavel = true, rotulo = 'Assinatura', previa = null }) {
  const arrasto = useRef(null)
  const minimo = { largura: mmParaPt(MIN_MM.largura), altura: mmParaPt(MIN_MM.altura) }

  const estilo = {
    left: rect.x * escala,
    top: rect.y * escala,
    width: rect.largura * escala,
    height: rect.altura * escala,
  }
  // Campo muito pequeno na tela (folha grande em tela estreita): sem alças, para
  // não cobrir o corpo — o tamanho segue editável pelo painel, em mm.
  const pequeno = estilo.width < 44 || estilo.height < 28
  const cor = rect.fora ? 'border-amber bg-amber-dim' : 'border-red bg-red-dim'

  if (!editavel) {
    return (
      <div className={`absolute border border-solid ${cor} pointer-events-none`} style={estilo} aria-hidden="true"/>
    )
  }

  function iniciar(e, modo) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrasto.current = { modo, x: e.clientX, y: e.clientY, rect }
  }
  function mover(e) {
    const a = arrasto.current
    if (!a) return
    const dx = (e.clientX - a.x) / escala
    const dy = (e.clientY - a.y) / escala
    onMudar(moverRedimensionar(a.rect, a.modo, dx, dy, limite, minimo))
  }
  function terminar() { arrasto.current = null }

  function teclado(e) {
    const passo = mmParaPt(e.altKey ? 0.1 : e.shiftKey ? 10 : 1)
    const delta = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key]
    if (!delta) return
    e.preventDefault()
    onMudar(moverRedimensionar(rect, 'mover', delta[0], delta[1], limite))
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Campo de assinatura. Use as setas para mover 1 mm, Shift para 10 mm e Alt para 0,1 mm.`}
      className={`absolute border-2 border-solid ${cor} cursor-move touch-none outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-red`}
      style={estilo}
      onPointerDown={e => iniciar(e, 'mover')}
      onPointerMove={mover}
      onPointerUp={terminar}
      onPointerCancel={terminar}
      onKeyDown={teclado}
    >
      {previa ? (
        // Prévia do selo (a assinatura como vai sair no PDF) no lugar do rótulo.
        <span className="absolute inset-0 pointer-events-none overflow-hidden">{previa}</span>
      ) : estilo.width >= 70 && (
        <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-red pointer-events-none overflow-hidden px-1 text-center">
          {rotulo}
        </span>
      )}
      {!pequeno && CANTOS.map(c => (
        <span
          key={c.modo}
          className={`absolute ${c.pos} w-3 h-3 rounded-[2px] bg-red border border-solid border-white touch-none`}
          style={{ cursor: c.cursor }}
          onPointerDown={e => iniciar(e, c.modo)}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
        />
      ))}
    </div>
  )
}
