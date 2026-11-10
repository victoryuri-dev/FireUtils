import { useProjeto } from '../../context/ProjetoContext'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { getMemorialFormulario } from '../../data/normas/index'
import {
  ATESTOS_PB, SPDA_CAMPOS, SPDA_EQUIPOTENCIAL, atestoMarcado, resumoBrigadaPB, INTERVALO_SIMULADOS_PADRAO, ESTAGIOS_EXISTENTE, ESTAGIOS_COM_ADAPTACOES,
  distanciaMaximaPontosPB, tiposIluminacaoPB, secoesIluminacaoPB, DETECTORES_PB,
  contextoFormularioPB, resultadoExtintoresPB, especiaisExtintoresPB, especialMarcado, ATESTOS_BOMBAS_MARCAVEIS,
} from './formulario'
import { decidirAcessoViaturaPB } from './acessoViatura'
import { riscoValidadePB } from './validade'

const RISCO_VALIDADE_LABEL = { baixo: 'baixo', medio: 'médio', alto: 'alto' }
import { fmtNum } from '../../utils/numero'
import { NIVEL_LABEL } from '../../data/brigada_calc'
import FormSection from '../../components/ui/FormSection'
import LinhaMarcavel from '../../components/ui/LinhaMarcavel'
import CaixaInfo from '../../components/ui/CaixaInfo'
import SwitchToggle from '../../components/ui/SwitchToggle'
import { EscolhaSistemaIluminacao } from '../../pages/medidas/IluminacaoPage'
import { BotaoOpcao } from '../../components/deteccao/DaUi'

// Campos do formulário do Memorial Descritivo do CBMPB — só o que o
// formulário pede e nenhuma outra tela coleta, guardado em state.memorialPB
// (ProjetoContext). Usados nas páginas de medida da PB (estados/PB/paginas)
// e, os gerais, nas etapas da Configuração (estados/ExtensaoConfig.jsx). O
// restante de cada seção sai dos dados da Configuração e dos cálculos.

function useCamposPB() {
  const { state, dispatch } = useProjeto()
  const m = state.memorialPB || {}
  const set = changes => dispatch({ type: 'SET_MEMORIAL_PB', changes })
  const campo = key => ({ value: m[key] || '', onChange: e => set({ [key]: e.target.value }) })
  const atestos = m.atestos || {}
  const alternarAtesto = key => set({ atestos: { ...atestos, [key]: !atestoMarcado(atestos, key) } })
  const alternarEm = (key, valor) => {
    const lista = m[key] || []
    set({ [key]: lista.includes(valor) ? lista.filter(v => v !== valor) : [...lista, valor] })
  }
  return { state, dispatch, m, set, campo, atestos, alternarAtesto, alternarEm, F: getMemorialFormulario(state.uf) }
}

export function BoxPB({ titulo = 'Preenchimento do formulário', item, children }) {
  return (
    <FormSection title={titulo} description={item ? `Item ${item} do formulário do Memorial Descritivo do CBMPB.` : undefined}>
      <div className="flex flex-col gap-3">{children}</div>
    </FormSection>
  )
}

// Linha marcável comum (components/ui/LinhaMarcavel).
const Marcador = props => <LinhaMarcavel {...props}/>

function Rotulo({ children }) {
  return <span className="text-[11px] font-medium text-ink-faint uppercase tracking-[.06em]">{children}</span>
}

// Grupo de declarações: título com a contagem do que está marcado e as
// linhas logo abaixo (recuadas pelo próprio padding da linha, alinhando a
// caixa com o título).
function Atestos({ lista, atestos, alternar, titulo = 'Declarações do responsável técnico' }) {
  const marcados = lista.filter(([key]) => atestoMarcado(atestos, key)).length
  return (
    <div className="flex flex-col">
      {titulo && (
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <Rotulo>{titulo}</Rotulo>
          <span className="text-[11px] text-ink-faint tabular-nums">{marcados} de {lista.length}</span>
        </div>
      )}
      <div className="flex flex-col gap-0.5 -mx-2.5">
        {lista.map(([key, label]) => <Marcador key={key} label={label} checked={atestoMarcado(atestos, key)} onChange={() => alternar(key)}/>)}
      </div>
    </div>
  )
}

