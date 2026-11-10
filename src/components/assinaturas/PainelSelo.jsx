import {
  ESTILOS, ROTULO_ESTILO, ALINHAMENTOS, ROTULO_ALINHAMENTO, MAX_TEXTO_EXTRA, normalizarSelo,
} from '../../utils/assinaturas/selo'
import Checkbox from '../ui/Checkbox'

// Caixa de marcação com rótulo clicável.
function Opcao({ rotulo, marcado, onMudar }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer select-none">
      <Checkbox checked={marcado} onChange={onMudar} title={rotulo}/>
      {rotulo}
    </label>
  )
}

/**
 * Aparência do selo visível do grupo: estilo, o que mostrar e um texto adicional
 * (o tamanho do texto é sempre o maior que cabe no quadro). `onSelo` recebe só o que mudou.
 */
export default function PainelSelo({ grupoId, selo: bruto, onSelo }) {
  const selo = normalizarSelo(bruto)
  const adobe = selo.estilo === 'adobe'

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-solid border-border-2">
      <h3 className="m-0 text-[13px] font-semibold text-ink">Aparência do selo</h3>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-faint">Estilo</span>
        <select
          value={selo.estilo}
          onChange={e => onSelo({ estilo: e.target.value })}
          className="h-9 py-0 px-2 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
        >
          {ESTILOS.map(e => <option key={e} value={e}>{ROTULO_ESTILO[e]}</option>)}
        </select>
      </label>

      {!adobe && (
        <div role="radiogroup" aria-label="Alinhamento do texto" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-2">
          {ALINHAMENTOS.map(a => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={selo.alinhamento === a}
              onClick={() => onSelo({ alinhamento: a })}
              className={`h-8 rounded-md text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-red ${selo.alinhamento === a ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-faint hover:text-ink'}`}
            >
              {ROTULO_ALINHAMENTO[a]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Opcao
          rotulo={adobe ? 'Mostrar “Assinado de forma digital por…”' : 'Mostrar “Assinado digitalmente por”'}
          marcado={selo.mostrarRotulo}
          onMudar={() => onSelo({ mostrarRotulo: !selo.mostrarRotulo })}
        />
        <Opcao rotulo="Mostrar data e hora" marcado={selo.mostrarData} onMudar={() => onSelo({ mostrarData: !selo.mostrarData })}/>
        <Opcao rotulo="Mostrar borda" marcado={selo.borda} onMudar={() => onSelo({ borda: !selo.borda })}/>
      </div>

      <label className="flex flex-col gap-1" htmlFor={`selo-extra-${grupoId}`}>
        <span className="text-[11px] text-ink-faint">Texto adicional</span>
        <input
          id={`selo-extra-${grupoId}`}
          type="text"
          value={bruto?.textoExtra ?? ''}
          maxLength={MAX_TEXTO_EXTRA}
          placeholder="ex.: CREA 1234-MA"
          onChange={e => onSelo({ textoExtra: e.target.value })}
          className="h-9 py-0 px-2.5 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
        />
      </label>
    </div>
  )
}
