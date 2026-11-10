import { useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, MeasuringStrategy, useSensor, useSensors, pointerWithin,
} from '@dnd-kit/core'
import Icon from '../ui/Icon'

/**
 * Arrastar arquivos entre grupos. Quem é arrastado:
 *  • um arquivo que está marcado → TODOS os marcados vão juntos;
 *  • um arquivo que não está marcado → só ele.
 * Soltar em cima de um grupo (na lista ou na área central) move os arquivos.
 */
export default function ProvedorArrastar({ arquivos, selecionados, onMover, children }) {
  const [carga, setCarga] = useState(null) // { ids, nome }
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Toque: pressão longa, para não competir com a rolagem da página.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  function idsArrastados(arquivoId) {
    return selecionados.includes(arquivoId) ? selecionados : [arquivoId]
  }

  function aoIniciar({ active }) {
    const id = active.data.current?.arquivoId
    if (!id) return
    const ids = idsArrastados(id)
    const nome = arquivos.find(a => a.id === id)?.nome ?? ''
    setCarga({ ids, nome })
  }

  function aoSoltar({ active, over }) {
    const id = active.data.current?.arquivoId
    const grupoId = over?.data.current?.grupoId
    setCarga(null)
    if (!id || !grupoId) return
    onMover(idsArrastados(id), grupoId)
  }

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={pointerWithin}
      // Os grupos mudam de posição durante o arrasto (rolagem automática, miniaturas
      // que terminam de carregar): remede os alvos o tempo todo.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={aoIniciar}
      onDragEnd={aoSoltar}
      onDragCancel={() => setCarga(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {carga && (
          <div className="flex items-center gap-2 max-w-[260px] px-3 py-2 rounded-lg border border-solid border-red bg-surface text-ink text-[12px] font-medium shadow-[var(--shadow-md)] cursor-grabbing">
            <Icon name="file" size={14} className="shrink-0 text-red"/>
            <span className="truncate">
              {carga.ids.length === 1 ? carga.nome : `${carga.ids.length} arquivos`}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
