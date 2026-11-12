import LinkNorma from '../../components/ui/LinkNorma'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { calcularTRRF, alturaEdificacaoBase, edificacaoEhTerrea, refsNormaTRRF } from '../../data/trrf_calc'
import Icon from '../../components/ui/Icon'
import InfoTip from '../../components/ui/InfoTip'
import EstruturaSection from '../../components/ui/EstruturaSection'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import { statusEstrutura } from '../../utils/statusEstrutura'
import { fmtNum } from '../../utils/numero'

function Card({ children, className = '' }) {
  return <div className={`bg-surface border border-solid border-border rounded-lg overflow-hidden ${className}`}>{children}</div>
}

function LinhaPavimento({ linha }) {
  const { pavimento: p, classe, valor, referencia } = linha
  return (
    <tr>
      <td className="py-2 px-3 text-xs text-ink">{p.label}</td>
      <td className="py-2 px-3 text-xs text-ink-faint capitalize">{linha.posicao}</td>
      <td className="py-2 px-3 text-xs text-ink-faint">{p.divisao || '—'}</td>
      <td className="py-2 px-3 text-xs text-ink-faint">{classe || '—'}</td>
      <td className="py-2 px-3 text-xs font-semibold">
        {typeof valor === 'number' ? (
          <span className="text-ink">{valor} min</span>
        ) : referencia ? (
          <span className="text-amber">Ver item {referencia}</span>
        ) : !classe ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="text-amber">Não enquadrado</span>
        )}
      </td>
    </tr>
  )
}

