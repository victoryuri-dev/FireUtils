import LinkNorma from '../../components/ui/LinkNorma'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { calcularAreaMaximaCompartimentacao, caracteristicaElementoCompart } from '../../data/compart_calc'
import { trrfDaEstrutura } from '../../utils/trrfCompart'
import Icon from '../../components/ui/Icon'
import LinhaMarcavel from '../../components/ui/LinhaMarcavel'
import InfoTip from '../../components/ui/InfoTip'
import EstruturaSection from '../../components/ui/EstruturaSection'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import { statusEstrutura, statusPorProgresso } from '../../utils/statusEstrutura'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { fmtUn } from '../../utils/numero'

function Card({ children, className = '' }) {
  return <div className={`bg-surface border border-solid border-border rounded-lg overflow-hidden ${className}`}>{children}</div>
}

function SectionLabel({ children, tip }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-ink-faint uppercase tracking-[.06em] mb-2">
      {children}
      {tip && <InfoTip text={tip}/>}
    </div>
  )
}

// Lista marcável (linhas de components/ui/LinhaMarcavel). Com
// `caracteristicas`, o item marcado ganha o campo da característica do
// elemento (ex.: "alvenaria EI-120"), que vai para o memorial/formulário.
function Checklist({ titulo, tip, opcoes, valores, onToggle, caracteristicas, onCaracteristica }) {
  return (
    <div>
      <SectionLabel tip={tip}>{titulo}</SectionLabel>
      <div className="flex flex-col gap-0.5 -mx-2.5">
        {opcoes.map(o => (
          <LinhaMarcavel key={o.key} label={o.label || o.texto} checked={valores.includes(o.key)} onChange={() => onToggle(o.key)}
            tip={o.texto && o.label ? (o.ref ? `${o.texto} (item ${o.ref})` : o.texto) : null}>
            {caracteristicas && (
              <input value={caracteristicas[o.key] || ''} onChange={e => onCaracteristica(o.key, e.target.value)}
                placeholder="Característica — ex.: alvenaria EI-120" aria-label={`Característica — ${o.label}`}
                className="bg-bg border border-solid border-border rounded-md text-ink text-xs py-1.5 px-2.5 w-full outline-none box-border"/>
            )}
          </LinhaMarcavel>
        ))}
      </div>
    </div>
  )
}

function BadgeVerde({ texto }) {
  return (
    <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full border border-solid text-[11px] font-semibold bg-green-dim border-green-border text-green">
      <Icon name="check" size={12}/> {texto}
    </span>
  )
}

function ObrigatoriedadeBadge({ obrigatorio, isenta, compartimentoUnico }) {
  if (obrigatorio && isenta) return <BadgeVerde texto="Isento por Medida de Proteção Alternativa"/>
  if (obrigatorio && compartimentoUnico) return <BadgeVerde texto="Não exigida — Compartimento Único"/>
  return obrigatorio ? (
    <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full border border-solid text-[11px] font-semibold bg-[rgba(192,21,42,.20)] border-red-border text-red">
      <Icon name="check" size={12}/> Exigida
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full border border-solid text-[11px] font-semibold bg-green-dim border-green-border text-green">
      <Icon name="x" size={12}/> Não exigida
    </span>
  )
}

