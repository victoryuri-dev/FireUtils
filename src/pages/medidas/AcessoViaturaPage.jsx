import LinkNorma from '../../components/ui/LinkNorma'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { calcGatilho, calcAcessoViatura } from '../../data/av_calc'
import Icon from '../../components/ui/Icon'
import InfoTip from '../../components/ui/InfoTip'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { fmtNum } from '../../utils/numero'

const fmt = n => fmtNum(n || 0)

// ── Shared UI ─────────────────────────────────────────────────────────
const inputClass = 'bg-bg border border-solid border-border rounded-md text-ink text-xs py-1.5 px-2.5 w-full outline-none box-border'
// Mesma aparência, mas em âmbar — usada em campos obrigatórios ainda vazios,
// sem precisar de uma mensagem de alerta repetindo o que o campo já diz.
const inputWarnClass = 'bg-amber-dim border border-solid border-amber-border rounded-md text-ink text-xs py-1.5 px-2.5 w-full outline-none box-border'
function Label({ children }) {
  return <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1">{children}</div>
}
function Field({ label, hint, children }) {
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[10px] text-ink-faint uppercase tracking-[.06em]">{label}</div>
          {hint && <div className="text-[10px] text-ink-faint tabular-nums whitespace-nowrap">{hint}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
function NumberInput({ value, onChange, suffix, min = 0, defaultValue, limitMin, limitMax, required }) {
  // Campo pré-preenchido com o valor limite normativo (defaultValue) até o
  // usuário digitar algo diferente — evita ter que redigitar valores que já
  // atendem. Ao perder o foco, valores fora do limite (limitMin/limitMax)
  // são substituídos automaticamente pelo próprio limite.
  const display = (value === '' || value == null) && defaultValue != null ? defaultValue : value
  const isEmpty = required && (value === '' || value == null)
  const handleBlur = () => {
    if (value === '' || value == null) return
    const n = parseFloat(value)
    if (isNaN(n)) return
    if (limitMin != null && n < limitMin) onChange(String(limitMin))
    else if (limitMax != null && n > limitMax) onChange(String(limitMax))
  }
  return (
    <div className="relative">
      <input type="number" step="0.01" min={min} value={display}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlur}
        className={(isEmpty ? inputWarnClass : inputClass) + (suffix ? ' pr-8' : '')}/>
      {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">{suffix}</span>}
    </div>
  )
}
function Toggle({ checked, onChange, label }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex items-center gap-2 bg-transparent border border-solid border-border rounded-md py-1.5 px-3 cursor-pointer text-xs ${checked ? 'text-ink font-medium' : 'text-ink-faint font-normal'}`}>
      <div className={`w-7 h-4 rounded-[8px] shrink-0 relative transition-colors duration-200 ${checked ? 'bg-red' : 'bg-border'}`}>
        <div className={`absolute top-0.5 ${checked ? 'left-3.5' : 'left-0.5'} w-3 h-3 rounded-full bg-white transition-[left] duration-200`}/>
      </div>
      {label}
    </button>
  )
}
function Card({ children, className = '' }) {
  return <div className={`bg-surface border border-solid border-border rounded-lg overflow-hidden ${className}`}>{children}</div>
}
function SectionTitle({ n, label }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-6 h-6 rounded-md bg-red flex items-center justify-center text-[11px] font-bold text-white shrink-0">{n}</div>
      <h3 className="text-sm font-bold text-ink m-0">{label}</h3>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────
export default function AcessoViaturaPage() {
  const { state, dispatch } = useProjeto()
  const { av } = useNorma()
  const { GATILHO, VIA_ACESSO } = av
  const inputs = state.acessoViatura

  // Maior altura piso a piso entre as estruturas (Etapa 2)
  const altura = state.estruturas.reduce((mx, e) => Math.max(mx, parseFloat(e.alturaPisoPiso) || 0), 0)

  const set = changes => dispatch({ type: 'SET_ACESSO_VIATURA', changes })

  const gat = calcGatilho(altura, inputs.afastamentoMeioFio, inputs.isCondominio, GATILHO)
  const r = gat.exigido ? calcAcessoViatura(inputs, VIA_ACESSO) : null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        {/* Header */}
        <div className="mb-7">
          <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
            <Icon name={SISTEMA_ICON.acesso_viatura} size={20} color="var(--color-red)" className="shrink-0"/>
            Acesso de Viatura
          <LinkNorma sistema="acesso_viatura"/>
            <InfoTip side="bottom" align="start" text={<>O acesso a viatura garante que os caminhões dos bombeiros e ambulâncias consigam entrar e manobrar rapidamente dentro de uma propriedade em caso de emergência com o objetivo de salvar vidas e combater incêndios de forma ágil, permitindo que as equipes cheguem o mais próximo possível das vítimas e da estrutura.</>}/>
          </h2>
        </div>

        {/* S1 — Exigibilidade */}
        <div className="mb-8">
          <SectionTitle n={1} label="Exigibilidade da Via de Acesso"/>
          <Card className="mb-3">
            <div className="py-3.5 px-[28px] flex flex-col lg:flex-row lg:justify-between gap-4.5">
              <Field label="Maior altura piso a piso">
                <div className={`${inputClass} bg-surface-2 flex items-center font-bold text-ink`}>{fmt(altura)} m</div>
              </Field>
              <Field label={<>Afastamento da edificação até o meio-fio da via pública <Obrigatorio id="acessoViatura.afastamentoMeioFio"/></>}>
                <NumberInput value={inputs.afastamentoMeioFio} onChange={v => set({ afastamentoMeioFio: v })} suffix="m" required/>
              </Field>
              <Field label="Condomínio de residências uni/multifamiliares?">
                <Toggle checked={inputs.isCondominio} onChange={v => set({ isCondominio: v })} label={inputs.isCondominio ? 'Sim' : 'Não'}/>
              </Field>
            </div>
          </Card>
          <div className={`ibox ${gat.exigido ? 'red' : 'green'}`}>
            <Icon name={gat.exigido ? 'warn' : 'check'} size={14} color={`var(--color-${gat.exigido ? 'red' : 'green'})`} className="shrink-0"/>
            <span className="text-xs">
              {gat.motivo === 'condominio'
                ? 'Condomínio de residências — via de acesso dedicada é sempre exigida.'
                : gat.exigido
                  ? `Afastamento superior a ${gat.afastamentoMax} m (altura ${gat.faixa === 'baixa' ? '≤ 12 m' : '> 12 m'}) — via de acesso dedicada é exigida.`
                  : <><strong className="font-semibold text-green">Não exigida —</strong>{' '}a via pública é suficiente porque o afastamento está dentro do limite de {gat.afastamentoMax} m (altura {gat.faixa === 'baixa' ? '≤ 12 m' : '> 12 m'}).</>}
            </span>
          </div>
        </div>

        {!gat.exigido && (
          <div className="py-12 px-10 text-center border border-dashed border-border rounded-lg text-ink-faint text-[13px]">
            Nenhuma via de acesso dedicada é exigida para esta edificação — as seções de dimensionamento aparecem aqui quando a exigência for ativada acima.
          </div>
        )}

        {gat.exigido && (
          <div className="flex flex-col gap-8">

            {/* S2 — Largura e altura livre */}
            <div>
              <SectionTitle n={2} label="Largura e Altura Livre"/>
              <Card>
                <div className="py-3.5 px-[18px] grid grid-cols-2 gap-3.5">
                  <Field label="Largura adotada" hint={`mín. ${fmt(VIA_ACESSO.larguraMin)} m`}>
                    <NumberInput value={inputs.larguraAdotada} onChange={v => set({ larguraAdotada: v })} suffix="m" defaultValue={VIA_ACESSO.larguraMin} limitMin={VIA_ACESSO.larguraMin}/>
                  </Field>
                  <Field label="Altura livre adotada" hint={`mín. ${fmt(VIA_ACESSO.alturaLivreMin)} m`}>
                    <NumberInput value={inputs.alturaLivreAdotada} onChange={v => set({ alturaLivreAdotada: v })} suffix="m" defaultValue={VIA_ACESSO.alturaLivreMin} limitMin={VIA_ACESSO.alturaLivreMin}/>
                  </Field>
                </div>
              </Card>
            </div>

            {/* S3 — Capacidade de carga */}
            <div>
              <SectionTitle n={3} label="Capacidade de Carga do Pavimento"/>
              <Card>
                <div className="py-3.5 px-[18px] flex items-center justify-between gap-4">
                  <span className="text-xs text-ink-faint max-w-[560px] leading-[1.6]">
                    O pavimento da via de acesso suporta viaturas com peso de <strong className="text-ink">{VIA_ACESSO.cargaMinKg / 1000} t</strong> distribuídas em <strong className="text-ink">{VIA_ACESSO.cargaEixos} eixos</strong>, em toda a sua extensão?
                  </span>
                  <Toggle checked={inputs.cargaConfirmada} onChange={v => set({ cargaConfirmada: v })} label={inputs.cargaConfirmada ? 'Sim' : 'Não'}/>
                </div>
              </Card>
            </div>

            {/* S4 — Desnível */}
            <div>
              <SectionTitle n={4} label="Desnível da Via"/>
              <Card>
                <div className="py-3.5 px-[18px] grid grid-cols-2 gap-3.5">
                  <Field label="Desnível longitudinal adotado" hint={`máx. ${VIA_ACESSO.desnivelMaxPct}%`}>
                    <NumberInput value={inputs.desnivelLongAdotado} onChange={v => set({ desnivelLongAdotado: v })} suffix="%" defaultValue={VIA_ACESSO.desnivelMaxPct} limitMax={VIA_ACESSO.desnivelMaxPct}/>
                  </Field>
                  <Field label="Desnível transversal adotado" hint={`máx. ${VIA_ACESSO.desnivelMaxPct}%`}>
                    <NumberInput value={inputs.desnivelTransvAdotado} onChange={v => set({ desnivelTransvAdotado: v })} suffix="%" defaultValue={VIA_ACESSO.desnivelMaxPct} limitMax={VIA_ACESSO.desnivelMaxPct}/>
                  </Field>
                </div>
              </Card>
            </div>

            {/* S5 — Portão */}
            <div>
              <SectionTitle n={5} label="Portão de Acesso"/>
              <Card className={inputs.temPortao ? 'mb-3' : ''}>
                <div className="py-3.5 px-[18px] flex items-center justify-between gap-4">
                  <span className="text-xs text-ink-faint">A edificação possui portão no acesso da via?</span>
                  <Toggle checked={inputs.temPortao} onChange={v => set({ temPortao: v })} label={inputs.temPortao ? 'Sim' : 'Não'}/>
                </div>
              </Card>
              {inputs.temPortao && (
                <Card>
                  <div className="py-3.5 px-[18px] grid grid-cols-2 gap-3.5">
                    <Field label="Largura adotada" hint={`mín. ${fmt(VIA_ACESSO.portao.larguraMin)} m`}>
                      <NumberInput value={inputs.portaoLargura} onChange={v => set({ portaoLargura: v })} suffix="m" defaultValue={VIA_ACESSO.portao.larguraMin} limitMin={VIA_ACESSO.portao.larguraMin}/>
                    </Field>
                    <Field label="Altura adotada" hint={`mín. ${fmt(VIA_ACESSO.portao.alturaMin)} m`}>
                      <NumberInput value={inputs.portaoAltura} onChange={v => set({ portaoAltura: v })} suffix="m" defaultValue={VIA_ACESSO.portao.alturaMin} limitMin={VIA_ACESSO.portao.alturaMin}/>
                    </Field>
                  </div>
                </Card>
              )}
            </div>

            {/* S6 — Retorno */}
            <div>
              <SectionTitle n={6} label="Retorno de Viatura"/>
              <Card className="mb-3">
                <div className="py-3.5 px-[18px] grid grid-cols-2 gap-3.5 items-end">
                  <Field label={<>Extensão da via de acesso <Obrigatorio id="acessoViatura.extensaoVia"/></>}><NumberInput value={inputs.extensaoVia} onChange={v => set({ extensaoVia: v })} suffix="m"/></Field>
                  <div className="text-xs text-ink-faint">
                    {r.retorno.exigeRetorno
                      ? <span className="text-red font-medium">Extensão &gt; {r.retorno.gatilho} m — retorno obrigatório.</span>
                      : <span>Extensão ≤ {r.retorno.gatilho} m — retorno não obrigatório.</span>}
                  </div>
                </div>
              </Card>

              {r.retorno.exigeRetorno && (
                <Card className="mb-3">
                  <div className="py-3.5 px-[18px]">
                    <Label>Tipo de retorno adotado <Obrigatorio id="acessoViatura.tipoRetorno"/></Label>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {r.retorno.tipos.map(t => (
                        <button key={t} onClick={() => set({ tipoRetorno: t })}
                          className={`text-xs py-1.5 px-3 rounded-md border border-solid cursor-pointer capitalize ${inputs.tipoRetorno === t ? 'border-red-border bg-red-dim text-red font-semibold' : 'border-border bg-transparent text-ink-faint'}`}>
                          {t}
                        </button>
                      ))}
                      <button onClick={() => set({ tipoRetorno: 'outro' })}
                        className={`text-xs py-1.5 px-3 rounded-md border border-solid cursor-pointer shrink-0 ${inputs.tipoRetorno === 'outro' ? 'border-red-border bg-red-dim text-red font-semibold' : 'border-border bg-transparent text-ink-faint'}`}>
                        Outro
                      </button>
                      {inputs.tipoRetorno === 'outro' && (
                        <><Obrigatorio id="acessoViatura.tipoRetornoOutroDesc"/><input type="text" autoFocus placeholder="Especifique o tipo de retorno adotado"
                          value={inputs.tipoRetornoOutroDesc}
                          onChange={e => set({ tipoRetornoOutroDesc: e.target.value })}
                          className={`${inputs.tipoRetornoOutroDesc ? inputClass : inputWarnClass} flex-1 min-w-[220px] w-auto`}/></>
                      )}
                    </div>
                    {!inputs.tipoRetorno && (
                      <div className="ibox amber mt-3 mb-0">
                        <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
                        <span className="text-xs">Selecione o tipo de retorno adotado.</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              <Card className={!inputs.manobraRetornoOk ? 'mb-3' : ''}>
                <div className="py-3.5 px-[18px] flex items-center justify-between gap-4">
                  <span className="text-xs text-ink-faint max-w-[560px] leading-[1.6]">
                    As ruas internas possibilitam manobra de retorno da viatura para saída pelo portão de acesso? (5.1.1.6.2)
                  </span>
                  <Toggle checked={inputs.manobraRetornoOk} onChange={v => set({ manobraRetornoOk: v })} label={inputs.manobraRetornoOk ? 'Sim' : 'Não'}/>
                </div>
              </Card>

              {!inputs.manobraRetornoOk && (
                <Card>
                  <div className="py-3.5 px-[18px] grid grid-cols-2 gap-3.5">
                    <Field label="Saída independente — largura adotada" hint={`mín. ${fmt(VIA_ACESSO.portao.larguraMin)} m`}>
                      <NumberInput value={inputs.saidaIndepLargura} onChange={v => set({ saidaIndepLargura: v })} suffix="m" defaultValue={VIA_ACESSO.portao.larguraMin} limitMin={VIA_ACESSO.portao.larguraMin}/>
                    </Field>
                    <Field label="Saída independente — altura adotada" hint={`mín. ${fmt(VIA_ACESSO.portao.alturaMin)} m`}>
                      <NumberInput value={inputs.saidaIndepAltura} onChange={v => set({ saidaIndepAltura: v })} suffix="m" defaultValue={VIA_ACESSO.portao.alturaMin} limitMin={VIA_ACESSO.portao.alturaMin}/>
                    </Field>
                  </div>
                </Card>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
