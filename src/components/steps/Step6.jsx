import Obrigatorio from '../ui/Obrigatorio'
import { useProjeto } from '../../context/ProjetoContext'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import Icon from '../ui/Icon'
import EstruturaSection from '../ui/EstruturaSection'
import EstruturaHeaderInfo from '../ui/EstruturaHeaderInfo'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { riscosEspeciaisDoEstado } from '../../utils/anexoB'
import ExtensaoConfig from '../../estados/ExtensaoConfig'
import { textosDoEstado } from '../../estados/registro'

const SIST_CONFIG = [
  { key:'acesso_viatura',      icon:'viaturaMedida', label:'Acesso de Viatura em Edificacoes'   },
  { key:'seg_estrutural',      icon:'wallFire',    label:'Seg. Estrutural Contra Incendio'    },
  { key:'compart_horizontal',  icon:'compartHorizontalMedida', label:'Compartimentacao Horizontal'        },
  { key:'compart_vertical',    icon:'compartVerticalMedida',   label:'Compartimentacao Vertical'          },
  { key:'controle_acabamento', icon:'controleAcabamentoMedida', label:'Controle de Materiais de Acabamento'},
  { key:'saida_emergencia',    icon:'exit',        label:'Saida de Emergencia'                },
  { key:'gerenciamento_risco', icon:'gerenciamentoRiscoMedida', label:'Gerenciamento de Risco de Incendio' },
  { key:'brigada',             icon:'brigadaMedida', label:'Brigada de Incendio'                },
  { key:'iluminacao',          icon:'iluminacaoMedida', label:'Iluminacao de Emergencia'           },
  { key:'sinalizacao',         icon:'sinalizacaoMedida', label:'Sinalizacao de Emergencia'          },
  { key:'extintores',          icon:'ext',         label:'Protecao por Extintores'            },
  { key:'hidrantes',           icon:'drop',        label:'Hidrantes / Mangotinho'             },
  { key:'alarme',              icon:'alarmeMedida',label:'Alarme de Incendio'                 },
  { key:'deteccao',            icon:'alarmSmoke',  label:'Deteccao de Incendio'               },
  { key:'sprinklers',          icon:'sprinklerMedida', label:'Chuveiros Automaticos'              },
  { key:'controle_fumaca',     icon:'flame',       label:'Controle de Fumaca'                 },
  { key:'central_gas',         icon:'info',        label:'Central de Gas'                     },
  { key:'spda',                icon:'warn',        label:'SPDA'                                },
  { key:'resfriamento',        icon:'drop',        label:'Sistema de Resfriamento'             },
  { key:'espuma',              icon:'spray',       label:'Sistema de Espuma'                   },
  { key:'gases_fixos',         icon:'shieldAlert', label:'Sistema de Gases Fixos'              },
  { key:'fontes_ignicao',      icon:'flame',       label:'Controle de Fontes de Ignicao'       },
  { key:'isolamento_risco',    icon:'area',        label:'Isolamento de Risco'                 },
]

// Projeto "apenas dimensionamento" (ver ProjetoContext.jsx tipoProjeto) só
// dimensiona esses 3 sistemas — os outros nem entram no wizard reduzido
// (Step2/Classificação/Carga de Incêndio ficam mais simples, sem dado
// suficiente pra decidir obrigatoriedade dos demais). sprinklers ainda não
// tem tela de dimensionamento própria (cai no MedidaPage genérico — ver
// App.jsx), mas já fica disponível como sistema, igual no modo completo.
const SIST_CONFIG_DIMENSIONAMENTO = [
  { key:'saida_emergencia', icon:'exit', label:'Saida de Emergencia'      },
  { key:'hidrantes',        icon:'drop', label:'Hidrantes / Mangotinho'   },
  { key:'sprinklers',       icon:'sprinklerMedida',label:'Chuveiros Automaticos'    },
]