function Opcoes({ titulo, lista, valor, onChange }) {
  return (
    <div className="fg">
      <label>{titulo}</label>
      <select value={valor || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— não informado —</option>
        {lista.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
  )
}

const Obs = ({ label, campo }) => <div className="fg"><label>{label}</label><textarea rows={2} {...campo}/></div>

// ── Configuração ──────────────────────────────────────────────────────────

// Etapa 2, box Situação: item 3.6. Edificação nova = "ainda será construída",
// sem pergunta. Existente: as três opções "as built" do formulário;
// adaptações da NT 16 ou Resoluções Técnicas pedem a descrição delas.
export function EstagioExistentePB() {
  const { state, m, set, campo, F } = useCamposPB()
  if (!F || state.situacao !== 'existente') return null
  const opcoes = F.ESTAGIOS_CONSTRUCAO.filter(e => ESTAGIOS_EXISTENTE.includes(e.key))
  return (
    <div className="mb-3.5 py-3 px-4 rounded-md border border-solid border-border">
      <div className="text-[13px] font-medium text-ink mb-0.5">Estágio de construção (CBMPB)</div>
      <div className="text-[11px] text-ink-faint mb-3">Item 3.6 do formulário do Memorial Descritivo da Paraíba.</div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Estágio de construção">
        {opcoes.map(e => {
          const sel = m.estagioConstrucao === e.key
          return (
            <div key={e.key} role="radio" aria-checked={sel} tabIndex={0}
              onClick={() => set({ estagioConstrucao: e.key })}
              onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); set({ estagioConstrucao: e.key }) } }}
              className={`border border-solid rounded-md py-2.5 px-3.5 flex items-center gap-3 cursor-pointer ${sel ? 'border-red-border bg-red-dim' : 'border-border bg-transparent'}`}>
              <span className={`w-3.5 h-3.5 rounded-full border-[1.5px] border-solid shrink-0 flex items-center justify-center ${sel ? 'border-red' : 'border-ink-hint'}`}>
                {sel && <span className="w-1.5 h-1.5 rounded-full bg-red"/>}
              </span>
              <span className={`text-[12.5px] ${sel ? 'text-ink font-medium' : 'text-ink-muted'}`}>{e.label}</span>
            </div>
          )
        })}
      </div>
      {ESTAGIOS_COM_ADAPTACOES.includes(m.estagioConstrucao) && (
        <div className="fg mt-3">
          <label>{m.estagioConstrucao === 'existente_nt16' ? 'Adaptações da NT 16 utilizadas na edificação' : 'Resoluções Técnicas utilizadas na edificação'}</label>
          <textarea rows={3} {...campo('adaptacoes')}/>
        </div>
      )}
    </div>
  )
}

// Etapa 4 (Classificação): item 3.1.
export function CamposPBGerais() {
  const { state, m, set, campo, F } = useCamposPB()
  const { porEstrutura } = useMedidasObrigatorias()
  if (!F) return null
  const divisoes = [...new Set((porEstrutura || []).flatMap(pe => pe.divisoes || []))].sort()
  const temF3 = divisoes.includes('F-3')
  const rv = riscoValidadePB(state.uf, divisoes, !!m.f3EstadioFutebol)
  return (
    <div className="mt-6">
      <BoxPB titulo="Campos específicos da Paraíba" item="3.1">
        <Obs label="Observações complementares — natureza da ocupação" campo={campo('obsNatureza')}/>
      </BoxPB>
      <BoxPB titulo="Risco da edificação e validade de inspeção" item="3.4">
        <div className="text-[11px] text-ink-faint mb-3">Anexo B da NT CBMPB 02/2023 — vale o maior risco entre as divisões do projeto.</div>
        {temF3 && (
          <div className="-mx-2.5 mb-2">
            <Marcador label="O centro esportivo (F-3) é estádio de futebol" checked={!!m.f3EstadioFutebol}
              onChange={() => set({ f3EstadioFutebol: !m.f3EstadioFutebol })}/>
          </div>
        )}
        <div className="text-[12.5px] text-ink">
          {rv
            ? <>Risco <strong>{RISCO_VALIDADE_LABEL[rv.risco]}</strong> ({rv.divisoes.join(', ')}) — validade da inspeção de até <strong className="tabular-nums">{rv.validadeAnos}</strong> {rv.validadeAnos === 1 ? 'ano' : 'anos'}.</>
            : <span className="text-ink-faint">Classifique as ocupações para definir o risco e a validade.</span>}
        </div>
      </BoxPB>
    </div>
  )
}

