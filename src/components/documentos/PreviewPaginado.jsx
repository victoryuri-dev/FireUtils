import { useEffect, useRef } from 'react'
import Loader from '../ui/Loader'

// Preview de impressão em folhas A4, estilo editor de texto: o Paged.js
// divide o conteúdo em páginas reais (A4, margem de 25 mm), parte parágrafos e
// tabelas nas quebras e devolve as páginas prontas — as mesmas que saem na
// impressão/PDF, então a tela mostra exatamente o que será impresso.
//
// O conteúdo (children) é renderizado escondido pelo React; a cada mudança o
// Paged.js paginha uma cópia dele num palco fora da tela e, só quando termina,
// as páginas trocam as antigas no destino — sem piscar. Nenhum nó do destino é
// gerenciado pelo React.
//
// `css` (texto) traz o @page e demais regras que o Paged.js precisa processar;
// `prepararConteudo(copia)` deixa o chamador ajustar a COPIA antes de paginar
// (ex.: montar um sumario a partir dos titulos); `aposPaginar(destino)` roda
// quando as paginas ja estao no destino (ex.: preencher numeros de pagina).
//
// Passar a lista de folhas de estilo (mesmo com um só item) impede o Paged.js
// de remover e reprocessar os estilos do app (modo polyfill).
// `.assinatura-no-fim` (assinatura do RT, nos dois modelos de memorial): vai
// para o pé da folha em que caiu, somando o espaço livre à margem de cima.
// Medido no palco (sem o zoom do preview); a impressão usa as mesmas folhas.
function empurrarAssinaturasProFim(palco) {
  palco.querySelectorAll('.assinatura-no-fim').forEach(el => {
    const area = el.closest('.pagedjs_page_content')
    if (!area) return
    const livre = Math.floor(area.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom) - 2
    if (livre <= 0) return
    const atual = parseFloat(getComputedStyle(el).marginTop) || 0
    el.style.marginTop = `${atual + livre}px`
  })
}

// Paged.js carregado uma vez; se o carregamento falhar (ex.: arquivo de um
// deploy anterior que não existe mais), a próxima tentativa busca de novo.
let moduloPaged = null
function carregarPaged() {
  if (!moduloPaged) moduloPaged = import('pagedjs').catch(erro => { moduloPaged = null; throw erro })
  return moduloPaged
}

// Falhou: tenta de novo sozinho algumas vezes antes de mostrar o aviso.
const TENTATIVAS = 3

