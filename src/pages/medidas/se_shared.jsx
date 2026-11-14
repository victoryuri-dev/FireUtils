import Obrigatorio from '../../components/ui/Obrigatorio'
import { numeroPositivo, inteiroPositivo } from '../../data/auditoriaProjeto'
// ─────────────────────────────────────────────────────────────────────────────
// se_shared.jsx — UI compartilhada entre SaidaEmergenciaPage.jsx e
// FluxogramaSaidas.jsx (formulário de ambiente, badges, toggle,
// formatação). Módulo próprio pra evitar import circular entre as duas
// páginas (a principal lista os pavimentos; o fluxograma reaproveita o
// formulário de ambiente da principal).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { taxaOpcoes, popTipoPadrao, calcPT, calcPopArquibancada, divisaoComArquibancada, ARQUIBANCADA_TAXA } from '../../data/se_calc'
import { fmtNum } from '../../utils/numero'

export const fmt  = n => fmtNum(n, 2, '0')
export const fmtM = n => `${fmt(n)} m`

const inputClass = 'bg-bg border border-solid border-border rounded-md text-ink text-xs py-1.5 px-2.5 w-full outline-none box-border'

function Label({ children }) {
  return <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1">{children}</div>
}

// Tag de ocupação (código da divisão, ex.: "D-1") — cinza neutro. Vermelho
// fica reservado pros valores de largura mínima (o que de fato importa
// dimensionalmente), não pra classificação.
export function DivBadge({ label }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded bg-surface-2 border border-solid border-border text-ink-muted text-[11px] font-bold">{label || '?'}</span>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex items-center gap-2 bg-transparent border border-solid border-border rounded-md py-1.5 px-3 cursor-pointer text-xs ${checked ? 'text-ink font-medium' : 'text-ink-faint font-normal'}`}>
      <div className={`w-7 h-4 rounded-[8px] shrink-0 relative transition-colors duration-200 ${checked ? 'bg-red' : 'bg-border'}`}>
        <div className={`absolute top-0.5 ${checked ? 'left-3.5' : 'left-0.5'} w-3 h-3 rounded-full bg-white transition-[left] duration-200`}/>
      </div>
      {label}
    </button>
  )
}

