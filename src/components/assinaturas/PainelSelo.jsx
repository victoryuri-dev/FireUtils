import { MAX_TEXTO_EXTRA, normalizarSelo } from '../../utils/assinaturas/selo'
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
 * Aparência do selo visível do grupo: o que mostrar e um texto adicional
 * (o tamanho do texto é sempre o maior que cabe no quadro). `onSelo` recebe só o que mudou.
 */
export default function PainelSelo({ grupoId, selo: bruto, onSelo }) {
  const selo = normalizarSelo(bruto)

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-solid border-border-2">
      <h3 className="m-0 text-[13px] font-semibold text-ink">Aparência do selo</h3>

      <div className="flex flex-col gap-2">
        <Opcao
          rotulo="Mostrar “Assinado de forma digital por…”"
          marcado={selo.mostrarRotulo}
          onMudar={() => onSelo({ mostrarRotulo: !selo.mostrarRotulo })}
        />
        <Opcao rotulo="Mostrar data e hora" marcado={selo.mostrarData} onMudar={() => onSelo({ mostrarData: !selo.mostrarData })}/>
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