// Ícone de cada risco especial — a lista em si (chaves e rótulos) vem de
// riscosEspeciaisDoEstado(uf) (utils/anexoB.js), que muda por estado (a PB
// tem riscos que o Anexo B do MA não tem).
const ICONE_RISCO = {
  liquidos_inflamaveis: 'flame', fogos_artificio: 'warn', glp: 'drop',
  vasos_pressao: 'settings', produtos_perigosos: 'warn', outros: 'info',
  tendas_inflamaveis: 'flame', geradores_eletricos: 'settings',
  estrutura_montada: 'settings', sistemas_eletricos_montados: 'settings',
}

const RISCOS_DEFAULT = {
  liquidos_inflamaveis: false, fogos_artificio: false, glp: false,
  vasos_pressao: false, produtos_perigosos: false, outros: false,
}

const blockTitle = 'text-[11px] font-medium text-ink-faint uppercase tracking-[.08em] mb-3 pb-2 border-b border-solid border-border'

// ── Card com dados de uma estrutura usados na dosagem das medidas ───────
function EstruturaResumo({ pe }) {
  const { classificacao, gruposFaltantes } = pe
  const { subsidiarias } = classificacao

  return (
    <div className="border border-solid border-border rounded-lg p-4 mb-3">
      {subsidiarias.length > 0 && (
        <div className="mb-1">
          <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1">
            {subsidiarias.length === 1 ? 'Ocupacao secundaria' : 'Ocupacoes secundarias'}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {subsidiarias.map(d => (
              <span key={d} className="py-[3px] px-2.5 rounded font-semibold text-xs tabular-nums bg-surface border border-solid border-border text-ink-muted">{d}</span>
            ))}
          </div>
        </div>
      )}

      {gruposFaltantes.length > 0 && (
        <div className="ibox amber mt-2 mb-0">
          <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/>
          <span>
            Dados normativos completos (processo normal) ainda nao cadastrados nesta versao para o(s) grupo(s) <strong>{gruposFaltantes.join(', ')}</strong> nesta estrutura.
            Exigencias minimas de referencia foram aplicadas — confirme manualmente com o CBMMA.
          </span>
        </div>
      )}
    </div>
  )
}

