import { useState } from 'react'

// Arte de fundo do pôster (já traz badge e título). Convenção: o arquivo fica em
// public/ferramentas/<id>.webp (ou .png), proporção 240:340 (ex.: 960×1360 px).
// Ids: memorial, assinaturas, plugin, hidrantes, saidas, biblioteca.
// Sem arquivo ainda, o cartão mostra um fundo neutro com o nome da ferramenta.
const EXTENSOES = ['webp', 'png']

export default function ArtePoster({ id, titulo }) {
  const [tentativa, setTentativa] = useState(0)

  if (tentativa >= EXTENSOES.length) {
    return <div className="poster-placeholder" aria-hidden="true"><span>{titulo}</span></div>
  }
  return (
    <img
      src={`/ferramentas/${id}.${EXTENSOES[tentativa]}`}
      alt=""
      draggable="false"
      onError={() => setTentativa(t => t + 1)}
    />
  )
}
