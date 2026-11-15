import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Panel, Position, MarkerType,
  applyNodeChanges, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Icon from '../../components/ui/Icon'
import Checkbox from '../../components/ui/Checkbox'
import InlineEditableNome from '../../components/ui/InlineEditableNome'
import { AmbienteForm, fmtM } from './se_shared'
import {
  calcPopAmb, calcPopPav, calcNoAmbientePT, calcDimsAcesso, calcErEstrutura, dimsDoAcesso, contarSaidasPavimento, ehRaiz,
} from '../../data/se_calc'
import { ORIGEM_X, ORIGEM_Y, caminhoAteSaida, ladosMaisProximos, proximoNomeGrupo, tipoDeLigacao } from '../../data/se_fluxo'

// Fluxograma de saídas de uma ESTRUTURA (Grupo de ambientes -> Acesso ->
// Saída/Escada). Uma área de trabalho com uma faixa por pavimento (o de cima
// no topo); cada pavimento já traz a sua saída (piso de descarga) ou
// escada/rampa padrão, que não pode ser excluída. O usuário arrasta os nós,
// liga um ao outro com setas e escolhe por nó se ele é acesso, saída ou
// escada/rampa. Nós só se ligam dentro do mesmo pavimento — exceto saídas e
// escadas/rampas, que também se ligam a saídas/escadas de outros pavimentos
// (ver tipoDeLigacao). O desenho grava direto no estado do projeto
// (state.pavimentos, ver reducer em ProjetoContext.jsx) — `grupo.acessoId`/
// `acesso.alimentaEm` são as setas, e o motor de cálculo (se_calc.js) e o
// memorial leem esses mesmos campos. A escada/rampa é dimensionada uma única
// vez por estrutura (calcErEstrutura): vale pra todas.

const MIME_AMBIENTES = 'application/x-fireutils-ambientes'
const FluxoCtx = createContext(null)

function novoAmbienteId() {
  return `amb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// Busca sem diferenciar maiúsculas/acentos ("deposito" acha "Depósito").
const normalizar = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function CampoBusca({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border border-solid border-border bg-transparent px-2.5 ${className}`}>
      <Icon name="search" size={12} className="text-ink-faint shrink-0"/>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="nodrag nowheel flex-1 min-w-0 text-xs py-1.5 bg-transparent border-none outline-none text-ink"/>
      {value && (
        <button type="button" onClick={() => onChange('')} className="bg-transparent border-none text-ink-faint hover:text-ink cursor-pointer p-0" title="Limpar busca">
          <Icon name="x" size={11}/>
        </button>
      )}
    </div>
  )
}

// Busca dentro de um grupo: procura entre os ambientes que NÃO estão nele
// (soltos ou em outros grupos) e traz o escolhido pra dentro.
function BuscaNoGrupo({ grupo }) {
  const c = useContext(FluxoCtx)
  const [busca, setBusca] = useState('')
  const termo = normalizar(busca)
  const nomeGrupo = new Map(c.grupos.map(g => [g.id, g.nome]))
  const achados = termo
    ? c.ambientes.filter(a => a.grupoId !== grupo.id && normalizar(a.nome).includes(termo))
    : []
  return (
    <div className="flex flex-col gap-1.5">
      <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar ambiente para trazer ao grupo…"/>
      {termo && (
        <div className="nodrag nowheel flex flex-col gap-1 max-h-[140px] overflow-y-auto">
          {achados.map(a => (
            <button key={a.id} type="button" onClick={() => { c.moverParaGrupo([a.id], grupo.id); setBusca('') }}
              className="flex items-center justify-between gap-2 text-left py-1.5 px-2.5 rounded-md border border-solid border-border-2 bg-surface hover:border-red cursor-pointer">
              <span className="font-heading text-[12px] font-semibold text-ink truncate">{a.nome}</span>
              <span className="text-[10px] text-ink-faint whitespace-nowrap shrink-0">{a.grupoId ? `em ${nomeGrupo.get(a.grupoId) || 'outro grupo'}` : 'sem grupo'}</span>
            </button>
          ))}
          {achados.length === 0 && <div className="text-[11px] text-ink-faint italic px-1">Nenhum ambiente encontrado fora deste grupo.</div>}
        </div>
      )}
    </div>
  )
}

// Quebra "ACESSO/DESCARGA" -> "ACESSO/" + quebra de linha + "DESCARGA"
// (idem "ESCADA/RAMPA"). Sem "/", mostra o texto como veio (ex.: "Portas").
function LabelQuebrado({ texto }) {
  const partes = texto.split('/')
  if (partes.length !== 2) return texto
  return <>{partes[0]}/<br/>{partes[1]}</>
}

// Botão de dimensionamento (AD/ER/PT) de um nó — liga/desliga qual
// dimensionamento se aplica àquele nó (um nó pode precisar de mais de um
// ao mesmo tempo). Vermelho preenchido = ligado; cinza neutro = desligado.
function DimButton({ label, ativo, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`nodrag font-heading text-[10px] font-bold uppercase tracking-wide py-1 px-2 rounded border border-solid transition-colors cursor-pointer ${
        ativo ? 'bg-red border-red text-white' : 'bg-surface-2 border-border text-ink-faint'
      }`}
    >
      {label}
    </button>
  )
}

function DimEntry({ label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-[9px] text-ink-faint uppercase tracking-[.06em] text-center leading-tight"><LabelQuebrado texto={label}/></div>
      <div className="font-heading text-[15px] font-bold text-red leading-none whitespace-nowrap">{value}</div>
    </div>
  )
}

