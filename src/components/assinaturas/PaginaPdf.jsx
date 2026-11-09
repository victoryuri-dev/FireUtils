import { useEffect, useRef } from 'react'
import { desenharPagina } from '../../lib/pdfjs'
import { dimensoesVisiveis } from '../../utils/assinaturas/geometria'

/**
 * Desenha uma página de PDF (já girada) com `larguraPx` de largura e entrega
 * aos filhos o que precisam para posicionar algo por cima, na mesma escala.
 *
 *   <PaginaPdf pagina={p} geometria={g} larguraPx={600}>
 *     {({ escala, visivel }) => <CampoAssinatura .../>}
 *   </PaginaPdf>
 *
 * `escala` = pixels por ponto; `visivel` = tamanho da página girada em pontos.
 */
export default function PaginaPdf({ pagina, geometria, larguraPx, children, className = '' }) {
  const canvasRef = useRef(null)
  const visivel = dimensoesVisiveis(geometria)
  const escala = larguraPx / visivel.largura
  const alturaPx = Math.round(visivel.altura * escala)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !(larguraPx > 0)) return undefined
    const tarefa = desenharPagina(pagina, canvas, larguraPx)
    // Cancelar uma renderização em andamento rejeita a promessa: esperado.
    tarefa.promise.catch(() => {})
    return () => tarefa.cancel()
  }, [pagina, larguraPx])

  return (
    <div
      className={`relative bg-white shadow-[var(--shadow-sm)] select-none ${className}`}
      style={{ width: larguraPx, height: alturaPx }}
    >
      <canvas ref={canvasRef} className="block" aria-hidden="true"/>
      {children?.({ escala, visivel })}
    </div>
  )
}