export default function PreviewPaginado({ children, css, prepararConteudo, aposPaginar }) {
  const fonteRef = useRef(null)
  const destinoRef = useRef(null)
  const avisoRef = useRef(null)
  const erroRef = useRef(null)
  const propsRef = useRef({ css, prepararConteudo, aposPaginar })
  const estado = useRef({ ativo: true, rodando: false, pendente: false, timer: null, previewer: null, palco: null, ultimoHtml: null, falhas: 0 })

  const rodar = useRef(async function rodar() {
    const s = estado.current
    if (s.rodando) { s.pendente = true; return }
    // Só repagina quando o conteúdo mudou de fato: o componente re-renderiza por
    // motivos alheios ao documento (contexto, status de salvamento...) e cada
    // paginação é cara.
    // O CSS entra na comparação: muda sem o HTML mudar (ex.: rubrica no
    // rodapé do memorial da PB).
    const fonte = fonteRef.current?.innerHTML
    if (fonte == null) return
    const html = `${propsRef.current.css || ''}\n${fonte}`
    if (html === s.ultimoHtml) return
    s.rodando = true
    // O loader só aparece na primeira geração; nas seguintes as páginas antigas
    // ficam na tela até as novas ficarem prontas.
    if (avisoRef.current) avisoRef.current.style.display = destinoRef.current?.childElementCount ? 'none' : ''
    if (erroRef.current) erroRef.current.style.display = 'none'
    let palco = null
    let novaTentativa = false
    try {
      const { Previewer } = await carregarPaged()
      if (!s.ativo || !fonteRef.current || !destinoRef.current) return

      palco = document.createElement('div')
      // Mesma classe do destino: a tipografia do memorial (Arial 12/10pt etc.) precisa
      // valer na hora de medir, senão as alturas mudam depois e a paginação quebra.
      palco.className = 'print-area-memorial'
      palco.style.cssText = 'position:fixed;top:0;left:-100000px;pointer-events:none'
      document.body.appendChild(palco)
      s.palco = palco

      const previewer = new Previewer()
      const conteudo = fonteRef.current.cloneNode(true)
      propsRef.current.prepararConteudo?.(conteudo)
      await previewer.preview(conteudo, [{ 'preview-paginado.css': propsRef.current.css || '@page { size: A4 portrait; margin: 25mm; }' }], palco)
      if (!s.ativo) { previewer.polisher.destroy(); return }

      // Páginas prontas não devem mais se repaginar sozinhas: o Paged.js deixa
      // um ResizeObserver ligado em cada uma, que ao mover a página pro
      // destino (ou ao trocar a geração anterior) tentava reajustar contra o
      // conteúdo do palco já descartado — "Cannot read properties of null
      // (reading 'getAttribute')" a cada repaginação.
      previewer.chunker?.pages?.forEach(pg => pg.removeListeners?.())
      if (!palco.querySelector('.pagedjs_page')) throw new Error('A paginação não gerou nenhuma folha.')
      empurrarAssinaturasProFim(palco)
      destinoRef.current.replaceChildren(...palco.childNodes)
      propsRef.current.aposPaginar?.(destinoRef.current)
      const anterior = s.previewer
      s.previewer = previewer
      anterior?.polisher.destroy()
      s.ultimoHtml = html
      s.falhas = 0
    } catch (erro) {
      console.error('Falha ao paginar o documento:', erro)
      // Antes, a falha marcava o conteúdo como paginado e o destino ficava
      // vazio (fundo escuro) até recarregar a página. Agora tenta de novo e,
      // esgotadas as tentativas, mostra o aviso com "Tentar novamente".
      s.falhas += 1
      if (s.falhas < TENTATIVAS) novaTentativa = true
      else s.ultimoHtml = html
    } finally {
      palco?.remove()
      s.palco = null
      s.rodando = false
      const temFolhas = !!destinoRef.current?.childElementCount
      if (avisoRef.current) avisoRef.current.style.display = novaTentativa && !temFolhas ? '' : 'none'
      if (erroRef.current) erroRef.current.style.display = !novaTentativa && s.falhas >= TENTATIVAS && !temFolhas ? '' : 'none'
      if (s.ativo && novaTentativa) {
        clearTimeout(s.timer)
        s.timer = setTimeout(() => rodar.current(), 600 * s.falhas)
      } else if (s.ativo && s.pendente) { s.pendente = false; rodar.current() }
    }
  })

  // Sem deps de propósito: repagina a cada render do documento (com debounce).
  useEffect(() => {
    propsRef.current = { css, prepararConteudo, aposPaginar }
    const s = estado.current
    clearTimeout(s.timer)
    s.timer = setTimeout(() => rodar.current(), 250)
  })

  const tentarDeNovo = () => {
    const s = estado.current
    s.falhas = 0
    s.ultimoHtml = null
    rodar.current()
  }

  useEffect(() => {
    const s = estado.current
    s.ativo = true
    return () => {
      s.ativo = false
      clearTimeout(s.timer)
      s.palco?.remove()
      s.previewer?.polisher.destroy()
      s.previewer = null
    }
  }, [])

  return (
    <>
      <div className="hidden" aria-hidden="true">
        <div ref={fonteRef}>{children}</div>
      </div>
      <div ref={avisoRef} className="no-print flex-1 flex items-center justify-center min-h-[96px]" role="status" aria-label="Gerando páginas">
        <Loader size={40}/>
      </div>
      <div ref={erroRef} className="no-print flex-1 flex flex-col items-center justify-center gap-3 min-h-[160px] text-center text-[13px] text-ink-faint" role="alert" style={{ display: 'none' }}>
        <span>Não foi possível gerar as páginas do documento.</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={tentarDeNovo}>Tentar novamente</button>
          <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>Recarregar página</button>
        </div>
      </div>
      <div ref={destinoRef} className="print-area print-area-memorial"/>
    </>
  )
}