// ── Ambiente (cartão dentro de um grupo, solto na área ou na lista) ───────
// Arrastável por HTML5 DnD (solta num grupo, na área de trabalho ou na lista
// lateral); marcar vários pelo checkbox e arrastar um leva a seleção inteira.
// Checkbox e botão do canto só aparecem no hover — ou em todos os cartões
// enquanto houver algum marcado. Com pelo menos um marcado, o clique no
// cartão marca/desmarca em vez de abrir o formulário. Nome em cima (com toda a largura); população e porta embaixo.
// `noGrupo`: já está posicionado (em grupo ou solto na área) — o botão do
// canto devolve pra lista; na lista, o botão exclui o ambiente.
function AmbienteLinha({ amb, noGrupo, naArea = false }) {
  const c = useContext(FluxoCtx)
  const pop = calcPopAmb(amb, c.taxa)
  const { pt } = calcNoAmbientePT(amb, c.taxa, c.larguras)
  const selecionado = c.selecionados.has(amb.id)
  // Checkbox e botão do canto só aparecem com o mouse sobre o cartão (ou foco
  // dentro dele) — ou em todos os cartões, enquanto houver algum selecionado.
  const controles = c.selecionados.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
  return (
    <div draggable={!naArea}
      onDragStart={naArea ? undefined : e => {
        e.dataTransfer.setData(MIME_AMBIENTES, JSON.stringify(c.idsDoArrasto(amb.id)))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => c.selecionados.size > 0 ? c.toggleSelecao(amb.id) : c.editarAmbiente(amb)}
      className={`${naArea ? '' : 'nodrag'} group flex flex-col gap-1 py-2 px-2.5 rounded-md border border-solid bg-surface cursor-pointer transition-colors ${selecionado ? 'border-red' : 'border-border-2 hover:border-ink-hint'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`nodrag flex transition-opacity ${controles}`}><Checkbox checked={selecionado} onChange={() => c.toggleSelecao(amb.id)} title="Selecionar pra mover em massa"/></span>
          <span className="font-heading text-[12px] font-semibold text-ink truncate min-w-0">{amb.nome}</span>
          {amb.origem === 'manual' && (
            <span title="Ambiente criado manualmente (não veio do Revit)" className="inline-flex items-center justify-center w-[18px] h-[18px] rounded border border-solid border-border-2 text-ink-faint shrink-0">
              <Icon name="user" size={10}/>
            </span>
          )}
        </div>
        {noGrupo ? (
          <button onClick={e => { e.stopPropagation(); c.moverParaGrupo([amb.id], null) }} className={`nodrag bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5 shrink-0 transition-opacity ${controles}`} title="Voltar pra lista de ambientes (fora da área)">
            <Icon name="exitBox" size={12}/>
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); c.removerAmbiente(amb.id) }} className={`bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5 shrink-0 transition-opacity ${controles}`} title="Excluir ambiente">
            <Icon name="trash" size={12}/>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pl-6 text-[11px] text-ink-faint whitespace-nowrap">
        <span>{pop} pessoas</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-[.06em]">Porta</span>
          <strong className="font-heading text-[14px] font-bold text-red leading-none">{fmtM(pt.la)}</strong>
        </span>
      </div>
    </div>
  )
}

// ── Ambiente solto na área de trabalho (sem grupo) ──────────────────────
// Nó próprio: o cartão inteiro arrasta o nó (clique sem mover abre o formulário
// de edição; checkbox e botão do canto não arrastam), e a seta sai direto dele
// pra um acesso/saída/escada. Soltar o nó em cima de um grupo o coloca no grupo;
// em cima da lista lateral, devolve à lista (ver onNodeDragStop).
function AmbienteNode({ data }) {
  const c = useContext(FluxoCtx)
  const [sobre, setSobre] = useState(false)
  // Ambiente arrastado da lista (ou de um grupo) e solto em cima deste: os dois
  // viram um grupo novo.
  const soltarAqui = e => {
    setSobre(false)
    let ids = []
    try { ids = JSON.parse(e.dataTransfer.getData(MIME_AMBIENTES)) } catch { /* arrasto de outra origem */ }
    if (!ids.length) return
    e.preventDefault()
    e.stopPropagation()
    c.agruparAmbientes(data.amb.id, ids)
  }
  return (
    <div className={`w-[300px] cursor-grab rounded-md ${sobre || c.noQuente(data.amb.id) ? 'outline outline-2 outline-red' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes(MIME_AMBIENTES)) { e.preventDefault(); setSobre(true) } }}
      onDragLeave={() => setSobre(false)} onDrop={soltarAqui}
    >
      <AmbienteLinha amb={data.amb} noGrupo naArea/>
      <Alcas origem/>
    </div>
  )
}

// ── Alças de ligação ───────────────────────────────────────────────────
// A alça vermelha (origem) é por onde o usuário puxa a seta — no centro dos
// quatro lados, só visível com o mouse sobre o nó ou o nó selecionado (ver
// `.fluxo-saidas` em index.css). O destino não precisa de alça: o usuário
// solta a seta em qualquer ponto do corpo do nó (ver `terminarLigacao`). As
// alças de destino existem só pro React Flow ter onde encaixar a ponta da
// seta (ficam invisíveis e não recebem clique). A seta sai e chega sempre
// pelos lados mais próximos entre os dois nós (ver ladosMaisProximos), não
// importa de qual alça o usuário puxou.
const LADOS = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]]
function Alcas({ origem, destino }) {
  return LADOS.flatMap(([lado, posicao]) => [
    origem && <Handle key={`s-${lado}`} id={`s-${lado}`} type="source" position={posicao} className="!w-3 !h-3 !bg-red !border-2 !border-surface"/>,
    destino && <Handle key={`t-${lado}`} id={`t-${lado}`} type="target" position={posicao} isConnectable={false} className="!w-3 !h-3 !bg-ink-faint !border-2 !border-surface"/>,
  ])
}