// Etapa 6 (Medidas de segurança): item 3.4.1 — só com o risco GLP.
export function CamposPBGlp() {
  const { state, m, set, F } = useCamposPB()
  const temGlp = Object.values(state.riscosEspeciaisPorEstrutura || {}).some(r => r?.glp)
  if (!F || !temGlp) return null
  return (
    <div className="mt-6">
      <BoxPB titulo="Campos específicos da Paraíba" item="3.4.1">
        <Opcoes titulo="Classe de risco para revenda de GLP (Tabela 1, NBR 15514)" lista={F.CLASSES_GLP.map(g => [g.key, g.label])}
          valor={m.glpClasse} onChange={v => set({ glpClasse: v })}/>
      </BoxPB>
    </div>
  )
}

// ── Páginas de medida da PB ───────────────────────────────────────────────

// 10 — declarações do RT (o dimensionamento vem da página de Saída de
// Emergência, comum aos estados).
export function CamposSaidasPB() {
  const { state, atestos, alternarAtesto } = useCamposPB()
  // Só com mais de um pavimento (contando subsolos) em alguma estrutura.
  const temPavimentos = (state.estruturas || []).some(e => (parseInt(e.nPavimentos) || 1) + (parseInt(e.nSubsolos) || 0) > 1)
  if (!temPavimentos) return null
  return (
    <div className="mt-6">
      <BoxPB titulo="Declarações do responsável técnico" item="10">
        <Atestos titulo="" lista={ATESTOS_PB.saidas} atestos={atestos} alternar={alternarAtesto}/>
      </BoxPB>
    </div>
  )
}

// 11.1 — modelo do plano de emergência.
export function CamposPlanoPB() {
  const { m, set, F } = useCamposPB()
  if (!F) return null
  return (
    <BoxPB item="11.1">
      <Opcoes titulo="Como o plano de emergência foi elaborado" lista={F.MODELOS_PLANO.map(p => [p.key, p.label])}
        valor={m.planoModelo} onChange={v => set({ planoModelo: v })}/>
    </BoxPB>
  )
}

// 12 — o que o formulário pede além do dimensionamento da página de brigada
// comum (população fixa, Tabela A.1 e item 4.11.2 da PB): carga horária,
// intervalo entre simulados e declarações. O campo "Dimensionamento" do
// formulário sai do próprio cálculo da página.
export function CamposBrigadaPB() {
  const { state, m, set, atestos, alternarAtesto } = useCamposPB()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const r = resumoBrigadaPB(state, sistemas, porEstrutura)
  const simulados = m.brigadaIntervaloSimulados ?? INTERVALO_SIMULADOS_PADRAO
  return (
    <div className="mt-6">
      <BoxPB titulo="Formulário do CBMPB — item 12" item="12">
        <div className="flex flex-col gap-2">
          <Rotulo>Carga horária mínima do treinamento</Rotulo>
          {r?.cargaHoraria != null ? (
            <div className="rounded-md border border-solid border-border py-2.5 px-3 flex flex-col gap-1.5">
              <div className="text-[13px] text-ink"><strong>{r.cargaHoraria} horas</strong> — nível {(NIVEL_LABEL[r.nivelMax] || '').toLowerCase()}, o maior exigido no dimensionamento acima</div>
              <div className="text-[11.5px] text-ink-faint">Tabela B.2 da NT 17/2024 (módulo e carga horária mínima por nível do treinamento):</div>
              <ul className="m-0 pl-4 flex flex-col gap-0.5 text-xs text-ink-muted">
                {r.cargaHorariaPartes.map(([parte, h]) => <li key={parte}>{parte}: {h} h</li>)}
              </ul>
            </div>
          ) : (
            <span className="text-[12px] text-ink-faint">Sai do nível de treinamento do dimensionamento acima (Tabela B.2): básico 4 h, intermediário 8 h, avançado 24 h.</span>
          )}
        </div>
        <div className="fg">
          <label>Tempo entre simulados</label>
          <input value={simulados} placeholder={INTERVALO_SIMULADOS_PADRAO} onChange={e => set({ brigadaIntervaloSimulados: e.target.value })}/>
        </div>
        <Atestos lista={ATESTOS_PB.brigada} atestos={atestos} alternar={alternarAtesto}/>
      </BoxPB>
    </div>
  )
}

