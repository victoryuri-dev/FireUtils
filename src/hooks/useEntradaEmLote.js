import { useLayoutEffect } from 'react'
import gsap from 'gsap'

// Entrada dos elementos (`seletor`, dentro de `rootRef`) em lotes, no estilo "stagger items in on scroll" do GSAP:
// os que ja estao na tela entram em cascata ao carregar; os demais entram
// conforme o scroll os alcanca. Usa IntersectionObserver (funciona com o
// contêiner de rolagem da pagina, que nao e a janela). Refaz quando a
// lista/filtros mudam.
export default function useEntradaEmLote(rootRef, seletor, chave) {
  useLayoutEffect(() => {
    const grid = rootRef.current
    if (!grid || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Só os que ainda não entraram: ao acrescentar itens (ex.: próximo lote
    // de cards ao rolar), os que já estão na tela não piscam de novo.
    const cards = [...grid.querySelectorAll(seletor)].filter(c => !c.dataset.entrou)
    gsap.set(cards, { autoAlpha: 0, y: 60 })

    let fila = [], timer = null
    const soltar = () => {
      timer = null
      const lote = fila; fila = []
      lote.forEach(c => { c.dataset.entrou = '1' })
      gsap.to(lote, {
        autoAlpha: 1, y: 0, duration: .7, ease: 'power3.out',
        stagger: .1, overwrite: true,
        clearProps: 'transform,opacity,visibility',
      })
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return
        io.unobserve(en.target)
        fila.push(en.target)
      })
      // Junta o que entrou junto num unico lote (ordem do DOM = ordem visual).
      if (fila.length && !timer) timer = setTimeout(() => {
        fila.sort((a, b) => cards.indexOf(a) - cards.indexOf(b)); soltar()
      }, 60)
    }, { rootMargin: '0px 0px 0px 0px' })
    cards.forEach(c => io.observe(c))

    return () => {
      io.disconnect(); clearTimeout(timer)
      gsap.killTweensOf(cards)
      // Preserve component-owned inline styles (for example dynamic CSS
      // variables). The entrance animation only owns these three props.
      gsap.set(cards, { clearProps: 'transform,opacity,visibility' })
    }
  }, [rootRef, seletor, chave])
}