// ── Grid de medidas de seguranca de uma estrutura ───────────────────────
// Obrigatorio nao trava mais o clique: o usuario pode desativar por conta e
// risco proprios (ex.: medida compensatoria, dispensa em analise) — o card
// so muda de "vermelho solido" pra "vermelho contorno" (continua sinalizando
// que a norma exige), nunca vira verde/neutro como um opcional.
function MedidasGrid({ pe, dispatch, sistConfig }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(max(170px, calc((100% - 24px) / 4)), 1fr))' }}
    >
      {sistConfig.map(s => {
        const sist = pe.sistemas[s.key] || { obrigatorio: false, ativo: false }
        const on    = sist.ativo
        const obrig = sist.obrigatorio

        const toneClass = obrig
          ? (on ? 'step6-measure-required-active border-solid border-red-border bg-red-dim' : 'border-solid border-red-border bg-transparent')
          : (on ? 'border-solid border-green-border bg-green-dim' : 'border-solid border-border bg-transparent')
        // O estado aparece so na cor do simbolo (sem caixa, fundo nem texto de status):
        // Obrigatorias permanecem vermelhas mesmo quando desativadas, acompanhando
        // a borda que sinaliza a exigencia normativa. Opcionais desligadas ficam cinza.
        // Cor via prop, pois os simbolos proprios do Icon fixam a cor inline.
        const iconColor = obrig ? 'var(--color-red)' : (on ? 'var(--color-green)' : 'var(--color-ink-hint)')
        const labelClass = on || obrig ? 'text-ink' : 'text-ink-muted'
        const alternar = () => dispatch({ type:'TOGGLE_SISTEMA_ESTRUTURA', estruturaId: pe.estrutura.id, key:s.key })

        return (
          <div key={s.key}
            onClick={alternar}
            role="switch"
            aria-checked={on}
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar() } }}
            title={on ? 'Habilitada' : 'Desabilitada'}
            className={`group border-[1.5px] rounded-md p-3.5 flex items-center relative transition-[border-color,background-color,transform,box-shadow] duration-150 cursor-pointer motion-safe:hover:-translate-y-[2px] hover:shadow-[0_10px_22px_rgba(0,0,0,.3)] ${toneClass}`}>
            {/* Simbolo + nome, alinhados */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon name={SISTEMA_ICON[s.key] || s.icon} size={26} color={iconColor} className="shrink-0"/>
              <div className={`min-w-0 [overflow-wrap:anywhere] text-xs font-medium leading-[1.3] ${labelClass}`}>
                {s.label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Motivo da isenção de sistemas obrigatórios desativados manualmente ──
// So aparece pros sistemas que o PROPRIO USUARIO desligou no toggle acima
// (state.sistemasPorEstrutura[estId][key] === false) — nao pros casos em
// que `ativo` fica false por outra logica automatica (ex.: isencao de
// compartimentacao por substituicao/compartimento unico, decidida na
// propria tela de Compartimentacao, nao aqui). Texto livre, sem validacao:
// so registra o motivo no projeto pra constar.
function MotivosIsencao({ pe, state, dispatch, sistConfig }) {
  const estId = pe.estrutura.id
  const manuais = state.sistemasPorEstrutura[estId] || {}
  const motivos = state.motivosIsencaoPorEstrutura[estId] || {}
  const semMotivo = state.semMotivoIsencaoPorEstrutura?.[estId] || {}
  const desativados = sistConfig.filter(s => pe.sistemas[s.key]?.obrigatorio && manuais[s.key] === false)

  if (desativados.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-md border border-solid border-border bg-surface p-4 mb-4">
      <div className="flex items-start gap-2.5">
        <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0 mt-0.5"/>
        <span className="text-xs text-amber leading-[1.6]">
          Sistema(s) obrigatório(s) desativado(s) manualmente nesta estrutura — se quiser, descreva o motivo da isenção, sob responsabilidade do RT.
        </span>
      </div>
      <div className="flex flex-col gap-2.5 pl-6">
        {desativados.map(s => (
          <div key={s.key} className="fg mb-0">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[11px]">Motivo da isenção — {s.label} {!semMotivo[s.key] && <Obrigatorio id={`${estId}.isencao.${s.key}`}/>}</label>
              <button
                type="button"
                role="switch"
                aria-checked={!semMotivo[s.key]}
                onClick={() => dispatch({ type:'SET_SEM_MOTIVO_ISENCAO', estruturaId: estId, key:s.key, value: !semMotivo[s.key] })}
                className="inline-flex items-center gap-2 shrink-0 text-[11px] text-ink-muted"
                title="Desligado: a isenção fica sem justificativa — o memorial não mostra seção de isenção nem marca na tabela de medidas."
              >
                Prestar justificativa
                <span className={`relative w-8 h-[18px] rounded-full transition-colors ${!semMotivo[s.key] ? 'bg-red' : 'bg-border'}`}>
                  <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${!semMotivo[s.key] ? 'translate-x-[14px]' : ''}`}/>
                </span>
              </button>
            </div>
            {!semMotivo[s.key] && (
              <textarea
                rows={2}
                value={motivos[s.key] || ''}
                onChange={e => dispatch({ type:'SET_MOTIVO_ISENCAO_SISTEMA', estruturaId: estId, key:s.key, value:e.target.value })}
                placeholder="Ex: medida compensatoria adotada, dispensa em analise junto ao CBMMA..."
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Grid de riscos especiais de uma estrutura ───────────────────────────
function RiscosGrid({ uf, estruturaId, riscos, outrosDesc, dispatch }) {
  return (
    <>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(max(170px, calc((100% - 24px) / 4)), 1fr))' }}
      >
        {riscosEspeciaisDoEstado(uf).map(r => {
          const on = !!riscos[r.key]
          const alternar = () => dispatch({ type:'TOGGLE_RISCO_ESTRUTURA', estruturaId, key:r.key })
          // Mesmo desenho das medidas: o estado esta na cor do proprio simbolo
          // (ligado = vermelho, desligado = cinza), sem caixa nem marcador.
          return (
            <div key={r.key}
              role="switch"
              aria-checked={on}
              tabIndex={0}
              onClick={alternar}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar() } }}
              className={`border border-solid rounded-md p-3.5 flex items-center gap-2.5 cursor-pointer transition-[border-color,background-color] duration-150 ${on ? 'border-red-border bg-red-dim' : 'border-border bg-transparent'}`}>
              <Icon name={ICONE_RISCO[r.key] || 'warn'} size={26} color={on ? 'var(--color-red)' : 'var(--color-ink-hint)'} className="shrink-0"/>
              <div className={`min-w-0 [overflow-wrap:anywhere] text-xs font-medium leading-[1.3] ${on ? 'text-ink' : 'text-ink-muted'}`}>{r.label}</div>
            </div>
          )
        })}
      </div>
      {riscos.outros && (
        <div className="fg mt-3">
          <label>Descreva o risco especial <Obrigatorio id={`${estruturaId}.riscoOutros`}/></label>
          <input value={outrosDesc} onChange={e => dispatch({ type:'SET_RISCO_OUTROS_DESC', estruturaId, value:e.target.value })}/>
        </div>
      )}
    </>
  )
}

export default function Step6({ step, totalSteps }) {
  const { state, dispatch } = useProjeto()
  const { porEstrutura } = useMedidasObrigatorias()
  const dimensionamento = state.tipoProjeto === 'dimensionamento'
  const sistConfig = dimensionamento ? SIST_CONFIG_DIMENSIONAMENTO : SIST_CONFIG

  return (
    <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">
      <div className="mb-[26px]">
        <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]">Etapa {step} de {totalSteps}</div>
        <h2 className="text-[22px] font-semibold text-ink mb-[5px]">Medidas de Seguranca contra Incendio</h2>
        <p className="text-[13px] text-ink-faint leading-[1.6]">Sistemas e riscos especiais identificados por estrutura, com base na area construida, altura e ocupacao de cada uma. Obrigatorios podem ser desativados manualmente, mas continuam sinalizados em vermelho.</p>
      </div>

      {/* Legenda: o estado esta na cor do simbolo de cada medida */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5 text-[11px] text-ink-faint">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-red"/>
          Obrigatória (exigida pela norma)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-green"/>
          Opcional
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-ink-hint"/>
          Desabilitada
        </div>
      </div>

      {porEstrutura.map(pe => {
        const est = pe.estrutura
        const riscos = state.riscosEspeciaisPorEstrutura[est.id] || RISCOS_DEFAULT
        const outrosDesc = state.riscosOutrosDescPorEstrutura[est.id] || ''

        return (
          <EstruturaSection key={est.id} titulo={est.nome} extra={<EstruturaHeaderInfo estrutura={est}/>}>
            {(pe.classificacao.subsidiarias.length > 0 || pe.gruposFaltantes.length > 0) && (
              <div className="mb-4">
                <div className={blockTitle}>Dados usados na dosagem</div>
                <EstruturaResumo pe={pe}/>
              </div>
            )}

            <div className="mb-6">
              <MedidasGrid pe={pe} dispatch={dispatch} sistConfig={sistConfig}/>
            </div>

            <MotivosIsencao pe={pe} state={state} dispatch={dispatch} sistConfig={sistConfig}/>

            {/* Riscos especiais alimentam o Anexo B (NT 01) — sem sentido
                num projeto "apenas dimensionamento", que nem gera esse
                documento (ver DocumentosPage.jsx). */}
            {!dimensionamento && (
              <div>
                <div className={blockTitle}>Riscos especiais</div>
                <p className="text-[13px] text-ink-faint leading-[1.6] mb-3">Marque os riscos especiais presentes nesta estrutura ou area de risco, {textosDoEstado(state.uf).referenciaRiscosEspeciais}</p>
                <RiscosGrid uf={state.uf} estruturaId={est.id} riscos={riscos} outrosDesc={outrosDesc} dispatch={dispatch}/>
              </div>
            )}
          </EstruturaSection>
        )
      })}

      {!dimensionamento && <ExtensaoConfig ponto="riscos"/>}
    </div>
  )
}
