import LinkNorma from '../../components/ui/LinkNorma'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { useEffect, useState } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { divisoesDaEstrutura } from '../../utils/classificacao'
import { montarLinhas, classeResolvida, ORDEM_CLASSE, NORMAS_ENSAIO_POR_ELEMENTO, parseNormasEnsaio, classesExigidasEstrutura, formatarClasses, ELEMENTOS_TABELA_B1 } from '../../data/cmar_calc'
import { MATERIAIS_INCOMBUSTIVEIS, buscarMaterialIncombustivel, CLASSE_INCOMBUSTIVEL, MATERIAIS_ENSAIADOS, buscarMaterialEnsaiado } from '../../data/materiaisAcabamento'
import Icon from '../../components/ui/Icon'
import InfoTip from '../../components/ui/InfoTip'
import EstruturaSection from '../../components/ui/EstruturaSection'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import InlineEditableNome from '../../components/ui/InlineEditableNome'
import { statusEstrutura, statusPorProgresso } from '../../utils/statusEstrutura'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import ObservacoesComplementares from '../../components/ui/ObservacoesComplementares'

// Descrição oficial da divisão (ex.: "A-3" -> "Habitação coletiva") — OCUPACOES
// é indexado pela letra do grupo, com as divisões aninhadas em `.divisoes`
// (mesma resolução usada em descricaoDivisao, MemorialDescritivoPage.jsx).
// Usada só pra sugerir o nome inicial de um ambiente semeado automaticamente
// (ver useEffect de semeadura em ControleAcabamentoPage) — depois disso o
// nome é 100% editável pelo usuário.
function descricaoDivisao(ocupacoes, divisao) {
  return ocupacoes?.[divisao.charAt(0)]?.divisoes?.[divisao] || ''
}

const th = 'py-3 px-3 text-left text-[10px] text-ink-faint uppercase tracking-[.06em] align-middle'
const td = 'py-3 px-3 text-xs align-middle'
const input = 'bg-bg border border-solid border-border rounded-md text-ink text-[11px] py-2 px-2.5 min-h-9 w-full outline-none box-border'

// Textos padronizados — a mesma frase em todo lugar que fala do mesmo
// estado da linha (select, texto de apoio na tela e memorial), em vez de
// cada ponto descrever a mesma coisa com palavras diferentes.
const TXT_NAO_POSSUI = 'Não possui este elemento'
const TXT_INCOMBUSTIVEL_MOTIVO = 'N/A — material incombustível'

