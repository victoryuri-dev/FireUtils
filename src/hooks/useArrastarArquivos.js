import { useDraggable, useDroppable } from '@dnd-kit/core'

// Arrastar arquivos entre grupos (ver ProvedorArrastar). O dnd-kit exige id único
// por arrastável e por alvo; por isso cada hook recebe a `origem` do elemento.

/**
 * Torna um arquivo arrastável: { setNodeRef, listeners, attributes, isDragging }.
 * O mesmo arquivo aparece em dois lugares (linha da lista e miniatura), e cada
 * um precisa de id próprio: com ids repetidos o dnd-kit confunde as origens.
 * `origem` é 'linha' ou 'miniatura'.
 */
export function useArquivoArrastavel(arquivoId, origem) {
  return useDraggable({ id: `${origem}:${arquivoId}`, data: { arquivoId } })
}

/**
 * Torna um grupo um alvo de soltar: { setNodeRef, isOver }. O mesmo grupo é alvo
 * em dois lugares (item da lista e seção central), cada um com id próprio.
 * `origem` é 'lista' ou 'secao'.
 */
export function useAlvoGrupo(grupoId, origem, desativado = false) {
  return useDroppable({ id: `${origem}:grupo:${grupoId}`, data: { grupoId }, disabled: desativado })
}
