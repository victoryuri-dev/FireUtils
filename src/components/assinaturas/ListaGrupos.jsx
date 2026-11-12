import { useRef, useState } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { arquivosDoGrupo, formatarTamanho } from '../../utils/assinaturas/grupos'
import { useAlvoGrupo, useArquivoArrastavel } from '../../hooks/useArrastarArquivos'
import Icon from '../ui/Icon'
import Checkbox from '../ui/Checkbox'
import NomeDoGrupo from './NomeDoGrupo'

// Box de um arquivo: o box inteiro é a área de arrastar. Selecionar e remover
// só aparecem com o mouse em cima ou com o arquivo selecionado, e somem
// durante qualquer arrasto (para não ficarem por cima do que está sendo movido).
function CaixaArquivo({ arquivo, selecionado, onAlternar, onRemover }) {
  const { setNodeRef, listeners, attributes, isDragging } = useArquivoArrastavel(arquivo.id, 'linha')
  const { active } = useDndContext()
  const arrastando = Boolean(active)

  const visibilidade = arrastando
    ? 'opacity-0 pointer-events-none'
    : selecionado
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="group"
      aria-label={`${arquivo.nome}. Arraste para outro grupo.`}
      className={`group relative rounded-md border border-solid px-3 py-2.5 cursor-grab active:cursor-grabbing select-none transition-colors ${
        selecionado ? 'border-red bg-red-dim' : 'border-border bg-surface-2 hover:border-ink-hint'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="flex items-start gap-2 pr-14">
        <Icon name="file" size={16} className="shrink-0 mt-0.5 text-ink-faint"/>
        <span className="min-w-0">
          <span className="block text-[12px] text-ink truncate" title={arquivo.nome}>{arquivo.nome}</span>
          <span className="block text-[10px] text-ink-faint">{formatarTamanho(arquivo.tamanho)}</span>
        </span>
      </span>

      {/* Os controles não iniciam arrasto: pointer e teclado não sobem ao box. */}
      <span
        className={`absolute top-1.5 right-1.5 flex items-center gap-1.5 transition-opacity ${visibilidade}`}
        onPointerDown={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <Checkbox checked={selecionado} onChange={onAlternar} title={`Selecionar ${arquivo.nome}`}/>
        <button
          type="button"
          onClick={onRemover}
          title="Remover da lista"
          aria-label={`Remover ${arquivo.nome}`}
          className="w-5 h-5 grid place-items-center rounded-sm text-ink-faint hover:text-red bg-transparent border-0 p-0"
        >
          <Icon name="x" size={13}/>
        </button>
      </span>
    </li>
  )
}

// Um grupo da lista: também é um alvo onde soltar arquivos arrastados.
function ItemGrupo({ grupo, arquivos, ativo, aberto, onAlternarAberto, onAbrir, podeRemover, selecionados, soltar, dispatch, onRemoverArquivos }) {
  const { setNodeRef, isOver } = useAlvoGrupo(grupo.id, 'lista')
  const borda = isOver || soltar?.alvo ? 'border-red bg-red-dim' : ativo ? 'border-red-border bg-surface' : 'border-border bg-surface'

  return (
    <li ref={setNodeRef} {...soltar?.props} className={`rounded-lg border border-solid transition-colors ${borda}`}>
      {/* Clicar no cabeçalho (fora dos botões) põe o grupo em edição e abre a lista dele. */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-2 cursor-pointer"
        onClick={() => { dispatch({ type: 'SELECIONAR_GRUPO', id: grupo.id }); onAbrir(grupo.id) }}
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onAlternarAberto(grupo.id) }}
          aria-expanded={aberto}
          aria-label={`${aberto ? 'Fechar' : 'Abrir'} a lista de arquivos de ${grupo.nome}`}
          title={aberto ? 'Fechar a lista de arquivos' : 'Abrir a lista de arquivos'}
          className={`w-6 h-6 grid place-items-center rounded-sm shrink-0 bg-transparent border-0 p-0 cursor-pointer ${ativo ? 'text-red' : 'text-ink-faint'}`}
        >
          <Icon name={aberto ? 'folderOpen' : 'folder'} size={16}/>
        </button>
        <NomeDoGrupo grupo={grupo} onRenomear={(id, nome) => dispatch({ type: 'RENOMEAR_GRUPO', id, nome })}/>
        <span className="text-[11px] text-ink-faint tabular-nums shrink-0">{arquivos.length}</span>
        {podeRemover && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); dispatch({ type: 'REMOVER_GRUPO', id: grupo.id }) }}
            title="Remover grupo (os arquivos vão para o grupo vizinho)"
            aria-label={`Remover grupo ${grupo.nome}`}
            className="w-6 h-6 grid place-items-center rounded-sm text-ink-faint"
          >
            <Icon name="trash" size={12}/>
          </button>
        )}
      </div>

      {aberto && (
        arquivos.length === 0 ? (
          <p className="m-0 px-3 pb-3 text-[12px] text-ink-faint">Nenhum arquivo neste grupo ainda.</p>
        ) : (
          <div className="border-t border-solid border-border-2">
            <div className="flex items-center justify-between px-3 py-1.5">
              <button type="button" className="text-[11px] text-ink-faint hover:text-ink underline" onClick={() => dispatch({ type: 'SELECIONAR_TODOS_DO_GRUPO', grupoId: grupo.id })}>
                Selecionar todos
              </button>
            </div>
            <ul className="list-none m-0 px-2.5 pb-2.5 flex flex-col gap-2">
              {arquivos.map(a => (
                <CaixaArquivo
                  key={a.id}
                  arquivo={a}
                  selecionado={selecionados.includes(a.id)}
                  onAlternar={() => dispatch({ type: 'ALTERNAR_SELECAO', id: a.id })}
                  onRemover={() => onRemoverArquivos([a.id])}
                />
              ))}
            </ul>
          </div>
        )
      )}
    </li>
  )
}

/**
 * Grupos de assinatura e seus arquivos. Cada grupo é um conjunto de PDFs
 * assinados no mesmo lugar. Para trocar arquivos de grupo, arraste o box do
 * arquivo (ou a miniatura) até o grupo de destino; se houver arquivos marcados,
 * arrastar um deles leva todos.
 */
export default function ListaGrupos({ estado, dispatch, soltar, onAdicionar, onRemoverArquivos, onNovoGrupo }) {
  const inputRef = useRef(null)
  const { grupos, selecionados, grupoAtivoId } = estado
  // Grupos com a lista de arquivos aberta: independe de qual está em edição (vários podem ficar abertos).
  // Quando outro grupo passa a ser o em edição, ele abre (ajuste durante a renderização, sem efeito).
  const [abertos, setAbertos] = useState(() => new Set([grupoAtivoId]))
  const [ativoVisto, setAtivoVisto] = useState(grupoAtivoId)
  if (ativoVisto !== grupoAtivoId) {
    setAtivoVisto(grupoAtivoId)
    setAbertos(a => new Set(a).add(grupoAtivoId))
  }
  const abrir = id => setAbertos(a => (a.has(id) ? a : new Set(a).add(id)))
  const alternarAberto = id => setAbertos(a => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={13}/> Adicionar PDFs
        </button>
        <button type="button" className="btn-ghost" onClick={onNovoGrupo}>
          <Icon name="plus" size={13}/> Novo grupo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={e => { onAdicionar(Array.from(e.target.files), grupoAtivoId); e.target.value = '' }}
        />
      </div>

      {selecionados.length > 0 && (
        <div className="ibox m-0 bg-surface-2 border border-solid border-border items-center flex-wrap" role="region" aria-label="Arquivos selecionados">
          <span className="text-ink font-medium">{selecionados.length} {selecionados.length === 1 ? 'selecionado' : 'selecionados'}</span>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2" onClick={() => onRemoverArquivos(selecionados)}>
            <Icon name="trash" size={12}/> Remover
          </button>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2" onClick={() => dispatch({ type: 'LIMPAR_SELECAO' })}>Limpar</button>
        </div>
      )}

      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {grupos.map(grupo => (
          <ItemGrupo
            key={grupo.id}
            grupo={grupo}
            arquivos={arquivosDoGrupo(estado, grupo.id)}
            ativo={grupo.id === grupoAtivoId}
            aberto={abertos.has(grupo.id)}
            onAlternarAberto={alternarAberto}
            onAbrir={abrir}
            podeRemover={grupos.length > 1}
            selecionados={selecionados}
            soltar={soltar?.(grupo.id)}
            dispatch={dispatch}
            onRemoverArquivos={onRemoverArquivos}
          />
        ))}
      </ul>
    </div>
  )
}