function EstruturaTRRF({ est, pavimentos, tabela, classesAltura, classesSubsolo, divisoesSemOcupacao, dispatch, exigido, refs }) {
  const sub = parseInt(est.nSubsolos) || 0
  const resultado = calcularTRRF(pavimentos, est, tabela, classesAltura, classesSubsolo, divisoesSemOcupacao)

  const setObs = (v) => dispatch({ type:'SET_ESTRUTURA_FIELD', id: est.id, field:'obsSegEstrutural', value: v })

  const status = !exigido
    ? statusEstrutura('concluido', 'Não exigida')
    : !resultado.classeAltura ? statusEstrutura('pendente', 'Dados pendentes')
    : sub > 0 && !est.profundidadeSubsolo ? statusEstrutura('andamento', 'Em andamento')
    : resultado.pendenciasNaoRegressao.length > 0 ? statusEstrutura('atencao', 'Revisar TRRF')
    : resultado.avisos.length > 0 ? statusEstrutura('andamento', `Consultar ${refs.orgaoAnalise}`)
    : statusEstrutura('concluido', 'TRRF definido')

  return (
    <EstruturaSection titulo={est.nome} extra={<EstruturaHeaderInfo estrutura={est} semArea/>} status={status} conclusao={exigido ? { estruturaId: est.id, medida: 'seguranca_estrutural' } : null} defaultOpen={false}>
      {!exigido ? (
        <div className="ibox green">
          <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
          <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam a segurança estrutural contra incêndio, conforme a tabela de exigências do estado.</span>
        </div>
      ) : (
      <>
      <Card className="mb-3">
        <div className="py-3.5 px-[18px] grid grid-cols-2 gap-3.5">
          <div>
            <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1">Altura piso a piso (piso de descarga ao último pavimento)</div>
            <div className="text-xs text-ink font-semibold">
              {resultado.alturaEfetiva === '' || resultado.alturaEfetiva == null
                ? '—'
                : `${fmtNum(alturaEdificacaoBase(est))} m${edificacaoEhTerrea(est) ? ' (Edificação Térrea)' : ''}`} {resultado.classeAltura ? `— Classe ${resultado.classeAltura}` : ''}
            </div>
            {resultado.subsoloSomado && (
              <div className="text-[10px] text-amber mt-1">
                + {fmtNum(est.profundidadeSubsolo, 2, est.profundidadeSubsolo)} m de subsolo ocupado = {fmtNum(resultado.alturaEfetiva, 2, resultado.alturaEfetiva)} m para a classificação{refs.terminologia}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1">Profundidade do subsolo</div>
            <div className="text-xs text-ink font-semibold">
              {sub === 0 ? 'Sem subsolo' : est.profundidadeSubsolo ? `${fmtNum(est.profundidadeSubsolo, 2, est.profundidadeSubsolo)} m — Classe ${resultado.classeSubsolo || '—'}` : (
                <span className="text-amber">Informe a profundidade na Etapa 2 (Edificação)</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {!resultado.classeAltura && (
        <div className="ibox amber mb-3">
          <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
          <span className="text-xs">Altura piso a piso ainda não informada ou fora da faixa coberta pelo Anexo B (acima de 250 m) — classe de altura não pôde ser determinada.</span>
        </div>
      )}

      <Card className="mb-3">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-solid border-border">
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Pavimento</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Posição</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Divisão</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">Classe</th>
              <th className="py-2 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em]">TRRF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-solid divide-border">
            {resultado.linhas.map(l => <LinhaPavimento key={l.pavimento.id} linha={l}/>)}
          </tbody>
        </table>
      </Card>

      {resultado.pendenciasNaoRegressao.map((pend, i) => (
        <div key={i} className="ibox red mb-3">
          <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
          <span className="text-xs">
            ATENÇÃO: o TRRF de <strong>{pend.pavimentoInferior.label}</strong> ({pend.trrfInferior} min) é inferior ao TRRF de <strong>{pend.pavimentoSuperior.label}</strong>, imediatamente acima ({pend.trrfSuperior} min). Conforme {refs.naoRegressao}, essa elevação depende de avaliação de risco de colapso progressivo pelo responsável técnico — não é aplicada automaticamente. Confirme o julgamento antes de assinar o memorial.
          </span>
        </div>
      ))}

      {resultado.avisos.length > 0 && (
        <div className="ibox amber mb-3">
          <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
          <span className="text-xs">
            {resultado.avisos.length === 1 ? 'Um pavimento não teve' : `${resultado.avisos.length} pavimentos não tiveram`} o TRRF determinado diretamente pela tabela do Anexo B (combinação não enquadrada ou item específico do Anexo A) — consulte o {refs.orgaoAnalise} antes de finalizar.
          </span>
        </div>
      )}

      <Card>
        <div className="py-3.5 px-[18px]">
          <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">Observações complementares <Obrigatorio id={`${est.id}.obsSegEstrutural`}/></div>
          <textarea
            value={est.obsSegEstrutural || ''}
            onChange={e => setObs(e.target.value)}
            placeholder="Anotações livres sobre isenções, reduções ou justificativas aplicadas a esta estrutura (opcional)."
            className="bg-bg border border-solid border-border rounded-md text-ink text-xs py-2 px-2.5 w-full outline-none box-border min-h-[72px]"
          />
        </div>
      </Card>
      </>
      )}
    </EstruturaSection>
  )
}

export default function SegurancaEstruturalPage() {
  const { state, dispatch } = useProjeto()
  const { trrf } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()
  const { TABELA_TRRF, CLASSES_ALTURA, CLASSES_SUBSOLO, DIVISOES_SEM_OCUPACAO_SUBSOLO } = trrf

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        <div className="mb-7">
          <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
            <Icon name={SISTEMA_ICON.seg_estrutural} size={20} color="var(--color-red)" className="shrink-0"/>
            Segurança Estrutural Contra Incêndio
          <LinkNorma sistema="seg_estrutural"/>
            <InfoTip side="bottom" align="start" text={<>Estabelece as condições a serem atendidas pelos elementos estruturais e de compartimentação que integram as edificações, quanto aos Tempos Requeridos de Resistência ao Fogo (TRRF) para que, em situação de incêndio, seja evitado o colapso estrutural por tempo suficiente para possibilitar a saída segura das pessoas e o acesso para as operações do Corpo de Bombeiros Militar.</>}/>
          </h2>
        </div>

        {state.estruturas.map(est => {
          const pe = porEstrutura.find(p => p.estrutura.id === est.id)
          return (
            <EstruturaTRRF
              refs={refsNormaTRRF(trrf)}
              key={est.id}
              est={est}
              pavimentos={state.pavimentos.filter(p => p.estruturaId === est.id)}
              tabela={TABELA_TRRF}
              classesAltura={CLASSES_ALTURA}
              classesSubsolo={CLASSES_SUBSOLO}
              divisoesSemOcupacao={DIVISOES_SEM_OCUPACAO_SUBSOLO}
              dispatch={dispatch}
              exigido={!!pe?.sistemas?.seg_estrutural?.ativo}
            />
          )
        })}
      </div>
    </div>
  )
}
import Obrigatorio from '../../components/ui/Obrigatorio'
