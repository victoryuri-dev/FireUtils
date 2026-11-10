import { useCallback, useRef, useState } from 'react'

// Só reage a arquivos vindos do computador; o arrastar entre grupos (dnd-kit) não usa
// eventos de arrastar do navegador e não passa por aqui.
const temArquivos = e => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Soltar PDFs do computador DENTRO de um grupo. Cada box de grupo é um alvo: o grupo
 * que recebe os arquivos é o que está sob o mouse, e só ele é destacado. Soltar fora
 * de qualquer box não adiciona nada (e o navegador não abre o arquivo).
 *
 * @param aoSoltar  (arquivos: File[], grupoId) => void
 * @returns {{ alvo: string|null, propsDoAlvo: (grupoId) => object, propsDoFundo: object }}
 *   `alvo`: id do grupo sob o mouse durante o arrasto; `propsDoAlvo(id)`: eventos a
 *   espalhar no box do grupo; `propsDoFundo`: eventos para o contêiner de todos.
 */
export function useSoltarArquivos(aoSoltar) {
  const [alvo, setAlvo] = useState(null)
  // Entrar/sair de elementos filhos dispara dragenter/dragleave do box; o contador evita
  // que o destaque pisque.
  const contadores = useRef(new Map())

  const limpar = useCallback(() => { contadores.current.clear(); setAlvo(null) }, [])

  const propsDoAlvo = useCallback(grupoId => ({
    onDragEnter: e => {
      if (!temArquivos(e)) return
      e.preventDefault()
      e.stopPropagation()
      contadores.current.set(grupoId, (contadores.current.get(grupoId) || 0) + 1)
      setAlvo(grupoId)
    },
    onDragOver: e => {
      if (!temArquivos(e)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: e => {
      if (!temArquivos(e)) return
      const n = (contadores.current.get(grupoId) || 1) - 1
      if (n > 0) { contadores.current.set(grupoId, n); return }
      contadores.current.delete(grupoId)
      setAlvo(atual => (atual === grupoId ? null : atual))
    },
    onDrop: e => {
      if (!temArquivos(e)) return
      e.preventDefault()
      e.stopPropagation()
      limpar()
      aoSoltar(Array.from(e.dataTransfer.files), grupoId)
    },
  }), [aoSoltar, limpar])

  const propsDoFundo = {
    onDragOver: e => {
      if (!temArquivos(e)) return
      e.preventDefault() // sem isso o navegador abriria o PDF solto
      e.dataTransfer.dropEffect = 'none' // fora de um grupo: cursor de "não pode"
    },
    onDrop: e => {
      if (!temArquivos(e)) return
      e.preventDefault()
      limpar()
    },
  }

  return { alvo, propsDoAlvo, propsDoFundo }
}
