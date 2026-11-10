import { useRef, useState } from 'react'
import { arquivosDoGrupo, formatarTamanho } from '../../utils/assinaturas/grupos'
import { useAlvoGrupo, useArquivoArrastavel } from '../../hooks/useArrastarArquivos'
import Icon from '../ui/Icon'
import Checkbox from '../ui/Checkbox'

function NomeDoGrupo({ grupo, onRenomear }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(grupo.nome)

  function confirmar() {
    setEditando(false)
    if (texto.trim() && texto.trim() !== grupo.nome) onRenomear(grupo.id, texto)
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmar()
          if (e.key === 'Escape') setEditando(false)
        }}
        aria-label="Nome do grupo"
        className="min-w-0 flex-1 h-7 py-0 px-2 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
      />
    )
  }
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{grupo.nome}</span>
      <button
        type="button"
        onClick={() => { setTexto(grupo.nome); setEditando(true) }}
        title="Renomear grupo"
        aria-label={`Renomear ${grupo.nome}`}
        className="w-6 h-6 grid place-items-center rounded-sm text-ink-faint hover:text-ink hover:bg-surface-2"
      >
        <Icon name="edit" size={12}/>
      </button>
    </>
  )
}

// Linha de um arquivo: alça para arrastar, caixa de seleção, nome e remover.
function LinhaArquivo({ arquivo, selecionado, onAlternar, onRemover }) {
  const { setNodeRef, listeners, attributes, isDragging } = useArquivoArrastavel(arquivo.id, 'linha')
  return (
    <li ref={setNodeRef} className={`flex items-center gap-1.5 pr-3 pl-1 py-1.5 hover:bg-surface-2 ${isDragging ? 'opacity-40' : ''}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arraste para outro grupo"
        aria-label={`Arrastar ${arquivo.nome} para outro grupo`}
        className="w-5 h-6 grid place-items-center rounded-sm text-ink-hint hover:text-ink cursor-grab active:cursor-grabbing touch-none bg-transparent border-0 p-0"
      >
        <Icon name="grip" size={14}/>
      </button>
      <Checkbox checked={selecionado} onChange={onAlternar} title={`Selecionar ${arquivo.nome}`}/>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-ink truncate" title={arquivo.nome}>{arquivo.nome}</span>
        <span className="block text-[10px] text-ink-faint">{formatarTamanho(arquivo.tamanho)}</span>
      </span>
      <button
        type="button"
        onClick={onRemover}
        title="Remover da lista"
        aria-label={`Remover ${arquivo.nome}`}
        className="w-6 h-6 grid place-items-center rounded-sm text-ink-faint hover:text-red"
      >
        <Icon name="x" size={12}/>
      </button>
    </li>
  )
}

// Um grupo da lista: também é um alvo onde soltar arquivos arrastados.
function ItemGrupo({ grupo, arquivos, ativo, podeRemover, selecionados, dispatch, onRemoverArquivos }) {
  const { setNodeRef, isOver } = useAlvoGrupo(grupo.id, 'lista')
  const borda = isOver ? 'border-red bg-red-dim' : ativo ? 'border-red-border bg-surface' : 'border-border bg-surface'

  return (
    <li ref={setNodeRef} className={`rounded-lg border border-solid transition-colors ${borda}`}>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SELECIONAR_GRUPO', id: grupo.id })}
          aria-label={`Abrir grupo ${grupo.nome}`}
          aria-pressed={ativo}
          className={`w-2.5 h-2.5 rounded-full border-2 border-solid shrink-0 ${ativo ? 'border-red bg-red' : 'border-ink-hint bg-transparent hover:border-ink-muted'}`}
        />
        <NomeDoGrupo grupo={grupo} onRenomear={(id, nome) => dispatch({ type: 'RENOMEAR_GRUPO', id, nome })}/>
        <span className="text-[11px] text-ink-faint tabular-nums shrink-0">{arquivos.length}</span>
        {podeRemover && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'REMOVER_GRUPO', id: grupo.id })}
            title="Remover grupo (os arquivos vão para o grupo vizinho)"
            aria-label={`Remover grupo ${grupo.nome}`}
            className="w-6 h-6 grid place-items-center rounded-sm text-ink-faint hover:text-red hover:bg-surface-2"
          >
            <Icon name="trash" size={12}/>
          </button>
        )}
      </div>

      {ativo && (
        arquivos.length === 0 ? (
          <p className="m-0 px-3 pb-3 text-[12px] text-ink-faint">Nenhum arquivo neste grupo ainda.</p>
        ) : (
          <div className="border-t border-solid border-border-2">
            <div className="flex items-center justify-between px-3 py-1.5">
              <button type="button" className="text-[11px] text-ink-faint hover:text-ink underline" onClick={() => dispatch({ type: 'SELECIONAR_TODOS_DO_GRUPO', grupoId: grupo.id })}>
                Selecionar todos
              </button>
            </div>
            <ul className="list-none p-0 m-0 max-h-[320px] overflow-y-auto">
              {arquivos.map(a => (
                <LinhaArquivo
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
 * assinados no mesmo lugar. Para trocar arquivos de grupo, arraste-os (pela
 * alça ou pela miniatura) até o grupo de destino; se houver arquivos marcados,
 * arrastar um deles leva todos.
 */
export default function ListaGrupos({ estado, dispatch, onAdicionar, onRemoverArquivos, onNovoGrupo }) {
  const inputRef = useRef(null)
  const { grupos, selecionados, grupoAtivoId } = estado

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
            podeRemover={grupos.length > 1}
            selecionados={selecionados}
            dispatch={dispatch}
            onRemoverArquivos={onRemoverArquivos}
          />
        ))}
      </ul>
    </div>
  )
}