// Botões de substituição por sistema alternativo (notas de rodapé da
// Tabela 6, NT 01 CBMMA — ver SUBSTITUICOES_COMPARTIMENTACAO). Só aparece
// quando é relevante: a compartimentação já não está conforme, ou uma
// substituição já foi escolhida (pra permitir trocar/remover) — na situação
// comum (conforme, sem isenção) fica escondido, sem disputar atenção com o
// resultado principal.
function SubstituicaoButtons({ opcoes, ativa, onSelecionar, onLimpar }) {
  return (
    <div>
      <SectionLabel tip="Notas de rodapé da tabela de exigências do estado — a nota exata varia por grupo de ocupação e altura; confirme contra a tabela aplicável antes de marcar.">
        Substituir por sistema alternativo
      </SectionLabel>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(o => {
          const selecionada = ativa === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => selecionada ? onLimpar() : onSelecionar(o.key)}
              className={`py-1.5 px-3 rounded-md border border-solid text-[11px] font-semibold cursor-pointer transition-colors ${
                selecionada
                  ? 'bg-green-dim border-green-border text-green'
                  : 'bg-transparent border-border text-ink-muted hover:border-red-border hover:text-red'
              }`}
            >
              {selecionada && <Icon name="check" size={11} className="mr-1"/>}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AreaConsideradaInput({ linha, onChangeArea }) {
  const overrideRaw = linha.overrideAtivo ? linha.area : ''
  return (
    <input
      type="number"
      min="0"
      step="any"
      value={overrideRaw}
      onChange={e => onChangeArea(linha.pavimento.id, e.target.value)}
      placeholder={linha.areaPavimento ? String(linha.areaPavimento) : '0'}
      className="bg-bg border border-solid border-border rounded-md text-ink text-xs py-1.5 px-2 w-[90px] text-right outline-none box-border"
    />
  )
}

function SituacaoCelula({ linha }) {
  if (!linha.area) return <span className="text-ink-faint">Informe a área</span>
  if (linha.excede) return <span className="inline-flex items-center gap-1 text-red"><Icon name="warn" size={12}/> Excede</span>
  return <span className="inline-flex items-center gap-1 text-green"><Icon name="check" size={12}/> Conforme</span>
}

function TabelaAreaMaxima({ resultado, onChangeArea, isenta, sigla }) {
  if (!resultado.tipo) {
    return (
      <div className="ibox amber">
        <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
        <span className="text-xs">Informe a altura da estrutura (Etapa 2 — Edificação) para classificar o tipo de edificação (Anexo B, {sigla}) e verificar a área máxima de compartimentação.</span>
      </div>
    )
  }

  return (
    <>
      <div className="text-xs text-ink-muted mb-3">
        <span className="text-ink-faint">Tipo de edificação (Anexo B) </span>
        <span className="font-semibold text-ink">Tipo {resultado.tipo} — {resultado.tipoNome}</span>
      </div>

      {resultado.linhas.length === 0 ? (
        <div className="text-xs text-ink-faint">Nenhum pavimento com divisão/área classificada ainda.</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-solid border-border">
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Pavimento</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Divisão</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">
                <span className="inline-flex items-center gap-1">
                  Área considerada
                  <InfoTip text={`${sigla}: deve incluir a área de todos os pavimentos e mezaninos interligados com este pavimento — o padrão é a área cadastrada do próprio pavimento, sem interligação.`}/>
                </span>
              </th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Área máxima</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-solid divide-border">
            {resultado.linhas.map(l => (
              <tr key={l.pavimento.id}>
                <td className="py-2 px-3 text-xs text-ink">{l.pavimento.label}</td>
                <td className="py-2 px-3 text-xs text-ink-faint">{l.pavimento.divisao}</td>
                <td className="py-2 px-3 text-xs text-ink-faint">
                  <AreaConsideradaInput linha={l} onChangeArea={onChangeArea}/> m²
                </td>
                <td className="py-2 px-3 text-xs text-ink-faint">
                  {!l.encontrado ? '—' : typeof l.valor === 'number' ? fmtUn(l.valor, 'm²') : l.valor === 'CTD' ? 'CTD (Comissão Técnica)' : 'sem limite'}
                </td>
                <td className="py-2 px-3 text-xs font-semibold"><SituacaoCelula linha={l}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isenta ? (
        resultado.pavimentosExcedentes.length > 0 && (
          <div className="ibox amber mt-3">
            <Icon name="info" size={13} color="var(--color-amber)" className="shrink-0"/>
            <span className="text-xs">
              Tabela informativa: a compartimentação foi substituída por sistema alternativo, então {resultado.pavimentosExcedentes.length === 1 ? 'o pavimento acima' : 'os pavimentos acima'} não precisa{resultado.pavimentosExcedentes.length === 1 ? '' : 'm'} ser subdividido{resultado.pavimentosExcedentes.length === 1 ? '' : 's'}.
            </span>
          </div>
        )
      ) : (
        resultado.pavimentosExcedentes.length > 0 && (
          <div className="ibox red mt-3">
            <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
            <span className="text-xs">
              {resultado.pavimentosExcedentes.length === 1 ? 'Um pavimento excede' : `${resultado.pavimentosExcedentes.length} pavimentos excedem`} a área máxima — subdivida o compartimento ou substitua por sistema alternativo (abaixo).
            </span>
          </div>
        )
      )}
    </>
  )
}


// Box próprio dos elementos de proteção adotados, com a característica de
// cada um (o TRRF automático já vem preenchido); a regra do TRRF fica no
// tooltip do título.
function CardElementos({ trrfEstrutura, trrfMinimo, trrfReducao, ...checklist }) {
  const tip = trrfEstrutura != null
    ? `TRRF da estrutura (segurança estrutural): ${trrfEstrutura} min. Portas, vedadores, registros e dispositivos de enrolar: até ${trrfReducao} min a menos; mínimo de ${trrfMinimo} min para todos.`
    : `TRRF da estrutura ainda não calculado na segurança estrutural — usado o mínimo de ${trrfMinimo} min.`
  return (
    <Card className="mb-3">
      <div className="py-3.5 px-[18px]">
        <Checklist {...checklist} tip={tip}/>
      </div>
    </Card>
  )
}

function EstruturaCompartimentacao({ sentido, est, pavimentos, areaCompartimentacaoHorizontal, compart, trrfEstrutura, obrigH, obrigV, dispatch }) {
  const {
    TABELA_AREA_MAXIMA: tabelaArea, CLASSES_TIPO_EDIFICACAO: classesTipo,
    ELEMENTOS_COMPART_HORIZONTAL, ELEMENTOS_COMPART_VERTICAL,
    SUBSTITUICOES_COMPARTIMENTACAO,
    TRRF_MINIMO_PAREDE_COMPARTIMENTACAO: trrfMinimo, TRRF_REDUCAO_MAXIMA_ABERTURAS: trrfReducao,
  } = compart
  const sigla = compart.NORMA?.sigla || 'norma de compartimentação do estado'
  const horizontal = sentido === 'horizontal'
  // Característica de cada elemento adotado — `h:<key>` / `v:<key>`.
  const caracteristicas = est.caracteristicasCompart || {}
  // Valor mostrado no campo: o informado, ou o TRRF automático do elemento
  // (TRRF da segurança estrutural, mínimo 60 min; aberturas 30 min a menos).
  const caracDe = (prefixo, opcoes) => Object.fromEntries(opcoes.map(o => [o.key, caracteristicaElementoCompart(est, prefixo, o.key, trrfEstrutura, compart)]))
  const setCaracteristica = prefixo => (key, valor) =>
    dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: 'caracteristicasCompart', value: { ...caracteristicas, [`${prefixo}:${key}`]: valor } })
  const resultadoArea = calcularAreaMaximaCompartimentacao(pavimentos, est, tabelaArea, classesTipo, areaCompartimentacaoHorizontal)

  const elementosH = est.elementosCompartHorizontal || []
  const elementosV = est.elementosCompartVertical || []
  const isencaoH = est.isencaoCompartHorizontal || null
  const isencaoV = est.isencaoCompartVertical || null
  // Estes controles pertencem apenas ao cenário em que a compartimentação
  // horizontal continua efetivamente exigida. Se a área cabe em um único
  // compartimento ou uma alternativa já concedeu isenção, os elementos de
  // proteção deixam de aparecer. O seletor de alternativas permanece quando
  // houver uma escolha ativa, permitindo revisar, trocar ou remover a opção.
  const horizontalExigida = obrigH && !isencaoH && !resultadoArea.dentroDoLimite
  const mostrarSubstituicaoH = !!isencaoH || (horizontalExigida && resultadoArea.pavimentosExcedentes.length > 0)
  const precisaElementosH = horizontalExigida
  const precisaElementosV = !isencaoV

  // Só conta o que a norma exige: horizontal (isenção, ou elementos quando há
  // subdivisão a construir) e vertical (isenção ou elementos adotados).
  const resolvidoH = !obrigH || !!isencaoH || resultadoArea.dentroDoLimite || elementosH.length > 0
  const resolvidoV = !obrigV || !!isencaoV || elementosV.length > 0
  // Status só do sentido desta página.
  const exigida = horizontal ? obrigH : obrigV
  const resolvido = horizontal ? resolvidoH : resolvidoV
  const status = !exigida
    ? statusEstrutura('concluido', 'Não exigida')
    : statusPorProgresso(resolvido ? 1 : 0, 1, {
        pendente: 'Configuração pendente', andamento: 'Em andamento', concluido: 'Configurada',
      })

  const toggleArr = (field, atual, key) => {
    const next = atual.includes(key) ? atual.filter(x => x !== key) : [...atual, key]
    dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field, value: next })
  }
  const setObs = (v) => dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: 'obsCompartimentacao', value: v })
  const onChangeArea = (pavimentoId, valor) => dispatch({ type: 'SET_AREA_COMPARTIMENTACAO', pavimentoId, valor })

  // Seleciona uma substituição: grava a escolha na estrutura e liga (nunca
  // desliga) os sistemas correspondentes — clicar numa combinação diferente
  // só soma sistemas, nunca desativa o que já estava ligado por outro motivo.
  const selecionarSubstituicao = (campo, key) => {
    dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: campo, value: key })
    const opcao = SUBSTITUICOES_COMPARTIMENTACAO.find(o => o.key === key)
    opcao?.sistemas.forEach(sistemaKey => {
      dispatch({ type: 'TOGGLE_SISTEMA_ESTRUTURA', estruturaId: est.id, key: sistemaKey, value: true })
    })
  }
  const limparSubstituicao = (campo) => dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: campo, value: null })

  return (
    <EstruturaSection titulo={est.nome} extra={<EstruturaHeaderInfo estrutura={est}/>} status={status} conclusao={!exigida ? null : { estruturaId: est.id, medida: horizontal ? 'compart_horizontal' : 'compart_vertical' }} pendenciasExtras={exigida && !resolvido ? [{ rotulo: horizontal ? 'Elementos de proteção da compartimentação horizontal (ou isenção)' : 'Elementos de proteção da compartimentação vertical (ou isenção)' }] : []} defaultOpen={false}>

      {/* Compartimentação Horizontal */}
      {horizontal && <Card className="mb-3">
        <div className="py-3.5 px-[18px] flex items-center justify-between border-b border-solid border-border">
          <div className="flex items-center gap-2">
            <Icon name={SISTEMA_ICON.compart_horizontal} size={15} color="var(--color-red)"/>
            <span className="text-xs font-bold text-ink">Compartimentação Horizontal</span>
          </div>
          <ObrigatoriedadeBadge obrigatorio={obrigH} isenta={!!isencaoH} compartimentoUnico={resultadoArea.dentroDoLimite}/>
        </div>
        {obrigH ? (
          <div className="py-3.5 px-[18px] flex flex-col gap-4">
            {isencaoH && (
              <div className="ibox green">
                <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
                <span className="text-xs">
                  Isenta da área máxima mediante {SUBSTITUICOES_COMPARTIMENTACAO.find(o => o.key === isencaoH)?.texto.toLowerCase()} — confirme a nota de rodapé aplicável antes de assinar o memorial.
                  {' '}<button type="button" onClick={() => limparSubstituicao('isencaoCompartHorizontal')} className="underline cursor-pointer text-green">Remover</button>
                </span>
              </div>
            )}

            <TabelaAreaMaxima resultado={resultadoArea} onChangeArea={onChangeArea} isenta={!!isencaoH} sigla={sigla}/>

            {mostrarSubstituicaoH && (
              <SubstituicaoButtons
                opcoes={SUBSTITUICOES_COMPARTIMENTACAO}
                ativa={isencaoH}
                onSelecionar={(k) => selecionarSubstituicao('isencaoCompartHorizontal', k)}
                onLimpar={() => limparSubstituicao('isencaoCompartHorizontal')}
              />
            )}

            {!precisaElementosH && !isencaoH && (
              <div className="ibox green">
                <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
                <span className="text-xs">Área dentro do limite do Anexo B — a edificação se enquadra em um único compartimento, sem necessidade de elementos de proteção para subdivisão.</span>
              </div>
            )}

          </div>
        ) : (
          <div className="py-3.5 px-[18px]">
            <div className="ibox green">
              <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
              <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam a compartimentação horizontal, conforme a tabela de exigências do estado.</span>
            </div>
          </div>
        )}
      </Card>}

      {horizontal && horizontalExigida && (
        <CardElementos
          titulo={<>Elementos de proteção adotados <Obrigatorio id={`${est.id}.elementosCompartHorizontal`}/></>}
          opcoes={ELEMENTOS_COMPART_HORIZONTAL}
          valores={elementosH}
          onToggle={(k) => toggleArr('elementosCompartHorizontal', elementosH, k)}
          caracteristicas={caracDe('h', ELEMENTOS_COMPART_HORIZONTAL)}
          onCaracteristica={setCaracteristica('h')}
          trrfEstrutura={trrfEstrutura} trrfMinimo={trrfMinimo} trrfReducao={trrfReducao}
        />
      )}

      {/* Compartimentação Vertical */}
      {!horizontal && <Card className="mb-3">
        <div className="py-3.5 px-[18px] flex items-center justify-between border-b border-solid border-border">
          <div className="flex items-center gap-2">
            <Icon name={SISTEMA_ICON.compart_vertical} size={15} color="var(--color-red)"/>
            <span className="text-xs font-bold text-ink">Compartimentação Vertical</span>
          </div>
          <ObrigatoriedadeBadge obrigatorio={obrigV} isenta={!!isencaoV}/>
        </div>
        {obrigV ? (
          <div className="py-3.5 px-[18px] flex flex-col gap-4">
            {isencaoV && (
              <div className="ibox green">
                <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
                <span className="text-xs">
                  Isenta mediante {SUBSTITUICOES_COMPARTIMENTACAO.find(o => o.key === isencaoV)?.texto.toLowerCase()} — a compartimentação das fachadas e a selagem dos shafts/dutos continuam exigidas. Confirme a nota de rodapé aplicável antes de assinar o memorial.
                  {' '}<button type="button" onClick={() => limparSubstituicao('isencaoCompartVertical')} className="underline cursor-pointer text-green">Remover</button>
                </span>
              </div>
            )}

            <SubstituicaoButtons
              opcoes={SUBSTITUICOES_COMPARTIMENTACAO}
              ativa={isencaoV}
              onSelecionar={(k) => selecionarSubstituicao('isencaoCompartVertical', k)}
              onLimpar={() => limparSubstituicao('isencaoCompartVertical')}
            />

          </div>
        ) : (
          <div className="py-3.5 px-[18px]">
            <div className="ibox green">
              <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
              <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam a compartimentação vertical, conforme a tabela de exigências do estado. Atenção: a inexistência ou quebra da compartimentação vertical soma as áreas dos pavimentos interligados para fins de área máxima de compartimentação horizontal.</span>
            </div>
          </div>
        )}
      </Card>}

      {!horizontal && obrigV && precisaElementosV && (
        <CardElementos
          titulo={<>Elementos de proteção adotados <Obrigatorio id={`${est.id}.elementosCompartVertical`}/></>}
          opcoes={ELEMENTOS_COMPART_VERTICAL}
          valores={elementosV}
          onToggle={(k) => toggleArr('elementosCompartVertical', elementosV, k)}
          caracteristicas={caracDe('v', ELEMENTOS_COMPART_VERTICAL)}
          onCaracteristica={setCaracteristica('v')}
          trrfEstrutura={trrfEstrutura} trrfMinimo={trrfMinimo} trrfReducao={trrfReducao}
        />
      )}

      <Card>
        <div className="py-3.5 px-[18px]">
          <SectionLabel>Observações complementares <Obrigatorio id={`${est.id}.obsCompartimentacao`}/></SectionLabel>
          <textarea
            value={est.obsCompartimentacao || ''}
            onChange={e => setObs(e.target.value)}
            placeholder="Anotações livres sobre isenções, reduções ou justificativas de compartimentação aplicadas a esta estrutura (opcional)."
            className="bg-bg border border-solid border-border rounded-md text-ink text-xs py-2 px-2.5 w-full outline-none box-border min-h-[72px]"
          />
        </div>
      </Card>
    </EstruturaSection>
  )
}