// 13 — escolha do sistema (o mesmo formulário do MA, com a UPS da norma da
// PB), fluxo luminoso, altura de instalação (distância máxima = 4 × altura)
// e atestos; os de 13.1–13.4 só do tipo adotado.
export function CamposIluminacaoPB() {
  const { state, campo, atestos, alternarAtesto } = useCamposPB()
  const dist = distanciaMaximaPontosPB(campo('iluAlturaInstalacao').value)
  return (
    <>
      <EscolhaSistemaIluminacao/>
      <BoxPB item="13">
        <div className="g2">
          <div className="fg"><label>Altura de instalação do ponto de luz (m)</label><input inputMode="decimal" {...campo('iluAlturaInstalacao')} placeholder="Ex.: 2,40"/></div>
          <div className="fg"><label>Distância máxima entre pontos (4 × altura)</label><input readOnly value={dist ? `${fmtNum(dist, 2)} m` : ''} placeholder="Informe a altura"/></div>
        </div>
        <div className="fg"><label>Fluxo luminoso exato das luminárias (lm)</label><input inputMode="decimal" {...campo('iluFluxo')} placeholder="Ex.: 300"/></div>
      </BoxPB>
      {/* Uma caixa por parte do item 13, só com o que vale para o sistema
          escolhido acima. */}
      {secoesIluminacaoPB(tiposIluminacaoPB(state)).map(({ chave, titulo, lista }) => (
        <FormSection key={chave} title={titulo}>
          <Atestos titulo={null} lista={lista} atestos={atestos} alternar={alternarAtesto}/>
        </FormSection>
      ))}
    </>
  )
}

// 14 — local da central, atestos do alarme (14.1) e tipos de detector (14.2),
// cada medida na sua página.
// Local da central: um só campo para alarme e detecção (a central é a
// mesma) — fica na página do alarme; a da detecção só o mostra quando o
// alarme não é exigido (sem página de alarme para preenchê-lo).
const CampoCentralPB = ({ campo }) => (
  <div className="fg"><label>Localização da central de alarme e detecção (cômodo)</label><input {...campo('alarmeCentralLocal')} placeholder="Ex.: Portaria"/></div>
)

export function CamposAlarmePB() {
  const { campo, atestos, alternarAtesto } = useCamposPB()
  return (
    <BoxPB item="14.1">
      <CampoCentralPB campo={campo}/>
      <Atestos lista={ATESTOS_PB.alarme} atestos={atestos} alternar={alternarAtesto}/>
    </BoxPB>
  )
}

// Valor de detector com teto (o máximo do formulário): já vem com o máximo;
// ao sair do campo, um valor acima dele volta para o máximo.
function NumeroMaximo({ label, value, onChange, maximo, sufixo = 'm' }) {
  const exibido = value === '' || value == null ? String(maximo) : value
  const aoSair = () => {
    const n = parseFloat(String(value ?? '').replace(',', '.'))
    if (Number.isFinite(n) && n > maximo) onChange(String(maximo))
  }
  return (
    <div className="fg">
      <label>{label} (máximo {fmtNum(maximo, 2)} {sufixo})</label>
      <div className="relative">
        <input type="number" step="0.1" min="0" max={maximo} value={exibido} onChange={e => onChange(e.target.value)} onBlur={aoSair} className="pr-8"/>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">{sufixo}</span>
      </div>
    </div>
  )
}