// ── DivisaoSelect — usa OCUPACOES do estado vigente ───────────────────
function DivisaoSelect({ value, onChange, ocupacoes }) {
  return (
    <select className={inputClass} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Selecionar divisão...</option>
      {Object.keys(ocupacoes).sort().map(grupo => (
        <optgroup key={grupo} label={`Grupo ${grupo} — ${ocupacoes[grupo]?.descricao || grupo}`}>
          {Object.keys(ocupacoes[grupo]?.divisoes || {}).map(div => (
            <option key={div} value={div}>{div}: {ocupacoes[grupo].divisoes[div]}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ── Formulário de ambiente ────────────────────────────────────────────
// Sem campo de nome — o nome do ambiente é editado pelo lápis no título do
// modal que envolve este formulário (ver FluxogramaSaidas.jsx), não
// aqui. `larguras`, se informado, habilita o cálculo de N° UP (porta) no
// rodapé — omitir pra esconder esse número (ex.: uso fora do contexto da
// fluxograma de saídas, onde ele não faz sentido).
export function AmbienteForm({ initial, onSave, onCancel, seNorma, ocupacoes, larguras }) {
  const { TAXA_POPULACIONAL, NOTAS_NORMATIVAS } = seNorma
  const blank = { divisao:'', popTipo:'area', area:'', assentos:'', popManual:'', arquibancada:false, arquibancadaComprimento:'' }
  const [form, setForm] = useState(() => initial ? {
    divisao: initial.divisao, popTipo: initial.popTipo,
    area: initial.area ? String(initial.area) : '',
    assentos: initial.assentos ? String(initial.assentos) : '',
    popManual: initial.popManual ? String(initial.popManual) : '',
    arquibancada: !!initial.arquibancada,
    arquibancadaComprimento: initial.arquibancadaComprimento ? String(initial.arquibancadaComprimento) : '',
  } : blank)

  const taxa    = TAXA_POPULACIONAL[form.divisao]
  const opcoes  = taxaOpcoes(form.divisao, TAXA_POPULACIONAL)
  const isManual = form.popTipo === 'manual'
  const isFixo   = form.popTipo === 'fixo'
  const isArea   = form.popTipo === 'area'

  const temArquibancada = divisaoComArquibancada(form.divisao)
  const arquibancadaOn  = temArquibancada && form.arquibancada

  const popCalc = () => {
    const arq = calcPopArquibancada({ divisao: form.divisao, arquibancada: form.arquibancada, arquibancadaComprimento: form.arquibancadaComprimento })
    if (isFixo)   return (parseInt(form.assentos)  || 0) + arq
    if (isManual) return (parseInt(form.popManual) || 0) + arq
    return (taxa?.A && form.area ? Math.ceil(parseFloat(form.area) / taxa.A) : 0) + arq
  }

  const setDivisao = div => setForm(f => ({ ...f, divisao: div, popTipo: popTipoPadrao(div, TAXA_POPULACIONAL), area:'', assentos:'', popManual:'', arquibancada:false, arquibancadaComprimento:'' }))
  const setTipo    = tipo => setForm(f => ({ ...f, popTipo: tipo, area:'', assentos:'', popManual:'' }))

  const canSave = () => {
    if (!form.divisao) return false
    if (isArea && !numeroPositivo(form.area)) return false
    if (isFixo && !inteiroPositivo(form.assentos)) return false
    if (isManual && !inteiroPositivo(form.popManual)) return false
    if (arquibancadaOn && !numeroPositivo(form.arquibancadaComprimento)) return false
    return true
  }

  const handleSave = () => {
    if (!canSave()) return
    onSave({ divisao: form.divisao, popTipo: form.popTipo, area: parseFloat(form.area)||0, assentos: parseInt(form.assentos)||0, popManual: parseInt(form.popManual)||0,
      arquibancada: arquibancadaOn, arquibancadaComprimento: arquibancadaOn ? (parseFloat(form.arquibancadaComprimento)||0) : 0 })
  }

  const inputLabel = isArea ? 'Área (m²)' : isFixo ? 'Assentos' : 'População estimada (pessoas)'
  const pop = popCalc()
  const nUP = larguras ? calcPT(pop, taxa?.PT ?? 100, larguras).n : null

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Label>Divisão <Obrigatorio/></Label>
        <DivisaoSelect value={form.divisao} onChange={setDivisao} ocupacoes={ocupacoes}/>
      </div>

      {form.divisao && (
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <Label>Taxa normativa <Obrigatorio/></Label>
            {opcoes.length > 1 ? (
              <select className={inputClass} value={form.popTipo} onChange={e => setTipo(e.target.value)}>
                {opcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <div className={`${inputClass} bg-surface text-ink-faint flex items-center`}>
                {opcoes[0]?.label || '—'}
              </div>
            )}
          </div>
          <div>
            <Label>{inputLabel} <Obrigatorio/></Label>
            {isArea   && <input className={inputClass} type="number" min="0" placeholder="ex.: 64,5" value={form.area}     onChange={e => setForm(f=>({...f,area:e.target.value}))}     onKeyDown={e=>e.key==='Enter'&&handleSave()}/>}
            {isFixo   && <input className={inputClass} type="number" min="0" placeholder="ex.: 120"  value={form.assentos} onChange={e => setForm(f=>({...f,assentos:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleSave()}/>}
            {isManual && <input className={inputClass} type="number" min="0" placeholder="ex.: 8"    value={form.popManual} onChange={e => setForm(f=>({...f,popManual:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleSave()}/>}
          </div>
        </div>
      )}

      {temArquibancada && (
        <div>
          <Toggle label="Possui arquibancada?" checked={form.arquibancada}
            onChange={v => setForm(f => ({ ...f, arquibancada: v, arquibancadaComprimento: '' }))}/>
        </div>
      )}

      {arquibancadaOn && (
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <Label>Taxa normativa (arquibancada) <Obrigatorio/></Label>
            <div className={`${inputClass} bg-surface text-ink-faint flex items-center`}>{ARQUIBANCADA_TAXA.obs}</div>
          </div>
          <div>
            <Label>Comprimento de banco (m) <Obrigatorio/></Label>
            <input className={inputClass} type="number" min="0" placeholder="ex.: 40" value={form.arquibancadaComprimento}
              onChange={e => setForm(f=>({...f,arquibancadaComprimento:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleSave()}/>
          </div>
        </div>
      )}

      {taxa?.notas?.length > 0 && (
        <div>
          <Label>Notas</Label>
          <div className="flex flex-col gap-1">
            {taxa.notas.map(k => NOTAS_NORMATIVAS[k] && (
              <div key={k} className="text-[11px] text-ink-faint leading-[1.5]">{NOTAS_NORMATIVAS[k]}</div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-1 border-t border-solid border-border-2">
        <div className="flex gap-6">
          <div>
            <div className="text-[9px] text-ink-faint uppercase tracking-[.07em] mb-0.5">População</div>
            <div className={`text-lg font-bold ${pop>0 ? 'text-red' : 'text-ink-faint'}`}>{pop} Pessoas</div>
          </div>
          {nUP !== null && (
            <div>
              <div className="text-[9px] text-ink-faint uppercase tracking-[.07em] mb-0.5">U.P.</div>
              <div className="text-lg font-bold text-ink">{nUP} UP</div>
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button className="btn-ghost" onClick={onCancel}><Icon name="x" size={12}/> Cancelar</button>
          <button className={`btn-primary ${canSave() ? 'opacity-100 pointer-events-auto' : 'opacity-45 pointer-events-none'}`} onClick={handleSave}>
            <Icon name="check" size={12}/> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