// Uma linha (elemento construtivo de um ambiente) do Quadro Resumo de
// Controle de Materiais de Acabamento. O material incombustível e o
// material do catálogo de ensaiados resolvem a classe sozinhos (itens 6/7
// das instruções normativas); qualquer outro material só é aceito com
// fabricante e nº do laudo preenchidos (nunca presumir classe).
function LinhaAcabamento({ estruturaId, linha, dispatch }) {
  const { elemento, elementoLabel, item } = linha
  const manual = item?.origem === 'manual'
  const ensaiado = item?.origem === 'ensaiado'
  const incombustivel = item?.origem === 'incombustivel'
  const naoPossui = item?.origem === 'nao_possui'
  const semMaterial = !item?.origem
  const [editando, setEditando] = useState(manual && !(item.classeAdotada && item.fabricante && item.laudoNumero))
  const materiaisEnsaiadosDoElemento = MATERIAIS_ENSAIADOS[elemento] || []
  const normasDisponiveis = NORMAS_ENSAIO_POR_ELEMENTO[elemento] || []

  const set = (changes) => dispatch({ type: 'SET_ACABAMENTO', estruturaId, chave: linha.chave, changes })

  // Lista pré-marcável por elemento (item 9 das instruções) — o que não
  // está na lista de referência (ex.: uma norma de sistema especial) fica
  // no campo livre abaixo, preservado junto com o que for marcado/
  // desmarcado nos checkboxes.
  const normasAtuais = parseNormasEnsaio(item?.normasEnsaio)
  const normasMarcadas = normasAtuais.filter(n => normasDisponiveis.includes(n))
  const normaExtra = normasAtuais.filter(n => !normasDisponiveis.includes(n)).join(', ')
  const [normaExtraAberta, setNormaExtraAberta] = useState(false)
  const mostrarNormaExtra = normaExtraAberta || Boolean(normaExtra)

  const toggleNorma = (norma) => {
    const novas = normasMarcadas.includes(norma)
      ? normasAtuais.filter(n => n !== norma)
      : [...normasAtuais, norma]
    set({ normasEnsaio: novas.join(', ') })
  }

  const setNormaExtra = (texto) => {
    set({ normasEnsaio: [...normasMarcadas, ...parseNormasEnsaio(texto)].join(', ') })
  }

  const toggleNormaExtra = () => {
    if (mostrarNormaExtra) {
      setNormaExtra('')
      setNormaExtraAberta(false)
    } else {
      setNormaExtraAberta(true)
    }
  }

  const handleMaterial = (e) => {
    const val = e.target.value
    if (val === '') { set({ origem: '', materialId: '', materialNome: '', classeAdotada: '', fabricante: '', laudoNumero: '', laudoValidade: '' }); setEditando(false); return }
    if (val === 'nao_possui') { set({ origem: 'nao_possui', materialId: '', materialNome: '', classeAdotada: '', fabricante: '', laudoNumero: '', laudoValidade: '', normasEnsaio: '' }); setEditando(false); return }
    if (val === 'manual') { set({ origem: 'manual', materialId: '', materialNome: '', classeAdotada: '', fabricante: '', laudoNumero: '', laudoValidade: '' }); setEditando(true); return }
    if (val.startsWith('ensaiado:')) {
      const mat = buscarMaterialEnsaiado(elemento, val.slice('ensaiado:'.length))
      set({ origem: 'ensaiado', materialId: mat?.id || '', materialNome: mat?.nome || '', classeAdotada: mat?.classe || '', fabricante: '', laudoNumero: '', laudoValidade: '' })
      setEditando(false)
      return
    }
    const mat = buscarMaterialIncombustivel(val)
    set({ origem: 'incombustivel', materialId: val, materialNome: mat?.nome || '', classeAdotada: CLASSE_INCOMBUSTIVEL, fabricante: '', laudoNumero: '', laudoValidade: '', normasEnsaio: '' })
    setEditando(false)
  }

  const classeMostrada = naoPossui ? 'N/A' : incombustivel ? CLASSE_INCOMBUSTIVEL : (ensaiado || manual ? item.classeAdotada : '')

  return (
    <>
      <tr className={`${manual && editando ? 'border-b-0' : 'border-b border-solid border-border'} last:border-b-0`}>
        <td className={`${td} text-ink leading-[1.4]`}>{elementoLabel}</td>
        <td className={td}>
          <select
            value={manual ? 'manual' : ensaiado ? `ensaiado:${item.materialId}` : naoPossui ? 'nao_possui' : (item?.materialId || '')}
            onChange={handleMaterial}
            className={input}
          >
            <option value="">Selecionar material…</option>
            <option value="nao_possui">{TXT_NAO_POSSUI}</option>
            <optgroup label="Incombustíveis (Classe I automática)">
              {MATERIAIS_INCOMBUSTIVEIS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </optgroup>
            {materiaisEnsaiadosDoElemento.length > 0 && (
              <optgroup label="Materiais ensaiados (catálogo)">
                {materiaisEnsaiadosDoElemento.map(m => (
                  <option key={m.id} value={`ensaiado:${m.id}`}>{m.nome} — Classe {m.classe}</option>
                ))}
              </optgroup>
            )}
            <option value="manual">Outro material (informar / anexar laudo)</option>
          </select>
          {manual && (
            <button type="button" onClick={() => setEditando(o => !o)} className="text-[10px] text-ink-faint underline mt-1 cursor-pointer">
              {editando ? 'ocultar dados do laudo' : (item.materialNome || 'editar dados do laudo')}
            </button>
          )}
        </td>
        <td className={`${td} text-ink text-center whitespace-nowrap`}>{classeMostrada || '—'}</td>
        <td className={td}>
          {naoPossui ? (
            <span className="text-ink-faint">N/A — {TXT_NAO_POSSUI.toLowerCase()}</span>
          ) : incombustivel ? (
            <span className="text-ink-faint">{TXT_INCOMBUSTIVEL_MOTIVO}</span>
          ) : semMaterial ? (
            <span className="text-ink-faint">Selecione um material</span>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {normasDisponiveis.map(norma => (
                  <label key={norma} className="flex items-center gap-1.5 text-[11px] text-ink-muted whitespace-nowrap cursor-pointer">
                    <input className="size-4 shrink-0 accent-[var(--color-blue)] cursor-pointer" type="checkbox" checked={normasMarcadas.includes(norma)} onChange={() => toggleNorma(norma)}/>
                    {norma}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-[11px] text-ink-muted whitespace-nowrap cursor-pointer">
                  <input className="size-4 shrink-0 accent-[var(--color-blue)] cursor-pointer" type="checkbox" checked={mostrarNormaExtra} onChange={toggleNormaExtra}/>
                  Outra norma
                </label>
              </div>
              {mostrarNormaExtra && (
                <input
                  autoFocus={normaExtraAberta && !normaExtra}
                  aria-label="Outra norma de ensaio"
                  placeholder="Informe a norma…"
                  value={normaExtra}
                  onChange={e => setNormaExtra(e.target.value)}
                  className={`${input} mt-2`}
                />
              )}
            </>
          )}
        </td>
      </tr>
      {manual && editando && (
        <tr className="border-b border-solid border-border last:border-b-0">
          <td colSpan={4} className="py-4 px-3 bg-surface">
            <div className="grid grid-cols-4 gap-2.5">
              <label className="fg text-[11px] text-ink-muted leading-[1.4]"><span className="inline-flex items-center gap-0.5">Nome do material <Obrigatorio id={`${estruturaId}.${linha.chave}.materialNome`}/></span><input placeholder="Nome do material" value={item.materialNome} onChange={e => set({ materialNome: e.target.value })} className={input}/></label>
              <label className="fg text-[11px] text-ink-muted leading-[1.4]"><span className="inline-flex items-center gap-0.5">Classe <Obrigatorio id={`${estruturaId}.${linha.chave}.classeAdotada`}/></span><select value={item.classeAdotada} onChange={e => set({ classeAdotada: e.target.value })} className={input}>
                <option value="">Classe (aguardando laudo)</option>
                {ORDEM_CLASSE.map(c => <option key={c} value={c}>{c}</option>)}
              </select></label>
              <label className="fg text-[11px] text-ink-muted leading-[1.4]"><span className="inline-flex items-center gap-0.5">Fabricante / modelo <Obrigatorio id={`${estruturaId}.${linha.chave}.fabricante`}/></span><input placeholder="Fabricante / modelo" value={item.fabricante} onChange={e => set({ fabricante: e.target.value })} className={input}/></label>
              <label className="fg text-[11px] text-ink-muted leading-[1.4]"><span className="inline-flex items-center gap-0.5">Nº do laudo / ensaio <Obrigatorio id={`${estruturaId}.${linha.chave}.laudoNumero`}/></span><input placeholder="Nº do laudo / ensaio" value={item.laudoNumero} onChange={e => set({ laudoNumero: e.target.value })} className={input}/></label>
            </div>
            <div className="text-[10px] text-ink-faint mt-1.5 leading-[1.5]">
              A classe só é considerada comprovada com fabricante/modelo e nº do laudo preenchidos — conforme a NT 10/2021 CBMMA, a classe de reação ao fogo não pode ser presumida sem documentação técnica do produto.
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Caixa "Edificação/Ambiente" — retrátil, nome 100% editável (clique no
// nome ou no lápis) e removível pelo usuário. Mesmo estilo-base dos cards
// de ambiente de Extintores/Saída de Emergência (AmbienteCard,
// ExtintoresPage.jsx e InlineEditableNome, compartilhado entre os dois) —
// só cor e formatação reaproveitadas daqui, sem o arrastar-e-soltar deles.
function TabelaAcabamento({ ambiente, linhas, estruturaId, dispatch }) {
  const [aberto, setAberto] = useState(true)
  const renomear = (nome) => dispatch({ type: 'RENAME_AMBIENTE_ACABAMENTO', id: ambiente.id, nome })
  const remover = (e) => {
    e.stopPropagation()
    dispatch({ type: 'REMOVE_AMBIENTE_ACABAMENTO', id: ambiente.id })
  }

  return (
    <div className="group rounded-lg border border-solid border-border bg-surface hover:border-ink-hint transition-colors mb-3">
      <div
        className={`flex items-center justify-between gap-4 py-3 px-3.5 cursor-pointer select-none bg-surface-2 ${aberto ? 'rounded-t-[7px] border-b border-solid border-border' : 'rounded-[7px]'}`}
        onClick={() => setAberto(a => !a)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={aberto ? 'chevD' : 'chevR'} size={15} className="text-ink-faint shrink-0"/>
          <InlineEditableNome value={ambiente.nome} onCommit={renomear} textClassName="font-heading text-[13px] font-semibold text-ink truncate"/>
        </div>
        <button type="button" onClick={remover} className="bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-1 shrink-0" title="Remover ambiente">
          <Icon name="trash" size={12}/>
        </button>
      </div>
      {aberto && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed min-w-[640px]">
            <colgroup>
              <col className="w-[136px]"/>
              <col className="w-[27%]"/>
              <col className="w-[64px]"/>
              <col/>
            </colgroup>
            <thead>
              <tr className="border-b border-solid border-border">
                <th className={th}>Elemento construtivo</th>
                <th className={th}>Material</th>
                <th className={`${th} text-center`}>Classe</th>
                <th className={th}>Normas de ensaio</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => <LinhaAcabamento key={l.chave} estruturaId={estruturaId} linha={l} dispatch={dispatch}/>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Resultado: classes exigidas para a estrutura pela Tabela B.1 (a mais
// restritiva entre as divisões dela), um box por elemento.
function ClassesExigidas({ classes }) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-4 max-[720px]:grid-cols-2">
      {ELEMENTOS_TABELA_B1.map(({ key, label }) => (
        <div key={key} className="rounded-md border border-solid border-blue-border bg-blue-dim py-2.5 px-3">
          <div className="text-[10px] text-blue uppercase tracking-[.06em] font-semibold mb-1">{label}</div>
          <div className="text-[13px] font-semibold text-ink leading-[1.4]">
            {classes?.[key]?.length ? `Classe ${formatarClasses(classes[key])}` : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

function EstruturaAcabamento({ est, ambientes, itens, dispatch, exigido, classes }) {
  const linhasPorAmbiente = ambientes.map(amb => ({ ambiente: amb, linhas: montarLinhas(amb, itens) }))
  const todasLinhas = linhasPorAmbiente.flatMap(({ linhas }) => linhas)
  const preenchidas = todasLinhas.filter(l => l.item?.origem === 'nao_possui' || classeResolvida(l.item)).length
  const status = exigido
    ? statusPorProgresso(preenchidas, todasLinhas.length, { pendente: 'Nenhum material informado', concluido: 'Materiais informados' })
    : statusEstrutura('concluido', 'Não exigida')

  const adicionarAmbiente = () => dispatch({ type: 'ADD_AMBIENTE_ACABAMENTO', estruturaId: est.id, nome: `Ambiente ${ambientes.length + 1}` })

  return (
    <EstruturaSection titulo={<>{est.nome} <Obrigatorio id={`${est.id}.acabamentoAmbientes`}/></>} extra={<EstruturaHeaderInfo estrutura={est} semArea/>} status={status} conclusao={exigido ? { estruturaId: est.id, medida: 'controle_acabamento' } : null} defaultOpen={false}>
      {!exigido ? (
        <div className="ibox green">
          <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
          <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam o controle de materiais de acabamento, conforme a tabela de exigências do estado.</span>
        </div>
      ) : (
        <>
          <ClassesExigidas classes={classes}/>

          {ambientes.length === 0 && (
            <div className="ibox amber">
              <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
              <span className="text-xs">Nenhum ambiente cadastrado nesta estrutura ainda — adicione um abaixo.</span>
            </div>
          )}

          {linhasPorAmbiente.map(({ ambiente, linhas }) => (
            <TabelaAcabamento key={ambiente.id} ambiente={ambiente} linhas={linhas} estruturaId={est.id} dispatch={dispatch}/>
          ))}

          <button type="button" onClick={adicionarAmbiente} className="w-full min-h-10 inline-flex items-center justify-center gap-2 rounded-md border border-solid border-border bg-surface-2 text-ink-muted text-xs font-semibold transition-[background,color,border-color,transform] duration-150 hover:bg-surface-3 hover:border-ink-hint hover:text-ink active:translate-y-px">
            <Icon name="plus" size={14} strokeWidth={2.5}/> Adicionar ambiente
          </button>
        </>
      )}
      <ObservacoesComplementares estrutura={est} medida="controle_acabamento"/>
    </EstruturaSection>
  )
}

export default function ControleAcabamentoPage() {
  const { state, dispatch } = useProjeto()
  const { ocupacoes, cmar } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()

  // Semeia uma caixa de ambiente por divisão já classificada na estrutura —
  // só da primeira vez que a estrutura aparece aqui sem nenhuma caixa (ver
  // INIT_AMBIENTES_ACABAMENTO no reducer, idempotente). Depois disso o
  // conjunto de ambientes é 100% gerido pelo usuário: a semeadura nunca
  // roda de novo nem sobrescreve nomes já editados ou caixas já removidas
  // (mesmo padrão de INIT_CARGA, ver Step5.jsx).
  const estruturasParaSemear = state.estruturas
    .filter(est => !state.acabamentoAmbientes.some(a => a.estruturaId === est.id))
    .map(est => ({ est, divisoes: divisoesDaEstrutura(state.pavimentos.filter(p => p.estruturaId === est.id)) }))
    .filter(({ divisoes }) => divisoes.length > 0)

  const seedDepsKey = estruturasParaSemear.map(({ est, divisoes }) => `${est.id}:${divisoes.join('|')}`).join(';')

  useEffect(() => {
    estruturasParaSemear.forEach(({ est, divisoes }) => {
      const ambientes = divisoes.map(d => ({
        id: `${est.id}-amb-${d}`,
        estruturaId: est.id,
        nome: descricaoDivisao(ocupacoes, d) ? `${d} — ${descricaoDivisao(ocupacoes, d)}` : d,
      }))
      dispatch({ type: 'INIT_AMBIENTES_ACABAMENTO', estruturaId: est.id, ambientes })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedDepsKey])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        <div className="mb-7">
          <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
            <Icon name={SISTEMA_ICON.controle_acabamento} size={20} color="var(--color-red)" className="shrink-0"/>
            Controle de Materiais de Acabamento e Revestimento
          <LinkNorma sistema="controle_acabamento"/>
            <InfoTip side="bottom" align="start" text={<>Estabelece as condições a serem atendidas pelos materiais de acabamento e de revestimento empregados nas edificações, para que, na ocorrência de incêndio, restrinjam a propagação de fogo e o desenvolvimento de fumaça.</>}/>
          </h2>
        </div>

        {state.estruturas.map(est => {
          const pe = porEstrutura.find(p => p.estrutura.id === est.id)
          return (
            <EstruturaAcabamento
              key={est.id}
              est={est}
              ambientes={state.acabamentoAmbientes.filter(a => a.estruturaId === est.id)}
              itens={state.acabamentos.filter(a => a.estruturaId === est.id)}
              dispatch={dispatch}
              exigido={!!pe?.sistemas?.controle_acabamento?.ativo}
              classes={classesExigidasEstrutura(cmar?.TABELA_B1, divisoesDaEstrutura(state.pavimentos.filter(p => p.estruturaId === est.id)))}
            />
          )
        })}

      </div>
    </div>
  )
}