// ── Grupo de ambientes ───────────────────────────────────────────────────
// Agrupa ambientes e liga o conjunto a UM nó (seta pela alça vermelha).
// Grupo sem ligação = ambientes com acesso direto à área de relativa
// segurança — não gera pendência.
function GrupoNode({ data }) {
  const c = useContext(FluxoCtx)
  const { grupo, ambientes, pop } = data
  const [sobre, setSobre] = useState(false)
  const drop = c.dropProps(grupo.id, setSobre)
  return (
    <div {...drop}
      className={`w-[340px] rounded-lg border border-solid transition-colors ${sobre ? 'border-red bg-[rgba(192,21,42,.05)]' : 'border-border'} ${c.noQuente(grupo.id) ? 'outline outline-2 outline-red' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 py-2.5 px-3 rounded-t-lg border-b border-solid border-border-2 cursor-grab">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="grip" size={13} className="text-ink-faint shrink-0"/>
          <span className="nodrag min-w-0">
            <InlineEditableNome value={grupo.nome} onCommit={nome => c.dispatch({ type: 'RENOMEAR_GRUPO', pavimentoId: c.pavDe(grupo.id), grupoId: grupo.id, nome })} textClassName="font-heading text-[14px] font-bold text-ink truncate"/>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-ink-faint whitespace-nowrap">{pop} pessoas</span>
          <button onClick={() => c.removerGrupo(grupo)} className="nodrag bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5" title="Remover grupo (os ambientes ficam soltos)">
            <Icon name="trash" size={12}/>
          </button>
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-2">
        {ambientes.map(a => <AmbienteLinha key={a.id} amb={a} noGrupo/>)}
        {ambientes.length === 0 && <div className="text-[11px] text-ink-faint italic py-1 text-center">Arraste ou busque ambientes para trazê-los pra cá.</div>}
        <BuscaNoGrupo grupo={grupo}/>
        <button className="nodrag btn-ghost justify-center" onClick={() => c.criarAmbiente(grupo.id)}><Icon name="plus" size={12}/> ADICIONAR AMBIENTE</button>
      </div>
      {!data.ligado && <div className="px-3 pb-2.5 text-[10px] text-ink-faint text-center">Sem ligação — acesso direto à área de relativa segurança</div>}
      <Alcas origem/>
    </div>
  )
}

// ── Acesso / Saída / Escada-Rampa ──────────────────────────────────────
const TIPOS = [
  { tipo: 'acesso', label: 'Acesso' },
  { tipo: 'saida',  label: 'Saída' },
  { tipo: 'escada', label: 'Escada/Rampa' },
]
const TOM_TIPO = {
  acesso: { faixa: 'border-border text-ink-faint', ativo: 'bg-surface-2 text-ink border-ink-hint' },
  saida:  { faixa: 'border-green-border bg-green-dim text-green', ativo: 'bg-green-dim text-green border-green-border' },
  escada: { faixa: 'border-amber-border bg-amber-dim text-amber', ativo: 'bg-amber-dim text-amber border-amber-border' },
}

function AcessoNode({ data }) {
  const c = useContext(FluxoCtx)
  const { acesso, tipo, dims, pop, entradas, raiz, erUnico } = data
  const alvoValido = c.podeReceberLigacao(acesso.id)
  const dispatch = c.dispatch
  const pavimentoId = c.pavDe(acesso.id)
  const toggleDim = d => dispatch({ type: 'SET_ACESSO_DIM', pavimentoId, acessoId: acesso.id, dim: d, valor: !dims[d] })
  return (
    <div className={`${alvoValido ? 'alvo-valido' : ''} ${c.noQuente(acesso.id) ? 'outline outline-2 outline-red' : ''} w-[300px] rounded-lg border border-solid bg-surface ${tipo === 'acesso' ? 'border-border' : TOM_TIPO[tipo].faixa.split(' ')[0]}`}>
      <div className="flex items-center justify-between gap-2 py-2.5 px-3 bg-surface-2 rounded-t-lg cursor-grab">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="grip" size={13} className="text-ink-faint shrink-0"/>
          <span className="nodrag min-w-0">
            <InlineEditableNome value={acesso.nome} onCommit={nome => dispatch({ type: 'RENOMEAR_ACESSO', pavimentoId, acessoId: acesso.id, nome })} textClassName="font-heading text-[14px] font-bold text-ink truncate"/>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-ink-faint whitespace-nowrap">{pop} pessoas</span>
          {acesso.fixo ? (
            <span title="Padrão do pavimento: não pode ser excluída" className="text-ink-faint flex p-0.5"><Icon name="lock" size={12}/></span>
          ) : (
            <button onClick={() => c.removerAcesso(acesso)} className="nodrag bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5" title="Remover (o que alimentava este nó fica sem ligação)">
              <Icon name="trash" size={12}/>
            </button>
          )}
        </div>
      </div>
      <div className="nodrag flex gap-1 px-3 pt-2.5">
        {TIPOS.map(t => (
          <button key={t.tipo} type="button" disabled={!!acesso.fixo}
            title={acesso.fixo ? 'Acompanha o piso de descarga do pavimento (saída) ou os demais (escada/rampa)' : undefined}
            onClick={() => tipo !== t.tipo && dispatch({ type: 'SET_ACESSO_TIPO', pavimentoId, acessoId: acesso.id, tipo: t.tipo })}
            className={`flex-1 text-[10px] font-semibold py-1 px-1.5 rounded border border-solid transition-colors ${acesso.fixo ? 'cursor-default' : 'cursor-pointer'} ${tipo === t.tipo ? TOM_TIPO[t.tipo].ativo : `bg-transparent border-border text-ink-faint ${acesso.fixo ? 'opacity-40' : 'hover:text-ink'}`}`}
          >{t.label}</button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 px-3 pt-2.5">
        <DimButton label="AD" ativo={dims.AD} onClick={() => toggleDim('AD')}/>
        <DimButton label="PT" ativo={dims.PT} onClick={() => toggleDim('PT')}/>
        <DimButton label="ER" ativo={dims.ER} onClick={() => toggleDim('ER')}/>
      </div>
      <div className="flex items-center justify-center gap-3 px-3 py-2.5 flex-wrap min-h-[38px]">
        {entradas.map(e => <DimEntry key={e.label} label={e.label} value={e.value}/>)}
      </div>
      {erUnico && (
        <div className="px-3 pb-2 text-[10px] text-ink-faint text-center" title="A escada/rampa é dimensionada uma única vez por estrutura, com a população do pavimento mais populoso (sem o piso de descarga) — vale pra todas.">
          Escada/rampa: {erUnico.pop} pessoas · {erUnico.label}
        </div>
      )}
      {!raiz && tipo === 'acesso' && !acesso.alimentaEm && (
        <div className="px-3 pb-2.5 text-[10px] text-amber text-center">Sem ligação a uma saída ou escada/rampa</div>
      )}
      <Alcas origem destino/>
    </div>
  )
}

// ── Faixa de um pavimento ───────────────────────────────────────────────
// Fundo + nome grande do pavimento na área de trabalho (dá pra ler mesmo com
// zoom afastado). Não recebe mouse: nós e ligações trabalham por cima. A faixa
// do pavimento em edição fica com a borda vermelha — as opções do topo (criar
// nós, piso de descarga) valem pra ela.
function FaixaNode({ data }) {
  const c = useContext(FluxoCtx)
  const { pav } = data
  const ativa = c.pavAtivoId === pav.id
  return (
    <div className={`w-full h-full rounded-lg border border-dashed transition-colors bg-[rgba(255,255,255,.015)] ${ativa ? 'border-red' : 'border-ink-hint'}`}>
      <div className="flex items-baseline gap-4 py-4 px-6">
        <span className={`font-heading text-[30px] font-bold ${ativa ? 'text-ink' : 'text-ink-faint'}`}>{pav.label}</span>
        {pav.pisoDescarga && <span className="text-[11px] py-0.5 px-2 rounded bg-amber-dim border border-solid border-amber-border text-amber font-semibold">PISO DE DESCARGA</span>}
      </div>
    </div>
  )
}

const nodeTypes = { faixa: FaixaNode, grupo: GrupoNode, acesso: AcessoNode, ambiente: AmbienteNode }

// ── Switch "piso de descarga" no cabeçalho ─────────────────────────────
function PisoDescargaSwitch({ checked, onChange }) {
  return (
    <div className="flex items-center gap-3 border border-solid border-border rounded-md py-1.5 px-3 shrink-0">
      <span className="text-xs text-ink-faint whitespace-nowrap">Este pavimento é o <strong className="text-ink font-semibold">piso de descarga</strong>?</span>
      <button onClick={() => onChange(!checked)} className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0 shrink-0">
        <div className={`w-7 h-4 rounded-[8px] shrink-0 relative transition-colors duration-200 ${checked ? 'bg-red' : 'bg-border'}`}>
          <div className={`absolute top-0.5 ${checked ? 'left-3.5' : 'left-0.5'} w-3 h-3 rounded-full bg-white transition-[left] duration-200`}/>
        </div>
        <span className={`text-xs font-medium ${checked ? 'text-ink' : 'text-ink-faint'}`}>{checked ? 'Sim' : 'Não'}</span>
      </button>
    </div>
  )
}

const NOVO_GRUPO = '__novo_grupo__'
const SEM_GRUPO = '__sem_grupo__'
const NA_AREA = '__na_area__'

const arredondar = pos => ({ x: Math.round(pos.x), y: Math.round(pos.y) })

// Tamanho mínimo da faixa de um pavimento e folga além do último nó — a faixa
// cresce junto com os nós (eles não saem da faixa onde nasceram).
const FAIXA_W = 1500
const FAIXA_H = 640
const FAIXA_FOLGA_X = 520
const FAIXA_FOLGA_Y = 420
const FAIXA_GAP = 80

// Agrupa uma lista de ids por pavimento: Map(pavimentoId -> ids).
function porPavimento(ids, pavDe) {
  const m = new Map()
  ids.forEach(id => {
    const p = pavDe.get(id)
    if (p) m.set(p, [...(m.get(p) || []), id])
  })
  return m
}

function Fluxograma({ estrutura, pavimentos, focoPavId, seNorma, ocupacoes, dispatch, onClose }) {
  const { TAXA_POPULACIONAL, LARGURAS_MINIMAS } = seNorma
  // Faixas de cima pra baixo: pavimento mais alto no topo, subsolos embaixo.
  const pavs = useMemo(() => [...pavimentos].reverse(), [pavimentos])
  const ambientes = useMemo(() => pavimentos.flatMap(p => p.ambientes || []), [pavimentos])
  const acessos = useMemo(() => pavimentos.flatMap(p => p.acessos || []), [pavimentos])
  const grupos = useMemo(() => pavimentos.flatMap(p => p.grupos || []), [pavimentos])
  // Quem é de qual pavimento (os ids de nós são únicos no projeto).
  const pavDe = useMemo(() => {
    const m = new Map()
    pavimentos.forEach(p => {
      ;(p.ambientes || []).forEach(a => m.set(a.id, p.id))
      ;(p.acessos || []).forEach(a => m.set(a.id, p.id))
      ;(p.grupos || []).forEach(g => m.set(g.id, p.id))
    })
    return m
  }, [pavimentos])
  const pavPorId = useMemo(() => new Map(pavimentos.map(p => [p.id, p])), [pavimentos])
  const posDe = id => pavPorId.get(pavDe.get(id))?.fluxoPos?.[id]

  const { search } = useLocation()
  const alvoAudit = new URLSearchParams(search).get('audit') || ''
  const [editAmb, setEditAmb] = useState(() => ambientes.find(a => alvoAudit.startsWith(`${a.id}.`)) || null)
  const [selecionados, setSelecionados] = useState(new Set())
  const [alvoSelecao, setAlvoSelecao] = useState('')
  const wrapRef = useRef(null)
  const rf = useReactFlow()
  // Id de quem está sendo puxado agora (null = nenhuma ligação em andamento);
  // os nós que podem receber a seta se destacam. Vem de onConnectStart/End, não
  // de useConnection(): esse hook re-renderiza a cada movimento do ponteiro e,
  // junto com as props novas a cada render do <ReactFlow>, entra em loop.
  const [origemLigacao, setOrigemLigacao] = useState(null)
  // Pavimento em edição: as opções do topo (criar nós, piso de descarga) valem
  // pra ele. Muda ao escolher no seletor, ao mexer num nó ou ao navegar até
  // outra faixa (a que fica no centro da tela).
  const [pavAtivoId, setPavAtivoId] = useState(focoPavId || pavimentos[pavimentos.length - 1]?.id)

  // Nó sob o mouse: ele e tudo até a saída (nós e setas) ficam vermelhos.
  // Não vale durante o arrasto de uma seta nova.
  const [noHover, setNoHover] = useState(null)
  const caminhoQuente = useMemo(
    () => (noHover && !origemLigacao ? caminhoAteSaida(noHover, { acessos, grupos, ambientes }) : null),
    [noHover, origemLigacao, acessos, grupos, ambientes],
  )

  const [filtroSoltos, setFiltroSoltos] = useState('')
  // Lista lateral: ambientes sem grupo e sem posição na área de trabalho.
  const soltos = ambientes.filter(a => !a.grupoId && !posDe(a.id))
  const soltosFiltrados = soltos.filter(a => normalizar(a.nome).includes(normalizar(filtroSoltos)))

  // ── Seleção em massa / arrasto de ambientes ──
  const toggleSelecao = id => setSelecionados(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const limparSelecao = () => setSelecionados(new Set())
  const idsDoArrasto = id => (selecionados.size > 1 && selecionados.has(id) ? [...selecionados] : [id])

  // ── Faixas (uma por pavimento), do topo pra baixo ──
  const faixas = useMemo(() => pavs.reduce((acc, p) => {
    const posicoes = Object.values(p.fluxoPos || {})
    const w = Math.max(FAIXA_W, ...posicoes.map(q => q.x + FAIXA_FOLGA_X))
    const h = Math.max(FAIXA_H, ...posicoes.map(q => q.y + FAIXA_FOLGA_Y))
    const anterior = acc[acc.length - 1]
    return [...acc, { id: `faixa-${p.id}`, pav: p, x: 0, y: anterior ? anterior.y + anterior.h + FAIXA_GAP : 0, w, h }]
  }, []), [pavs])
  const pavAtivo = pavPorId.get(pavAtivoId) || pavs[0]
  const faixaDe = pavId => faixas.find(f => f.pav.id === pavId)
  // Enquadra a faixa de um pavimento na tela (com o retângulo calculado aqui, não pelo fitView com `nodes`, que caía no "mostrar tudo").
  const enquadrarFaixa = (inst, pavId, duration) => {
    const f = faixaDe(pavId)
    if (f) inst.fitBounds({ x: f.x, y: f.y, width: f.w, height: f.h }, { padding: 0.03, duration })
  }
  // Faixa que contém um ponto da área de trabalho (coordenadas do fluxo).
  const faixaEm = ponto => faixas.find(f => ponto.x >= f.x && ponto.x <= f.x + f.w && ponto.y >= f.y && ponto.y <= f.y + f.h)

  // ── Posição de nó novo numa faixa: centro da área visível (limitado à
  // faixa), com um leve desvio pra não empilhar vários nós criados em sequência.
  const posicaoNova = pavId => {
    const faixa = faixaDe(pavId)
    const r = wrapRef.current.getBoundingClientRect()
    const c = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const x = Math.min(Math.max(c.x - faixa.x - 150 + Math.random() * 60, 60), faixa.w - 400)
    const y = Math.min(Math.max(c.y - faixa.y - 80 + Math.random() * 60, 120), faixa.h - 260)
    return arredondar({ x, y })
  }

  const criarNo = (pavId, tipo) => {
    const n = acessos.filter(a => pavDe.get(a.id) === pavId && a.tipo === tipo).length + 1
    const nome = { acesso: `Acesso ${n}`, saida: `Saída ${String(n).padStart(2, '0')}`, escada: `Escada/Rampa ${String(n).padStart(2, '0')}` }[tipo]
    dispatch({ type: 'CRIAR_NO_FLUXO', pavimentoId: pavId, tipo, nome, pos: posicaoNova(pavId) })
  }
  const criarGrupo = (pavId, ambienteIds) => {
    dispatch({ type: 'CRIAR_GRUPO_AMBIENTES', pavimentoId: pavId, nome: proximoNomeGrupo(pavPorId.get(pavId).grupos || []), pos: posicaoNova(pavId), ambienteIds })
  }

  // ── Ambientes ──
  // Com `grupoId`, nasce dentro do grupo (do pavimento dele); senão solto na
  // área do pavimento `pavId`.
  const criarAmbiente = (grupoId, pavId) => {
    const pavimentoId = grupoId ? pavDe.get(grupoId) : pavId
    const id = novoAmbienteId()
    const nome = `Ambiente ${ambientes.length + 1}`
    dispatch({
      type: 'ADD_AMBIENTE_SE', pavimentoId, id, pos: grupoId ? null : posicaoNova(pavimentoId),
      ambiente: { nome, divisao: '', popTipo: 'area', area: 0, assentos: 0, popManual: 0, grupoId: grupoId || null, origem: 'manual' },
    })
    setEditAmb({ id, nome, divisao: '', popTipo: 'area', area: 0, assentos: 0, popManual: 0 })
  }
  const removerAmbiente = id => {
    dispatch({ type: 'REMOVE_AMBIENTE_SE', pavimentoId: pavDe.get(id), ambienteId: id })
    if (editAmb?.id === id) setEditAmb(null)
    setSelecionados(prev => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next })
  }
  // Move ambientes pra dentro de um grupo (só os do mesmo pavimento do grupo
  // entram) ou de volta pra lista (`grupoId` null).
  const moverParaGrupo = (ids, grupoId) => {
    const pavDoGrupo = grupoId ? pavDe.get(grupoId) : null
    porPavimento(ids, pavDe).forEach((lista, pavimentoId) => {
      if (pavDoGrupo && pavimentoId !== pavDoGrupo) return
      dispatch({ type: 'MOVER_AMBIENTES_GRUPO', pavimentoId, ambienteIds: lista, grupoId })
    })
    limparSelecao()
  }
  // Coloca ambientes soltos na faixa `pavId`, a partir de `pos` (relativa à
  // faixa), em coluna. Só os ambientes desse pavimento.
  const soltarNaArea = (ids, pavId, pos) => {
    const meus = ids.filter(id => pavDe.get(id) === pavId)
    if (!meus.length) return
    dispatch({
      type: 'SOLTAR_AMBIENTES_NA_AREA', pavimentoId: pavId,
      posicoes: Object.fromEntries(meus.map((id, i) => [id, { x: pos.x, y: pos.y + i * 80 }])),
    })
    limparSelecao()
  }
  // Ambiente arrastado da lista (ou de um grupo) e solto no fundo da área: vale
  // na faixa do próprio pavimento do ambiente.
  const soltarNoFundo = e => {
    if (!e.dataTransfer.types.includes(MIME_AMBIENTES)) return
    let ids = []
    try { ids = JSON.parse(e.dataTransfer.getData(MIME_AMBIENTES)) } catch { /* arrasto de outra origem */ }
    if (!ids.length) return
    e.preventDefault()
    const ponto = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const faixa = faixaEm(ponto)
    if (!faixa) return
    const x = Math.min(Math.max(ponto.x - faixa.x, 20), faixa.w - 340)
    const y = Math.min(Math.max(ponto.y - faixa.y, ORIGEM_Y), faixa.h - 120)
    soltarNaArea(ids, faixa.pav.id, arredondar({ x, y }))
  }
  // Junta o ambiente solto `alvoId` com os ambientes `ids` (do mesmo pavimento)
  // num grupo novo, no lugar do alvo e herdando a ligação direta dele (se tinha).
  const agruparAmbientes = (alvoId, ids) => {
    const alvo = ambientes.find(a => a.id === alvoId)
    const pavimentoId = pavDe.get(alvoId)
    if (!alvo) return
    dispatch({
      type: 'CRIAR_GRUPO_AMBIENTES', pavimentoId, nome: proximoNomeGrupo(pavPorId.get(pavimentoId).grupos || []),
      pos: posDe(alvoId) || posicaoNova(pavimentoId), acessoId: alvo.acessoId || null,
      ambienteIds: [alvoId, ...ids.filter(id => id !== alvoId && pavDe.get(id) === pavimentoId)],
    })
    limparSelecao()
  }
  const moverSelecionados = () => {
    if (!selecionados.size || !alvoSelecao) return
    const ids = [...selecionados]
    if (alvoSelecao === NOVO_GRUPO) porPavimento(ids, pavDe).forEach((lista, pavimentoId) => criarGrupo(pavimentoId, lista))
    else if (alvoSelecao === NA_AREA) porPavimento(ids, pavDe).forEach((lista, pavimentoId) => soltarNaArea(lista, pavimentoId, posicaoNova(pavimentoId)))
    else moverParaGrupo(ids, alvoSelecao === SEM_GRUPO ? null : alvoSelecao)
    limparSelecao()
    setAlvoSelecao('')
  }
  const renomearAmbiente = nome => {
    dispatch({ type: 'UPDATE_AMBIENTE_SE', pavimentoId: pavDe.get(editAmb.id), ambienteId: editAmb.id, changes: { nome } })
    setEditAmb(prev => ({ ...prev, nome }))
  }

  const removerGrupo = grupo => {
    const n = ambientes.filter(a => a.grupoId === grupo.id).length
    if (n > 0 && !window.confirm(`Remover o grupo "${grupo.nome}"? Os ${n} ambiente(s) dentro dele voltarão pra lista de ambientes, mas não serão apagados.`)) return
    dispatch({ type: 'REMOVER_GRUPO', pavimentoId: pavDe.get(grupo.id), grupoId: grupo.id })
  }
  const removerAcesso = acesso => {
    if (acesso.fixo) return
    if (window.confirm(`Remover "${acesso.nome}"? O que alimentava este nó ficará sem ligação, mas não será apagado.`)) {
      dispatch({ type: 'REMOVER_ACESSO', pavimentoId: pavDe.get(acesso.id), acessoId: acesso.id })
    }
  }

  // Props de uma zona que recebe ambientes arrastados (grupo ou lista de soltos).
  const dropProps = (grupoId, setSobre) => ({
    onDragOver: e => {
      if (!e.dataTransfer.types.includes(MIME_AMBIENTES)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setSobre?.(true)
    },
    onDragLeave: () => setSobre?.(false),
    onDrop: e => {
      setSobre?.(false)
      let ids = []
      try { ids = JSON.parse(e.dataTransfer.getData(MIME_AMBIENTES)) } catch { /* arrasto de outra origem */ }
      if (!ids.length) return
      e.preventDefault()
      e.stopPropagation()
      moverParaGrupo(ids, grupoId)
    },
  })

  const ctx = {
    pavAtivoId, pavDe: id => pavDe.get(id), dispatch, taxa: TAXA_POPULACIONAL, larguras: LARGURAS_MINIMAS, selecionados,
    toggleSelecao, idsDoArrasto, editarAmbiente: setEditAmb, criarAmbiente, removerAmbiente,
    moverParaGrupo, agruparAmbientes, removerGrupo, removerAcesso, dropProps, ambientes, grupos,
    noQuente: id => !!caminhoQuente?.nos.includes(id),
    podeReceberLigacao: id => !!origemLigacao && conexaoValida({ source: origemLigacao, target: id }),
  }

  // ── Nós e setas a partir do estado do projeto ──
  // Dimensionamento único das escadas/rampas da estrutura.
  const erEstrutura = useMemo(() => calcErEstrutura(pavimentos, TAXA_POPULACIONAL, LARGURAS_MINIMAS), [pavimentos, TAXA_POPULACIONAL, LARGURAS_MINIMAS])
  const nosBase = useMemo(() => {
    const nos = []
    faixas.forEach(f => {
      const p = f.pav
      const pambs = p.ambientes || []
      const pacs = p.acessos || []
      nos.push({
        id: f.id, type: 'faixa', position: { x: f.x, y: f.y }, width: f.w, height: f.h,
        draggable: false, selectable: false, focusable: false, connectable: false,
        style: { width: f.w, height: f.h, pointerEvents: 'none' }, zIndex: 0,
        data: { pav: p, nSaidas: Math.max(1, contarSaidasPavimento(pacs)), pop: calcPopPav({ ambientes: pambs }, TAXA_POPULACIONAL) },
      })
      const filho = (id, type, data) => ({ id, type, parentId: f.id, extent: 'parent', position: p.fluxoPos?.[id] || { x: ORIGEM_X, y: ORIGEM_Y }, data })
      ;(p.grupos || []).forEach(g => {
        const ambs = pambs.filter(a => a.grupoId === g.id)
        nos.push(filho(g.id, 'grupo', { grupo: g, ambientes: ambs, ligado: !!g.acessoId, pop: ambs.reduce((s, a) => s + calcPopAmb(a, TAXA_POPULACIONAL), 0) }))
      })
      pambs.filter(a => !a.grupoId && p.fluxoPos?.[a.id]).forEach(a => nos.push(filho(a.id, 'ambiente', { amb: a })))
      pacs.forEach(ac => {
        const dims = dimsDoAcesso(ac, !!p.pisoDescarga)
        const { pop, ad, er, pt } = calcDimsAcesso(ac.id, pambs, pacs, TAXA_POPULACIONAL, LARGURAS_MINIMAS, dims, erEstrutura)
        nos.push(filho(ac.id, 'acesso', {
          acesso: ac, tipo: ac.tipo, dims, pop, raiz: ehRaiz(ac),
          erUnico: dims.ER && erEstrutura ? { pop: erEstrutura.pop, label: erEstrutura.pavimento.label } : null,
          entradas: [
            ad && { label: 'ACESSO/DESCARGA', value: fmtM(ad.la) },
            pt && { label: 'PORTAS', value: fmtM(pt.la) },
            er && { label: 'ESCADA/RAMPA', value: fmtM(er.la) },
          ].filter(Boolean),
        }))
      })
    })
    return nos
  }, [faixas, erEstrutura, TAXA_POPULACIONAL, LARGURAS_MINIMAS])

  // Estado local dos nós (React Flow precisa dele pra animar o arrasto);
  // reabastecido a cada mudança do projeto, preservando seleção/medidas e a
  // posição de quem está sendo arrastado agora.
  const [nodes, setNodes] = useState(nosBase)
  const [nosBaseVisto, setNosBaseVisto] = useState(nosBase)
  if (nosBaseVisto !== nosBase) {
    setNosBaseVisto(nosBase)
    const antigos = new Map(nodes.map(n => [n.id, n]))
    setNodes(nosBase.map(n => {
      const o = antigos.get(n.id)
      return o ? { ...o, ...n, position: o.dragging ? o.position : n.position } : n
    }))
  }

  // Seta selecionada (clique) — a única coisa que Delete/"Desligar" apaga.
  const [setaSelecionada, setSetaSelecionada] = useState(null)
  const ambientesNaArea = new Set(ambientes.filter(a => !a.grupoId && posDe(a.id)).map(a => a.id))
  const edges = useMemo(() => {
    const existe = new Set(acessos.map(a => a.id))
    const na = ambientes.filter(a => !a.grupoId && posDe(a.id))
    const liga = [
      ...grupos.filter(g => existe.has(g.acessoId)).map(g => ({ id: `e-${g.id}`, source: g.id, target: g.acessoId })),
      ...acessos.filter(a => existe.has(a.alimentaEm)).map(a => ({ id: `e-${a.id}`, source: a.id, target: a.alimentaEm })),
      ...acessos.filter(a => existe.has(a.ligadoA)).map(a => ({ id: `e-${a.id}`, source: a.id, target: a.ligadoA, entre: true })),
      ...na.filter(a => existe.has(a.acessoId)).map(a => ({ id: `e-${a.id}`, source: a.id, target: a.acessoId })),
    ]
    // Retângulo absoluto do nó (a posição dele é relativa à faixa do pavimento).
    const retangulo = id => {
      const n = nodes.find(x => x.id === id)
      const f = faixas.find(x => x.id === n.parentId)
      return { x: n.position.x + (f?.x || 0), y: n.position.y + (f?.y || 0), w: n.measured?.width ?? (n.type === 'grupo' ? 340 : 300), h: n.measured?.height ?? (n.type === 'ambiente' ? 80 : 160) }
    }
    return liga.filter(e => nodes.some(n => n.id === e.source) && nodes.some(n => n.id === e.target)).map(e => {
      const { de, para } = ladosMaisProximos(retangulo(e.source), retangulo(e.target))
      return { ...e, sourceHandle: `s-${de}`, targetHandle: `t-${para}` }
    }).map(e => ({
      ...e,
      type: 'smoothstep', selected: e.id === setaSelecionada,
      ...(caminhoQuente?.setas.includes(e.id)
        ? { markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-red)' }, style: { strokeWidth: 3, stroke: 'var(--color-red)', strokeDasharray: e.entre ? '8 5' : undefined }, zIndex: 10 }
        : { markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-ink-faint)' }, style: { strokeWidth: 2, strokeDasharray: e.entre ? '8 5' : undefined } }),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, acessos, ambientes, pavimentos, faixas, nodes, setaSelecionada, caminhoQuente])

  // Cada nó alimenta no máximo UM seguinte; que ligação vale entre dois nós
  // (mesmo pavimento, ou saída/escada entre pavimentos) está em tipoDeLigacao.
  const tipoLigacao = (source, target) => tipoDeLigacao(source, target, { acessos, grupos, pavDe, ambientesNaArea })
  const conexaoValida = ({ source, target }) => !!tipoLigacao(source, target)
  // O destino é o nó sob o ponteiro quando o usuário solta a seta — corpo do
  // nó inteiro, sem alça de recepção.
  const terminarLigacao = (evento, estado) => {
    setOrigemLigacao(null)
    const ponto = evento.changedTouches?.[0] ?? evento
    const alvo = document.elementFromPoint(ponto.clientX, ponto.clientY)?.closest('.react-flow__node')?.getAttribute('data-id')
    if (alvo && estado.fromNode) ligar({ source: estado.fromNode.id, target: alvo })
  }
  // Fim do arrasto de nós: ambiente solto largado em cima de outro ambiente
  // solto (do mesmo pavimento) forma um grupo com ele; em cima de um grupo do
  // mesmo pavimento entra nele; em cima da lista lateral, volta pra lista; do
  // contrário só guarda a nova posição de tudo que foi arrastado.
  const soltarNo = (evento, _no, arrastados) => {
    if (pavDe.get(_no.id)) setPavAtivoId(pavDe.get(_no.id))
    const ponto = evento.changedTouches?.[0] ?? evento
    // O próprio nó arrastado fica sob o ponteiro — procura o que está por baixo.
    const abaixo = document.elementsFromPoint(ponto.clientX, ponto.clientY)
    const ambientesArrastados = arrastados.filter(n => n.type === 'ambiente').map(n => n.id)
    const mesmoPav = id => !!id && ambientesArrastados.every(a => pavDe.get(a) === pavDe.get(id))
    const grupoAbaixo = abaixo.map(el => el.closest('.react-flow__node-grupo')).find(Boolean)?.getAttribute('data-id')
    const grupoValido = mesmoPav(grupoAbaixo) ? grupoAbaixo : null
    const naLista = abaixo.some(el => el.closest('aside'))
    // Outro ambiente solto por baixo do ponteiro: os dois viram um grupo.
    const ambienteAbaixo = abaixo.map(el => el.closest('.react-flow__node-ambiente')).find(n => n && !ambientesArrastados.includes(n.getAttribute('data-id')))?.getAttribute('data-id')
    const ambienteValido = mesmoPav(ambienteAbaixo) ? ambienteAbaixo : null
    if (ambientesArrastados.length && !grupoValido && !naLista && ambienteValido) {
      agruparAmbientes(ambienteValido, ambientesArrastados)
      arrastados = arrastados.filter(n => n.type !== 'ambiente')
    } else if (ambientesArrastados.length && (grupoValido || naLista)) {
      moverParaGrupo(ambientesArrastados, grupoValido || null)
      arrastados = arrastados.filter(n => n.type !== 'ambiente')
    }
    // Posições (relativas à faixa), um despacho por pavimento.
    porPavimento(arrastados.map(n => n.id), pavDe).forEach((lista, pavimentoId) => {
      dispatch({
        type: 'SET_POSICOES_FLUXO', pavimentoId,
        posicoes: Object.fromEntries(lista.map(id => [id, arredondar(arrastados.find(n => n.id === id).position)])),
      })
    })
  }
  const ligar = ({ source, target }) => {
    const tipo = tipoLigacao(source, target)
    const pavimentoId = pavDe.get(source)
    if (tipo === 'entre-pavimentos') dispatch({ type: 'LIGAR_ENTRE_PAVIMENTOS', pavimentoId, acessoId: source, destinoId: target })
    else if (tipo === 'local') {
      if (grupos.some(g => g.id === source)) dispatch({ type: 'LIGAR_GRUPO', pavimentoId, grupoId: source, acessoId: target })
      else if (ambientesNaArea.has(source)) dispatch({ type: 'LIGAR_AMBIENTE', pavimentoId, ambienteId: source, acessoId: target })
      else dispatch({ type: 'MOVER_ACESSO', pavimentoId, acessoId: source, novoAlimentaEm: target })
    }
  }
  const desligar = removidas => removidas.forEach(e => {
    setSetaSelecionada(null)
    const pavimentoId = pavDe.get(e.source)
    if (grupos.some(g => g.id === e.source)) dispatch({ type: 'LIGAR_GRUPO', pavimentoId, grupoId: e.source, acessoId: null })
    else if (ambientesNaArea.has(e.source)) dispatch({ type: 'LIGAR_AMBIENTE', pavimentoId, ambienteId: e.source, acessoId: null })
    else if (acessos.find(a => a.id === e.source)?.ligadoA === e.target) dispatch({ type: 'LIGAR_ENTRE_PAVIMENTOS', pavimentoId, acessoId: e.source, destinoId: null })
    else dispatch({ type: 'MOVER_ACESSO', pavimentoId, acessoId: e.source, novoAlimentaEm: null })
  })

  const [sobreSoltos, setSobreSoltos] = useState(false)
  const alvosGrupo = pavs.flatMap(p => (p.grupos || []).map(g => ({ id: g.id, label: `${p.label} · ${g.nome}` })))

  return (
    <div className="fixed inset-0 z-[500] bg-black/65 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative bg-surface border border-solid border-border rounded-lg w-[98vw] h-[96vh] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,.55)]">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 px-5 border-b border-solid border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={onClose} className="btn-ghost p-1.5 shrink-0"><Icon name="left" size={14}/></button>
            <span className="text-base font-bold text-ink truncate">{estrutura.nome}</span>
            <select value={pavAtivo.id} title="Pavimento em edição"
              onChange={e => { setPavAtivoId(e.target.value); enquadrarFaixa(rf, e.target.value, 300) }}
              className="w-auto text-sm font-semibold py-1 bg-transparent">
              {pavs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="text-[11px] text-ink-faint whitespace-nowrap">Quantidade de saídas (automático): <strong className="text-ink">{Math.max(1, contarSaidasPavimento(pavAtivo.acessos))}</strong></span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {erEstrutura && (
              <span className="text-[11px] text-ink-faint text-right" title="A escada/rampa é dimensionada uma única vez por estrutura, com a população do pavimento mais populoso (sem o piso de descarga) — vale pra todas.">
                Escada/rampa (única): <strong className="text-ink">{erEstrutura.pop} pessoas</strong> · {erEstrutura.pavimento.label} · <strong className="text-red">{fmtM(erEstrutura.er.la)}</strong>
              </span>
            )}
            <PisoDescargaSwitch checked={!!pavAtivo.pisoDescarga} onChange={v => dispatch({ type: 'SET_PISO_DESCARGA', pavimentoId: pavAtivo.id, estruturaId: estrutura.id, valor: v })}/>
          </div>
        </div>

        <FluxoCtx.Provider value={ctx}>
          <div className="flex flex-1 min-h-0">

            {/* Ambientes fora da área */}
            <aside {...dropProps(null, setSobreSoltos)}
              className={`w-[320px] shrink-0 flex flex-col border-r border-solid transition-colors ${sobreSoltos ? 'border-red bg-[rgba(192,21,42,.05)]' : 'border-border'}`}
            >
              <div className="p-3.5 border-b border-solid border-border">
                <div className="text-[13px] font-semibold text-ink">Ambientes fora da área</div>
                <div className="text-[11px] text-ink-faint mt-0.5">Arraste para a faixa do mesmo pavimento (ambiente solto, sem grupo) ou para um grupo dele. Sem ligação a um acesso, o ambiente tem acesso direto à área de relativa segurança — não gera pendência.</div>
              </div>
              <div className="px-3 pt-3">
                <CampoBusca value={filtroSoltos} onChange={setFiltroSoltos} placeholder="Filtrar ambientes da lista…"/>
              </div>
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {pavs.map(p => {
                  const lista = soltosFiltrados.filter(a => pavDe.get(a.id) === p.id)
                  if (!lista.length) return null
                  return (
                    <div key={p.id} className="flex flex-col gap-2">
                      <div className="text-[10px] text-ink-faint uppercase tracking-[.08em] font-semibold pt-1">{p.label}</div>
                      {lista.map(a => <AmbienteLinha key={a.id} amb={a} noGrupo={false}/>)}
                    </div>
                  )
                })}
                {soltos.length === 0 && <div className="text-[11px] text-ink-faint italic">Todos os ambientes já estão na área de trabalho.</div>}
                {soltos.length > 0 && soltosFiltrados.length === 0 && <div className="text-[11px] text-ink-faint italic">Nenhum ambiente da lista corresponde à busca.</div>}
              </div>
              {selecionados.size > 0 && (
                <div className="p-3 border-t border-solid border-border flex flex-col gap-2">
                  <span className="text-xs font-semibold text-ink">{selecionados.size} ambiente{selecionados.size > 1 ? 's' : ''} selecionado{selecionados.size > 1 ? 's' : ''}</span>
                  <select value={alvoSelecao} onChange={e => setAlvoSelecao(e.target.value)} className="text-xs py-1.5 bg-transparent">
                    <option value="">Mover para...</option>
                    <option value={NOVO_GRUPO}>+ Novo grupo (no pavimento de cada um)</option>
                    <option value={NA_AREA}>— Soltos na área —</option>
                    <option value={SEM_GRUPO}>— Voltar pra lista —</option>
                    {alvosGrupo.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <button className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed" disabled={!alvoSelecao} onClick={moverSelecionados}><Icon name="check" size={12}/> Mover</button>
                    <button className="bg-transparent border-none text-ink-faint hover:text-ink cursor-pointer text-xs underline ml-auto" onClick={limparSelecao}>Cancelar seleção</button>
                  </div>
                </div>
              )}
            </aside>

            {/* Área de trabalho */}
            <div ref={wrapRef} onDragOver={e => { if (e.dataTransfer.types.includes(MIME_AMBIENTES)) e.preventDefault() }} onDrop={soltarNoFundo} className={`fluxo-saidas flex-1 min-w-0 relative ${origemLigacao ? 'conectando' : ''}`}>
              <ReactFlow
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                onNodesChange={changes => setNodes(ns => applyNodeChanges(changes, ns))}
                onNodeDragStop={soltarNo} nodeDragThreshold={4}
                onNodeMouseEnter={(_, no) => setNoHover(no.id)} onNodeMouseLeave={() => setNoHover(null)}
                onConnectStart={(_, { nodeId }) => setOrigemLigacao(nodeId)} onConnectEnd={terminarLigacao}
                onEdgesDelete={desligar}
                // Delete só desliga a seta selecionada — nó some pelo botão de
                // lixeira (com confirmação), nunca por um Delete solto, e
                // selecionar um nó não leva as setas dele junto.
                onBeforeDelete={async ({ edges: es }) => ({ nodes: [], edges: es.filter(e => e.id === setaSelecionada) })}
                onEdgeClick={(_, edge) => setSetaSelecionada(edge.id)}
                onNodeClick={(_, no) => { setSetaSelecionada(null); if (pavDe.get(no.id)) setPavAtivoId(pavDe.get(no.id)) }}
                onPaneClick={() => setSetaSelecionada(null)}
                onMoveEnd={(_, vp) => {
                  const r = wrapRef.current.getBoundingClientRect()
                  const f = faixaEm({ x: (r.width / 2 - vp.x) / vp.zoom, y: (r.height / 2 - vp.y) / vp.zoom })
                  if (f) setPavAtivoId(f.pav.id)
                }}
                edgesReconnectable={false} deleteKeyCode={['Delete', 'Backspace']}
                // Abre focado na faixa do pavimento clicado (ou mostrando tudo).
                fitView={!focoPavId} fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.1}
                onInit={focoPavId ? inst => enquadrarFaixa(inst, focoPavId, 0) : undefined}
              >
                <Background gap={20}/>
                <Controls showInteractive={false}/>
                <MiniMap pannable zoomable nodeColor={n => (n.type === 'faixa' ? 'transparent' : n.type === 'grupo' ? 'var(--color-ink-hint)' : n.data.tipo === 'saida' ? 'var(--color-green)' : n.data.tipo === 'escada' ? 'var(--color-amber)' : 'var(--color-ink-faint)')}/>
                <Panel position="top-left" className="flex flex-wrap items-center gap-2">
                  <button className="btn-ghost" onClick={() => criarGrupo(pavAtivo.id)}><Icon name="plus" size={12}/> Grupo de ambientes</button>
                  <button className="btn-ghost" onClick={() => criarAmbiente(null, pavAtivo.id)}><Icon name="plus" size={12}/> Ambiente</button>
                  <button className="btn-ghost" onClick={() => criarNo(pavAtivo.id, 'acesso')}><Icon name="plus" size={12}/> Acesso</button>
                  <button className="btn-ghost" onClick={() => criarNo(pavAtivo.id, 'saida')}><Icon name="plus" size={12}/> Saída</button>
                  <button className="btn-ghost" onClick={() => criarNo(pavAtivo.id, 'escada')}><Icon name="plus" size={12}/> Escada/Rampa</button>
                  <span className="text-[11px] text-ink-faint">em <strong className="text-ink">{pavAtivo.label}</strong></span>
                </Panel>
                {setaSelecionada && (
                  <Panel position="top-center">
                    <button className="btn-ghost" onClick={() => desligar(edges.filter(e => e.id === setaSelecionada))}><Icon name="x" size={12}/> Desligar seta selecionada</button>
                  </Panel>
                )}
                <Panel position="bottom-center" className="text-[10px] text-ink-faint bg-surface/80 rounded px-2 py-1">
                  Passe o mouse num nó, arraste a alça vermelha e solte em cima de outro nó para ligar · saídas e escadas também se ligam às de outros pavimentos (tracejado) · clique numa seta e tecle Delete (ou use o botão) para desligar
                </Panel>
              </ReactFlow>
            </div>
          </div>
        </FluxoCtx.Provider>
      </div>

      {editAmb && (
        // stopPropagation aqui: esse overlay fica DENTRO do overlay do popup
        // principal (z-500) no DOM — sem isso, o clique borbulha até o
        // onClick={onClose} dele e fecha os dois popups de uma vez, em vez
        // de só este por cima.
        <div className="fixed inset-0 z-[600] bg-black/65 backdrop-blur-sm flex items-center justify-center" onClick={e => { e.stopPropagation(); setEditAmb(null) }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-solid border-border rounded-lg w-[560px] max-w-[95vw] p-5">
            <div className="flex items-center justify-between mb-4">
              <InlineEditableNome value={editAmb.nome} onCommit={renomearAmbiente} textClassName="font-heading text-base font-bold text-ink"/>
              <button onClick={() => setEditAmb(null)} className="bg-transparent border-none text-ink-faint hover:text-ink cursor-pointer p-1"><Icon name="x" size={14}/></button>
            </div>
            <AmbienteForm initial={editAmb} seNorma={seNorma} ocupacoes={ocupacoes} larguras={LARGURAS_MINIMAS}
              onSave={changes => { dispatch({ type: 'UPDATE_AMBIENTE_SE', pavimentoId: pavDe.get(editAmb.id), ambienteId: editAmb.id, changes }); setEditAmb(null) }}
              onCancel={() => setEditAmb(null)}/>
          </div>
        </div>
      )}
    </div>
  )
}

// `pavimentos` = pavimentos CRUS da estrutura (state.pavimentos filtrados, não o
// remodelado de derivarPavimentos), na ordem do estado (subsolos, térreo,
// demais) — o fluxo lê/grava `grupos`, `acessos`, `fluxoPos` e `pisoDescarga`
// tal como vivem no reducer. `focoPavId`: pavimento em que a tela abre.
// Detecção de incêndio e chuveiros automáticos não aparecem aqui: vêm das
// Medidas de Segurança da estrutura (ver SaidaEmergenciaPage.jsx).
export default function FluxogramaSaidas(props) {
  return (
    <ReactFlowProvider>
      <Fluxograma {...props}/>
    </ReactFlowProvider>
  )
}