/** Página de uma das compartimentações (`sentido`: 'horizontal' ou
 *  'vertical'), comum a todos os estados — a norma do estado define tabela,
 *  elementos e textos. `extra`: conteúdo do estado no fim da página. */
export default function CompartimentacaoPage({ sentido = 'horizontal', extra = null }) {
  const { state, dispatch } = useProjeto()
  const { compart } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()
  const horizontal = sentido === 'horizontal'
  const sistKey = horizontal ? 'compart_horizontal' : 'compart_vertical'
  const sigla = compart.NORMA?.sigla || 'norma de compartimentação do estado'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        <div className="mb-7">
          <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
            <Icon name={SISTEMA_ICON[sistKey]} size={20} color="var(--color-red)" className="shrink-0"/>
            {horizontal ? 'Compartimentação Horizontal' : 'Compartimentação Vertical'}
          <LinkNorma sistema={sistKey}/>
            <InfoTip side="bottom" align="start" text={<>{horizontal
              ? `Exigibilidade pela tabela de exigências do estado e área máxima de compartimentação (Anexo B, ${sigla}), por estrutura, a partir da ocupação, altura e área de cada pavimento; elementos de proteção adotados e suas características.`
              : `Exigibilidade pela tabela de exigências do estado, substituição por sistema alternativo e elementos de proteção adotados (${sigla}), com suas características, por estrutura.`}</>}/>
          </h2>
        </div>

        {state.estruturas.map(est => {
          const pe = porEstrutura.find(x => x.estrutura.id === est.id)
          return (
            <EstruturaCompartimentacao
              key={est.id}
              sentido={sentido}
              est={est}
              pavimentos={state.pavimentos.filter(p => p.estruturaId === est.id)}
              areaCompartimentacaoHorizontal={state.areaCompartimentacaoHorizontal}
              compart={compart}
              trrfEstrutura={trrfDaEstrutura(state, est)}
              obrigH={!!pe?.sistemas?.compart_horizontal?.obrigatorio}
              obrigV={!!pe?.sistemas?.compart_vertical?.obrigatorio}
              dispatch={dispatch}
            />
          )
        })}

        {extra}
      </div>
    </div>
  )
}
