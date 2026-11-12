import { useMemo } from 'react'
import { montarSelo } from '../../utils/assinaturas/seloLayout'

export const TITULAR_EXEMPLO = 'NOME DO TITULAR'

/**
 * Prévia do selo dentro do campo, desenhada a partir do MESMO layout que vai para o
 * PDF (utils/assinaturas/seloLayout.js): mesmas quebras de linha e tamanhos. A fonte
 * da tela (Helvetica/Arial) tem as mesmas métricas da do PDF.
 *
 * @param largura,altura  tamanho do campo em pontos, na orientação em que é lido
 * @param titular         nome a mostrar (o do certificado, quando já foi escolhido um)
 */
export default function PreviaSelo({ largura, altura, titular = TITULAR_EXEMPLO, selo }) {
  const quando = useMemo(() => new Date(), [])
  const layout = useMemo(
    () => montarSelo({ largura, altura, titular, quando, selo }),
    [largura, altura, titular, quando, selo],
  )

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block"
      style={{ fontFamily: 'Helvetica, Arial, "Liberation Sans", sans-serif', whiteSpace: 'pre' }}
    >
      {layout.textos.map((t, i) => (
        // O layout usa y para cima a partir da base; o SVG, para baixo a partir do topo.
        <text key={i} x={t.x} y={altura - t.y} fontSize={t.tamanho} fontWeight={t.fonte === 'negrito' ? 700 : 400} fill="#1a1a1a">
          {t.texto}
        </text>
      ))}
    </svg>
  )
}