// 14.2 — tipos de detector (botões, como na página do MA) e, para cada tipo
// ativo, os campos do formulário. Preenchimento geral, não por estrutura.
export function CamposDeteccaoPB() {
  const { m, set, campo, alternarEm } = useCamposPB()
  const { sistemas } = useMedidasObrigatorias()
  const tipos = m.detectoresTipos || []
  const setValor = (tipo, key, valor) => set({ deteccao: { ...(m.deteccao || {}), [tipo]: { ...(m.deteccao?.[tipo] || {}), [key]: valor } } })
  return (
    <>
      <BoxPB item="14.2">
        {!sistemas?.alarme?.ativo && <CampoCentralPB campo={campo}/>}
        <div className="flex flex-col gap-2">
          <Rotulo>Tipos de detector utilizados</Rotulo>
          <div className="flex gap-2">
            {DETECTORES_PB.map(d => (
              <BotaoOpcao key={d.key} ativo={tipos.includes(d.key)} onClick={() => alternarEm('detectoresTipos', d.key)}>{d.label}</BotaoOpcao>
            ))}
          </div>
        </div>
      </BoxPB>
      {DETECTORES_PB.filter(d => tipos.includes(d.key)).map(d => (
        <FormSection key={d.key} title={`Detecção — ${d.label.toLowerCase()}`}>
          <div className="g2">
            {d.campos.map(c => (
              <NumeroMaximo key={c.key} label={c.label} maximo={c.maximo}
                value={m.deteccao?.[d.key]?.[c.key] ?? ''} onChange={v => setValor(d.key, c.key, v)}/>
            ))}
          </div>
        </FormSection>
      ))}
    </>
  )
}

// 15 — atestos da sinalização.
export function CamposSinalizacaoPB() {
  const { atestos, alternarAtesto } = useCamposPB()
  return (
    <BoxPB item="15">
      <Atestos lista={ATESTOS_PB.sinalizacao} atestos={atestos} alternar={alternarAtesto}/>
    </BoxPB>
  )
}

// 16 — capacidade extintora do nível III (as demais linhas são automáticas).
export function CamposExtintoresPB() {
  const { state, m, set, atestos } = useCamposPB()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const ctx = contextoFormularioPB(state, sistemas, porEstrutura)
  const r = resultadoExtintoresPB(state, ctx)
  const especiais = especiaisExtintoresPB(state, ctx)
  const alternarEspecial = e => set({ atestos: { ...atestos, [e.key]: !especialMarcado(atestos, e) } })
  const op = r?.opcao
  return (
    <>
      {/* Resultado: o nível vem da carga de incêndio; o formulário marca a
          linha do nível sozinho (I, II ou III com 3A/40BC). */}
      <BoxPB titulo="Capacidade extintora e caminhamento" item="16">
        {!r ? (
          <span className="text-[12px] text-ink-faint">Classifique a carga de incêndio do projeto para definir o nível (I, II ou III).</span>
        ) : (
          <>
            <div className="g2">
              <div className="fg"><label>Nível da edificação</label><input readOnly value={`Nível ${r.nivel}`}/></div>
              <div className="fg"><label>Capacidade extintora mínima</label><input readOnly value={op ? `${op.A.capacidade} e ${op.B.capacidade}:C` : ''}/></div>
              <div className="fg"><label>Caminhamento máximo — classe A</label><input readOnly value={op?.A?.distanciaMaxima != null ? `${op.A.distanciaMaxima} m` : ''}/></div>
              <div className="fg"><label>Caminhamento máximo — classes B e C</label><input readOnly value={op?.B?.distanciaMaxima != null ? `${op.B.distanciaMaxima} m` : ''}/></div>
            </div>
            {r.nivel === 'III' && (
              <div className="-mx-2.5"><Marcador label="Adotar capacidade extintora mínima de 4A e 80BC (no lugar de 3A e 40BC com distância reduzida)"
                checked={m.extintorNivelIII === 'nivel_III_4A'}
                onChange={() => set({ extintorNivelIII: m.extintorNivelIII === 'nivel_III_4A' ? '' : 'nivel_III_4A' })}/></div>
            )}
          </>
        )}
      </BoxPB>
      <FormSection title="Situações específicas">
        <div className="flex flex-col gap-0.5 -mx-2.5">
          {especiais.map(e => <Marcador key={e.key} label={e.label} checked={especialMarcado(atestos, e)} onChange={() => alternarEspecial(e)}/>)}
        </div>
      </FormSection>
    </>
  )
}

