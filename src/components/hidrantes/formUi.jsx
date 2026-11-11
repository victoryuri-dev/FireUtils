// formUi.jsx — pequenos componentes de formulário compartilhados entre
// FormularioSistema.jsx (Etapa 1 — classificação) e BombaESuccaoForm.jsx
// (Etapa 3 — bomba de incêndio), pra não duplicar o mesmo botão/campo com
// estilos ligeiramente diferentes nos dois lugares.
import Icon from '../ui/Icon'
import SwitchToggle from '../ui/SwitchToggle'

export const inputClass = 'bg-bg border border-solid border-border rounded-md text-ink text-xs py-1.5 px-2.5 w-full outline-none box-border'

export function Field({ label, hint, children }) {
  return (
    <div>
      {label && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mb-1">
          <div className="text-[10px] text-ink-faint uppercase tracking-[.06em]">{label}</div>
          {hint && <div className="text-[10px] text-ink-faint tabular-nums">{hint}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// Resultado calculado (não editável) — visual deliberadamente diferente de
// um campo de formulário (sem borda/caixa de input): rótulo pequeno em
// cima, valor em destaque embaixo, como um dado, não uma pergunta.
export function Resultado({ label, value, hint, className = '', centro = false }) {
  return (
    <div className={centro ? 'text-center' : ''}>
      <div className={`flex items-center ${centro ? 'justify-center' : 'justify-between'} gap-2 mb-1`}>
        <div className="text-[10px] text-ink-faint uppercase tracking-[.06em]">{label}</div>
        {hint && <div className="text-[10px] text-ink-faint tabular-nums whitespace-nowrap">{hint}</div>}
      </div>
      <div className={`text-sm font-bold text-ink ${className}`}>{value}</div>
    </div>
  )
}

export function Pill({ active, onClick, children, centro = false }) {
  return (
    <button type="button" onClick={onClick}
      className={`${centro ? 'text-center' : 'text-left'} py-2 px-3 rounded-md border border-solid text-xs transition-colors ${active ? 'border-red bg-red-dim text-ink font-semibold' : 'border-border bg-bg text-ink-faint hover:text-ink'}`}>
      {children}
    </button>
  )
}

export function Nota({ children }) {
  return (
    <div className="ibox amber mt-2">
      <Icon name="info" size={13} color="var(--color-amber)" className="shrink-0"/>
      <span className="text-xs">{children}</span>
    </div>
  )
}

export function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-ink">{label}</span>
      <SwitchToggle checked={checked} onChange={onChange}/>
    </div>
  )
}
