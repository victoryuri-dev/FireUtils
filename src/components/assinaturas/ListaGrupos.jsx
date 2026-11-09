import { useRef, useState } from 'react'
import { arquivosDoGrupo, formatarTamanho } from '../../utils/assinaturas/grupos'
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

/**
 * Grupos de assinatura e seus arquivos. Cada grupo é um conjunto de PDFs
 * assinados no mesmo lugar. Para mudar arquivos de grupo: marque-os e use
 * "Mover para".
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
          <label className="flex items-center gap-1.5">
            <span>Mover para</span>
            <select
              value=""
              onChange={e => e.target.value && dispatch({ type: 'MOVER_ARQUIVOS', ids: selecionados, grupoId: e.target.value })}
              className="h-7 py-0 px-1.5 text-[12px] rounded-md border border-solid border-border bg-bg text-ink"
            >
              <option value="">escolha o grupo…</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </label>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2" onClick={() => onRemoverArquivos(selecionados)}>
            <Icon name="trash" size={12}/> Remover
          </button>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2" onClick={() => dispatch({ type: 'LIMPAR_SELECAO' })}>Limpar</button>
        </div>
      )}

      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {grupos.map(grupo => {
          const arquivos = arquivosDoGrupo(estado, grupo.id)
          const ativo = grupo.id === grupoAtivoId
          return (
            <li key={grupo.id} className={`rounded-lg border border-solid ${ativo ? 'border-red-border bg-surface' : 'border-border bg-surface'}`}>
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
                {grupos.length > 1 && (
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
                        <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2">
                          <Checkbox
                            checked={selecionados.includes(a.id)}
                            onChange={() => dispatch({ type: 'ALTERNAR_SELECAO', id: a.id })}
                            title={`Selecionar ${a.nome}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12px] text-ink truncate" title={a.nome}>{a.nome}</span>
                            <span className="block text-[10px] text-ink-faint">{formatarTamanho(a.tamanho)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemoverArquivos([a.id])}
                            title="Remover da lista"
                            aria-label={`Remover ${a.nome}`}
                            className="w-6 h-6 grid place-items-center rounded-sm text-ink-faint hover:text-red"
                          >
                            <Icon name="x" size={12}/>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