// 17 — o que o formulário pede e a página de hidrantes comum não tem: NSTH
// (reservatório enterrado) e as declarações de bombas e tubulação (o
// manancial é uma das posições do reservatório da página comum). Tipo, vazão/pressão, RTI, reservatório, materiais, bombas,
// lances e tipo de mangueira e os diâmetros das tubulações (Revit) vêm da
// página comum; as declarações de mangueiras, dos componentes do tipo.
// Etapa 1 (classificação): a NSTH, só com reservatório enterrado.
export function CamposHidrantesPB() {
  const { state, m, set } = useCamposPB()
  const h = m.hidrantes || {}
  if (state.hidrantes?.reservatorioPosicao !== 'subterraneo') return null
  return (
    <div className="mt-6">
      <FormSection title="Formulário do CBMPB — item 17" description="Só o que o formulário pede além do dimensionamento acima.">
        <div className="g2">
          <div className="fg"><label>NSTH (reservatório enterrado)</label><input value={h.nsth || ''} onChange={e => set({ hidrantes: { ...h, nsth: e.target.value } })}/></div>
        </div>
      </FormSection>
    </div>
  )
}

// Etapa 3 (bomba de incêndio): as declarações de bombas e tubulação.
export function DeclaracoesHidrantesPB() {
  const { atestos, alternarAtesto } = useCamposPB()
  return (
    <div className="mt-6">
      <FormSection title="Declarações do responsável técnico" description="Item 17 do formulário do Memorial Descritivo do CBMPB.">
        <Atestos titulo="Bombas e tubulação" lista={ATESTOS_BOMBAS_MARCAVEIS} atestos={atestos} alternar={alternarAtesto}/>
      </FormSection>
    </div>
  )
}

