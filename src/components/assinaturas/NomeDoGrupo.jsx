import { useState } from 'react'
import Icon from '../ui/Icon'

const ESTILOS = {
  // Na lista da esquerda: texto pequeno, linha de 24 px (a altura do cabeçalho não muda ao editar).
  lista: { texto: 'text-[13px] font-semibold text-ink', input: 'h-6 py-0 px-1.5 text-[13px]', espaco: true },
  // No título do box do grupo, na área central.
  secao: { texto: 'font-heading text-[16px] font-semibold text-ink', input: 'h-7 py-0 px-1.5 text-[15px]', espaco: false },
}

/**
 * Nome do grupo: clicar nele (ou no lápis ao lado) edita. Enter ou sair do campo confirma, Esc
 * cancela; nome vazio é ignorado. `variante`: 'lista' (barra lateral) ou 'secao' (título do box).
 */
export default function NomeDoGrupo({ grupo, onRenomear, variante = 'lista' }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(grupo.nome)
  const e = ESTILOS[variante]

  function confirmar() {
    setEditando(false)
    if (texto.trim() && texto.trim() !== grupo.nome) onRenomear(grupo.id, texto)
  }
  function editar(ev) {
    ev.stopPropagation()
    setTexto(grupo.nome)
    setEditando(true)
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={texto}
        maxLength={60}
        onChange={ev => setTexto(ev.target.value)}
        onBlur={confirmar}
        onClick={ev => ev.stopPropagation()}
        onKeyDown={ev => {
          if (ev.key === 'Enter') confirmar()
          if (ev.key === 'Escape') setEditando(false)
        }}
        aria-label="Nome do grupo"
        className={`min-w-0 flex-1 ${e.input}`}
      />
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={editar}
        title="Clique para renomear"
        className={`m-0 min-w-0 truncate text-left bg-transparent border-0 p-0 cursor-text ${e.texto}`}
      >
        {grupo.nome}
      </button>
      <button
        type="button"
        onClick={editar}
        title="Renomear grupo"
        aria-label={`Renomear ${grupo.nome}`}
        className="w-6 h-6 grid place-items-center shrink-0 rounded-sm text-ink-faint bg-transparent border-0 p-0 cursor-pointer"
      >
        <Icon name="edit" size={12}/>
      </button>
      {e.espaco && <span className="flex-1"/>}
    </>
  )
}
