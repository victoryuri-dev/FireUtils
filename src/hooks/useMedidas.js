import { useEffect, useState } from 'react'

/** Largura (px) disponível para o elemento observado; acompanha o redimensionamento. */
export function useLargura(ref, padrao = 0) {
  const [largura, setLargura] = useState(padrao)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const obs = new ResizeObserver(([entrada]) => setLargura(Math.floor(entrada.contentRect.width)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return largura
}

/** `true` a partir da primeira vez que o elemento entra (ou quase entra) na tela. */
export function useVisivel(ref, margem = '300px') {
  const [visivel, setVisivel] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const obs = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) { setVisivel(true); obs.disconnect() }
    }, { rootMargin: margem })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, margem])
  return visivel
}