// 6 — o RT informa distâncias e dados da via; a linha do formulário é
// decidida por decidirAcessoViaturaPB (estados/PB/acessoViatura.js).
const LINHA_AV = {
  1: 'Sem hidrante de recalque e edificação a até 20 m da via — acesso facultativo.',
  2: 'Recalque a até 20 m e edificação a até 50 m da via — acesso facultativo.',
  3: 'Sem hidrante de recalque e edificação a mais de 20 m da via — acesso obrigatório.',
  4: 'Recalque a até 20 m e edificação a mais de 50 m da via — acesso obrigatório.',
  5: 'Recalque a mais de 20 m e edificação a mais de 50 m da via — acesso obrigatório.',
}
// Pergunta de sim/não com switch (o mesmo SwitchToggle das outras páginas):
// ligado = sim, desligado = não.
function SimNao({ pergunta, valor, onChange }) {
  const sim = valor === true
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px] text-ink-muted">
      <span>{pergunta}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs w-7 text-right ${sim ? 'text-ink font-medium' : 'text-ink-faint'}`}>{sim ? 'Sim' : 'Não'}</span>
        <SwitchToggle checked={sim} onChange={onChange}/>
      </div>
    </div>
  )
}

// Campo numérico como o do MA (AcessoViaturaPage): vazio mostra o valor
// padrão (já vale no cálculo) e, ao sair do campo, valor abaixo do mínimo da
// norma volta para o mínimo.
function NumeroLimitado({ label, value, onChange, padrao, minimo, sufixo = 'm' }) {
  const exibido = value === '' || value == null ? (padrao ?? '') : value
  const aoSair = () => {
    const n = parseFloat(String(value ?? '').replace(',', '.'))
    if (Number.isFinite(n) && minimo != null && n < minimo) onChange(String(minimo))
  }
  return (
    <div className="fg">
      <label>{label}</label>
      <div className="relative">
        <input type="number" step="0.01" min={minimo ?? 0} value={exibido} onChange={e => onChange(e.target.value)} onBlur={aoSair} className={sufixo ? 'pr-8' : ''}/>
        {sufixo && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">{sufixo}</span>}
      </div>
    </div>
  )
}

// Exigência que passa a valer no projeto (azul): título, motivo e a lista
// de itens como no formulário (a, b, c…).
function Exigencia({ titulo, motivo, itens = [], rotuloItens }) {
  return (
    <CaixaInfo titulo={titulo}>
      {motivo && <div className="text-xs text-ink-muted">{motivo}</div>}
      {itens.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rotuloItens && <div className="text-[10px] uppercase tracking-[.06em] text-ink-faint">{rotuloItens}</div>}
          <ol className="m-0 pl-0 list-none flex flex-col gap-1.5">
            {itens.map((t, k) => (
              <li key={k} className="grid grid-cols-[20px_1fr] gap-1 text-xs text-ink-muted leading-[1.5]">
                <span className="font-semibold text-ink">{String.fromCharCode(97 + k)})</span><span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </CaixaInfo>
  )
}

export function CamposAcessoViaturaPB() {
  const { m, set, F } = useCamposPB()
  const { sistemas } = useMedidasObrigatorias()
  if (!F?.ACESSO_VIATURA) return null
  const P = F.ACESSO_VIATURA
  const av = m.acessoViatura || {}
  const setAv = changes => set({ acessoViatura: { ...av, ...changes } })
  // Hidrante de recalque: há sempre que o sistema de hidrantes é exigido.
  const recalque = !!sistemas?.hidrantes?.ativo
  const r = decidirAcessoViaturaPB(av, recalque, P)
  const numero = (key, label, extra = {}) => (
    <NumeroLimitado label={label} value={av[key]} onChange={v => setAv({ [key]: v })} {...extra}/>
  )
  const pergunta = (key, texto) => <SimNao pergunta={texto} valor={av[key]} onChange={v => setAv({ [key]: v })}/>
  return (
    <>
      <FormSection title="Distâncias até a via pública">
        <div className="flex flex-col gap-3">
          <div className="g2">
            {numero('distanciaEdificacao', 'Entrada da circulação comum até a via pública (do meio-fio)', { minimo: 0 })}
            {recalque && numero('distanciaRecalque', 'Registro do hidrante de recalque até a via pública', { minimo: 0 })}
          </div>
          {r?.caso && (
            <div className={`ibox ${r.obrigatorio ? 'amber' : 'green'}`}>
              <span className="text-xs"><strong>Linha {r.caso} do formulário:</strong> {LINHA_AV[r.caso]}</span>
            </div>
          )}
        </div>
      </FormSection>

      {r?.obrigatorio && (
        <FormSection title="Via de acesso">
          <div className="flex flex-col gap-3">
            <div className="g2">
              {numero('larguraVia', `Largura da via (mín. ${fmtNum(P.via.larguraReduzidaMin, 2)} m)`, { padrao: P.via.larguraMin, minimo: P.via.larguraReduzidaMin })}
              {numero('alturaLivre', `Altura livre (mín. ${fmtNum(P.via.alturaLivreMin, 2)} m)`, { padrao: P.via.alturaLivreMin, minimo: P.via.alturaLivreMin })}
              {numero('extensaoVia', 'Comprimento da via em relação à via pública', { minimo: 0 })}
            </div>
            {r.via.reduzida && (
              <Exigencia titulo="Faixa de estacionamento obrigatória" motivo="Compensação da via com largura abaixo de 6,00 m." itens={[
                'largura mínima de 6,00 m;',
                'comprimento mínimo de 15,00 m;',
                'suportar viaturas com peso de 25.000 kgf (245.166,25 N) em toda sua extensão;',
                'desnível máximo de 5%, tanto longitudinal quanto transversal;',
                'ser paralela a uma das faces da edificação que possua aberturas (portas e/ou janelas);',
                'distância máxima de 8 m até a face da edificação, medida a partir de sua borda mais próxima do edifício;',
                'livre de postes, painéis, árvores ou qualquer outro elemento que possa obstruir a operação das viaturas;',
                'adequadamente sinalizada, com placas de "PROIBIDO PARAR E ESTACIONAR".',
              ]}/>
            )}
            {r.via.exigeRetorno && (
              <Exigencia titulo="Área de retorno obrigatória"
                motivo={`Via com menos de ${fmtNum(P.retorno.larguraAbaixoDe, 2)} m de largura e mais de ${fmtNum(P.retorno.comprimentoAcimaDe, 0)} m de comprimento: a área de retorno deve garantir a entrada e a saída das viaturas.`}
                itens={(P.retorno.opcoes || []).map(o => `retorno ${o};`)} rotuloItens="Opções"/>
            )}
            {pergunta('cargaConfirmada', 'A via suporta viaturas de 25.000 kgf em toda a sua extensão?')}
          </div>
        </FormSection>
      )}

      {r?.obrigatorio && (
        <FormSection title="Há portão de acesso?" extra={
          <div className="flex items-center gap-2">
            <span className={`text-xs ${av.temPortao === true ? 'text-ink font-medium' : 'text-ink-faint'}`}>{av.temPortao === true ? 'Sim' : 'Não'}</span>
            <SwitchToggle checked={av.temPortao === true} onChange={v => setAv({ temPortao: v })}/>
          </div>
        }>
          {av.temPortao === true && (
              <div className="g2">
                {numero('portaoLargura', `Largura do portão (mín. ${fmtNum(P.portao.larguraMin, 2)} m)`, { padrao: P.portao.larguraMin, minimo: P.portao.larguraMin })}
                {numero('portaoAltura', `Altura do portão (mín. ${fmtNum(P.portao.alturaMin, 2)} m)`, { padrao: P.portao.alturaMin, minimo: P.portao.alturaMin })}
              </div>
          )}
        </FormSection>
      )}
    </>
  )
}

// 19 — SPDA: exigível ou não conforme o laudo (análise de risco da NBR 5419)
// e, sendo exigível, as características do formulário.
export function CamposSpdaPB() {
  const { m, set } = useCamposPB()
  const sp = m.spda || {}
  const setSp = changes => set({ spda: { ...sp, ...changes } })
  const exigivel = sp.exigivel !== 'nao'
  const eq = sp.equipotencial || []
  return (
    <BoxPB item="19">
      <div className="flex flex-col gap-2">
        <Rotulo>Exigibilidade conforme o laudo</Rotulo>
        <div className="flex gap-2">
          <BotaoOpcao ativo={exigivel} onClick={() => setSp({ exigivel: 'sim' })}>Exigível</BotaoOpcao>
          <BotaoOpcao ativo={!exigivel} onClick={() => setSp({ exigivel: 'nao' })}>Não exigível (conforme análise de risco anexa)</BotaoOpcao>
        </div>
      </div>
      {exigivel && (
        <>
          <div className="g2">
            {SPDA_CAMPOS.map(([key, label]) => (
              <div key={key} className="fg">
                <label>{label.replace(/:$/, '')}</label>
                <input value={sp.campos?.[key] || ''} onChange={e => setSp({ campos: { ...(sp.campos || {}), [key]: e.target.value } })}/>
              </div>
            ))}
          </div>
          <div className="flex flex-col">
            <Rotulo>Seção mínima dos condutores de ligação equipotencial</Rotulo>
            <div className="flex flex-col gap-0.5 -mx-2.5 mt-1.5">
              {SPDA_EQUIPOTENCIAL.map(([key, label]) => (
                <Marcador key={key} label={label} checked={eq.includes(key)}
                  onChange={() => setSp({ equipotencial: eq.includes(key) ? eq.filter(k => k !== key) : [...eq, key] })}/>
              ))}
            </div>
          </div>
        </>
      )}
    </BoxPB>
  )
}
