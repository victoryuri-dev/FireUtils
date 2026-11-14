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
  calcPopAmb, calcNoAmbientePT, calcDimsAcesso, dimsDoAcesso, contarSaidasPavimento, ehRaiz,
} from '../../data/se_calc'
import { criaCicloNoFluxo } from '../../data/se_fluxo'

// Fluxograma de saídas de um pavimento (Box de ambientes -> Acesso ->
// Saída/Escada). Área de trabalho livre: o usuário arrasta os nós, liga um
// ao outro com setas e escolhe por nó se ele é acesso, saída ou escada/
// rampa. O desenho grava direto no estado do projeto (state.pavimentos,
// ver reducer em ProjetoContext.jsx) — `grupo.acessoId`/`acesso.alimentaEm`
// são as setas, e o motor de cálculo (se_calc.js) e o memorial leem esses
// mesmos campos.

const MIME_AMBIENTES = 'application/x-fireutils-ambientes'
const FluxoCtx = createContext(null)

function novoAmbienteId() {
  return `amb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
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

// ── Ambiente (linha dentro de um box ou da lista de ambientes soltos) ──
// Arrastável por HTML5 DnD (solta num box ou na lista de soltos); marcar
// vários pelo checkbox e arrastar um leva a seleção inteira. Com pelo menos
// um marcado, o clique na linha marca/desmarca em vez de abrir o formulário.
function AmbienteLinha({ amb, noBox }) {
  const c = useContext(FluxoCtx)
  const pop = calcPopAmb(amb, c.taxa)
  const { pt } = calcNoAmbientePT(amb, c.taxa, c.larguras)
  const selecionado = c.selecionados.has(amb.id)
  return (
    <div draggable
      onDragStart={e => {
        e.dataTransfer.setData(MIME_AMBIENTES, JSON.stringify(c.idsDoArrasto(amb.id)))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => c.selecionados.size > 0 ? c.toggleSelecao(amb.id) : c.editarAmbiente(amb)}
      className={`nodrag group flex items-center justify-between gap-2 py-2 px-2.5 rounded-md border border-solid bg-surface cursor-pointer transition-colors ${selecionado ? 'border-red' : 'border-border-2 hover:border-ink-hint'}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox checked={selecionado} onChange={() => c.toggleSelecao(amb.id)} title="Selecionar pra mover em massa"/>
        <span className="font-heading text-[12px] font-semibold text-ink truncate min-w-0">{amb.nome}</span>
        {amb.origem === 'manual' && (
          <span title="Ambiente criado manualmente (não veio do Revit)" className="inline-flex items-center justify-center w-[18px] h-[18px] rounded border border-solid border-border-2 text-ink-faint shrink-0">
            <Icon name="user" size={10}/>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-[11px] text-ink-faint whitespace-nowrap">
        <span>{pop} pessoas</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-[.06em]">Porta</span>
          <strong className="font-heading text-[14px] font-bold text-red leading-none">{fmtM(pt.la)}</strong>
        </span>
        {noBox ? (
          <button onClick={e => { e.stopPropagation(); c.moverParaBox([amb.id], null) }} className="bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5" title="Tirar do box (volta pra lista de ambientes soltos)">
            <Icon name="exitBox" size={12}/>
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); c.removerAmbiente(amb.id) }} className="bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5" title="Excluir ambiente">
            <Icon name="trash" size={12}/>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Box de ambientes ───────────────────────────────────────────────────
// Agrupa ambientes e liga o conjunto a UM nó (seta pela alça da direita).
// Box sem ligação = ambientes com acesso direto à área de relativa
// segurança — não gera pendência.
function GrupoNode({ data }) {
  const c = useContext(FluxoCtx)
  const { grupo, ambientes, pop } = data
  const [sobre, setSobre] = useState(false)
  const drop = c.dropProps(grupo.id, setSobre)
  return (
    <div {...drop}
      className={`w-[340px] rounded-lg border border-solid bg-surface transition-colors ${sobre ? 'border-red bg-[rgba(192,21,42,.05)]' : 'border-border'}`}
    >
      <div className="flex items-center justify-between gap-2 py-2.5 px-3 bg-surface-2 rounded-t-lg border-b border-solid border-border-2 cursor-grab">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="grip" size={13} className="text-ink-faint shrink-0"/>
          <span className="nodrag min-w-0">
            <InlineEditableNome value={grupo.nome} onCommit={nome => c.dispatch({ type: 'RENOMEAR_GRUPO', pavimentoId: c.pavId, grupoId: grupo.id, nome })} textClassName="font-heading text-[14px] font-bold text-ink truncate"/>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-ink-faint whitespace-nowrap">{pop} pessoas</span>
          <button onClick={() => c.removerGrupo(grupo)} className="nodrag bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5" title="Remover box (os ambientes ficam soltos)">
            <Icon name="trash" size={12}/>
          </button>
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-2">
        {ambientes.map(a => <AmbienteLinha key={a.id} amb={a} noBox/>)}
        {ambientes.length === 0 && <div className="text-[11px] text-ink-faint italic py-1 text-center">Arraste ambientes para cá.</div>}
        <button className="nodrag btn-ghost justify-center" onClick={() => c.criarAmbiente(grupo.id)}><Icon name="plus" size={12}/> ADICIONAR AMBIENTE</button>
      </div>
      {!data.ligado && <div className="px-3 pb-2.5 text-[10px] text-ink-faint text-center">Sem ligação — acesso direto à área de relativa segurança</div>}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-red !border-2 !border-surface"/>
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
  const { acesso, tipo, dims, pop, entradas, raiz } = data
  const dispatch = c.dispatch
  const toggleDim = d => dispatch({ type: 'SET_ACESSO_DIM', pavimentoId: c.pavId, acessoId: acesso.id, dim: d, valor: !dims[d] })
  return (
    <div className={`w-[300px] rounded-lg border border-solid bg-surface ${tipo === 'acesso' ? 'border-border' : TOM_TIPO[tipo].faixa.split(' ')[0]}`}>
      <div className="flex items-center justify-between gap-2 py-2.5 px-3 bg-surface-2 rounded-t-lg cursor-grab">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="grip" size={13} className="text-ink-faint shrink-0"/>
          <span className="nodrag min-w-0">
            <InlineEditableNome value={acesso.nome} onCommit={nome => dispatch({ type: 'RENOMEAR_ACESSO', pavimentoId: c.pavId, acessoId: acesso.id, nome })} textClassName="font-heading text-[14px] font-bold text-ink truncate"/>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-ink-faint whitespace-nowrap">{pop} pessoas</span>
          <button onClick={() => c.removerAcesso(acesso)} className="nodrag bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-0.5" title="Remover (o que alimentava este nó fica sem ligação)">
            <Icon name="trash" size={12}/>
          </button>
        </div>
      </div>
      <div className="nodrag flex gap-1 px-3 pt-2.5">
        {TIPOS.map(t => (
          <button key={t.tipo} type="button"
            onClick={() => tipo !== t.tipo && dispatch({ type: 'SET_ACESSO_TIPO', pavimentoId: c.pavId, acessoId: acesso.id, tipo: t.tipo })}
            className={`flex-1 text-[10px] font-semibold py-1 px-1.5 rounded border border-solid cursor-pointer transition-colors ${tipo === t.tipo ? TOM_TIPO[t.tipo].ativo : 'bg-transparent border-border text-ink-faint hover:text-ink'}`}
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
      {!raiz && tipo === 'acesso' && !acesso.alimentaEm && (
        <div className="px-3 pb-2.5 text-[10px] text-amber text-center">Sem ligação a uma saída ou escada/rampa</div>
      )}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-ink-faint !border-2 !border-surface"/>
      {tipo === 'acesso' && <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-red !border-2 !border-surface"/>}
    </div>
  )
}

const nodeTypes = { grupo: GrupoNode, acesso: AcessoNode }

// ── Switch "piso de descarga" no cabeçalho ─────────────────────────────
function PisoDescargaSwitch({ checked, onChange }) {
  return (
    <div className="flex items-center gap-3 border border-solid border-border rounded-md py-2 px-3.5 shrink-0">
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

const NOVO_BOX = '__novo_box__'
const SEM_BOX = '__sem_box__'

const arredondar = pos => ({ x: Math.round(pos.x), y: Math.round(pos.y) })

function Fluxograma({ pav, seNorma, ocupacoes, dispatch, onClose }) {
  const { TAXA_POPULACIONAL, LARGURAS_MINIMAS } = seNorma
  const ambientes = useMemo(() => pav.ambientes || [], [pav.ambientes])
  const acessos = useMemo(() => pav.acessos || [], [pav.acessos])
  const grupos = useMemo(() => pav.grupos || [], [pav.grupos])
  const fluxoPos = pav.fluxoPos
  const { search } = useLocation()
  const alvoAudit = new URLSearchParams(search).get('audit') || ''
  const [editAmb, setEditAmb] = useState(() => ambientes.find(a => alvoAudit.startsWith(`${a.id}.`)) || null)
  const [selecionados, setSelecionados] = useState(new Set())
  const [alvoSelecao, setAlvoSelecao] = useState('')
  const wrapRef = useRef(null)
  const rf = useReactFlow()

  const soltos = ambientes.filter(a => !a.grupoId)
  const nSaidas = Math.max(1, contarSaidasPavimento(acessos))

  // ── Seleção em massa / arrasto de ambientes ──
  const toggleSelecao = id => setSelecionados(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const limparSelecao = () => setSelecionados(new Set())
  const idsDoArrasto = id => (selecionados.size > 1 && selecionados.has(id) ? [...selecionados] : [id])

  // ── Posição de nó novo: centro da área visível, com um leve desvio pra
  // não empilhar vários nós criados em sequência.
  const posicaoNova = () => {
    const r = wrapRef.current.getBoundingClientRect()
    const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    return arredondar({ x: p.x - 150 + Math.random() * 60, y: p.y - 80 + Math.random() * 60 })
  }

  const criarNo = tipo => {
    const n = acessos.filter(a => a.tipo === tipo).length + 1
    const nome = { acesso: `Acesso ${n}`, saida: `Saída ${String(n).padStart(2, '0')}`, escada: `Escada/Rampa ${String(n).padStart(2, '0')}` }[tipo]
    dispatch({ type: 'CRIAR_NO_FLUXO', pavimentoId: pav.id, tipo, nome, pos: posicaoNova() })
  }
  const criarBox = ambienteIds => {
    dispatch({ type: 'CRIAR_GRUPO_AMBIENTES', pavimentoId: pav.id, nome: `Ambientes ${grupos.length + 1}`, pos: posicaoNova(), ambienteIds })
  }

  // ── Ambientes ──
  const criarAmbiente = (grupoId = null) => {
    const id = novoAmbienteId()
    const nome = `Ambiente ${ambientes.length + 1}`
    dispatch({
      type: 'ADD_AMBIENTE_SE', pavimentoId: pav.id, id,
      ambiente: { nome, divisao: '', popTipo: 'area', area: 0, assentos: 0, popManual: 0, grupoId, origem: 'manual' },
    })
    setEditAmb({ id, nome, divisao: '', popTipo: 'area', area: 0, assentos: 0, popManual: 0 })
  }
  const removerAmbiente = id => {
    dispatch({ type: 'REMOVE_AMBIENTE_SE', pavimentoId: pav.id, ambienteId: id })
    if (editAmb?.id === id) setEditAmb(null)
    setSelecionados(prev => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next })
  }
  const moverParaBox = (ids, grupoId) => {
    dispatch({ type: 'MOVER_AMBIENTES_GRUPO', pavimentoId: pav.id, ambienteIds: ids, grupoId })
    limparSelecao()
  }
  const moverSelecionados = () => {
    if (!selecionados.size || !alvoSelecao) return
    if (alvoSelecao === NOVO_BOX) criarBox([...selecionados])
    else moverParaBox([...selecionados], alvoSelecao === SEM_BOX ? null : alvoSelecao)
    limparSelecao()
    setAlvoSelecao('')
  }
  const renomearAmbiente = nome => {
    dispatch({ type: 'UPDATE_AMBIENTE_SE', pavimentoId: pav.id, ambienteId: editAmb.id, changes: { nome } })
    setEditAmb(prev => ({ ...prev, nome }))
  }

  const removerGrupo = grupo => {
    const n = ambientes.filter(a => a.grupoId === grupo.id).length
    if (n > 0 && !window.confirm(`Remover o box "${grupo.nome}"? Os ${n} ambiente(s) dentro dele ficarão soltos, mas não serão apagados.`)) return
    dispatch({ type: 'REMOVER_GRUPO', pavimentoId: pav.id, grupoId: grupo.id })
  }
  const removerAcesso = acesso => {
    if (window.confirm(`Remover "${acesso.nome}"? O que alimentava este nó ficará sem ligação, mas não será apagado.`)) {
      dispatch({ type: 'REMOVER_ACESSO', pavimentoId: pav.id, acessoId: acesso.id })
    }
  }

  // Props de uma zona que recebe ambientes arrastados (box ou lista de soltos).
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
      moverParaBox(ids, grupoId)
    },
  })

  const ctx = {
    pavId: pav.id, dispatch, taxa: TAXA_POPULACIONAL, larguras: LARGURAS_MINIMAS, selecionados,
    toggleSelecao, idsDoArrasto, editarAmbiente: setEditAmb, criarAmbiente, removerAmbiente,
    moverParaBox, removerGrupo, removerAcesso, dropProps,
  }

  // ── Nós e setas a partir do estado do projeto ──
  const nosBase = useMemo(() => {
    const pos = id => fluxoPos?.[id] || { x: 0, y: 0 }
    return [
      ...grupos.map(g => {
        const ambs = ambientes.filter(a => a.grupoId === g.id)
        return {
          id: g.id, type: 'grupo', position: pos(g.id),
          data: { grupo: g, ambientes: ambs, ligado: !!g.acessoId, pop: ambs.reduce((s, a) => s + calcPopAmb(a, TAXA_POPULACIONAL), 0) },
        }
      }),
      ...acessos.map(ac => {
        const dims = dimsDoAcesso(ac, !!pav.pisoDescarga)
        const { pop, ad, er, pt } = calcDimsAcesso(ac.id, ambientes, acessos, TAXA_POPULACIONAL, LARGURAS_MINIMAS, dims)
        return {
          id: ac.id, type: 'acesso', position: pos(ac.id),
          data: {
            acesso: ac, tipo: ac.tipo, dims, pop, raiz: ehRaiz(ac),
            entradas: [
              ad && { label: 'ACESSO/DESCARGA', value: fmtM(ad.la) },
              pt && { label: 'PORTAS', value: fmtM(pt.la) },
              er && { label: 'ESCADA/RAMPA', value: fmtM(er.la) },
            ].filter(Boolean),
          },
        }
      }),
    ]
  }, [grupos, acessos, ambientes, fluxoPos, pav.pisoDescarga, TAXA_POPULACIONAL, LARGURAS_MINIMAS])

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
  const edges = useMemo(() => {
    const existe = new Set(acessos.map(a => a.id))
    const liga = [
      ...grupos.filter(g => existe.has(g.acessoId)).map(g => ({ id: `e-${g.id}`, source: g.id, target: g.acessoId })),
      ...acessos.filter(a => existe.has(a.alimentaEm)).map(a => ({ id: `e-${a.id}`, source: a.id, target: a.alimentaEm })),
    ]
    return liga.map(e => ({ ...e, type: 'smoothstep', selected: e.id === setaSelecionada, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }))
  }, [grupos, acessos, setaSelecionada])

  // Cada nó alimenta no máximo UM seguinte; origem = box ou acesso (saída/
  // escada não têm alça de saída), destino = acesso/saída/escada, sem ciclo.
  const conexaoValida = ({ source, target }) => {
    if (source === target) return false
    const destino = acessos.find(a => a.id === target)
    if (!destino) return false
    if (grupos.some(g => g.id === source)) return true
    const origem = acessos.find(a => a.id === source)
    return !!origem && origem.tipo === 'acesso' && !criaCicloNoFluxo(acessos, origem.id, destino.id)
  }
  const ligar = ({ source, target }) => {
    if (!conexaoValida({ source, target })) return
    if (grupos.some(g => g.id === source)) dispatch({ type: 'LIGAR_GRUPO', pavimentoId: pav.id, grupoId: source, acessoId: target })
    else dispatch({ type: 'MOVER_ACESSO', pavimentoId: pav.id, acessoId: source, novoAlimentaEm: target })
  }
  const desligar = removidas => removidas.forEach(e => {
    setSetaSelecionada(null)
    if (grupos.some(g => g.id === e.source)) dispatch({ type: 'LIGAR_GRUPO', pavimentoId: pav.id, grupoId: e.source, acessoId: null })
    else dispatch({ type: 'MOVER_ACESSO', pavimentoId: pav.id, acessoId: e.source, novoAlimentaEm: null })
  })

  const [sobreSoltos, setSobreSoltos] = useState(false)
  const alvosBox = grupos.map(g => ({ id: g.id, label: g.nome }))

  return (
    <div className="fixed inset-0 z-[500] bg-black/65 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative bg-surface border border-solid border-border rounded-lg w-[98vw] h-[96vh] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,.55)]">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 py-3 px-5 border-b border-solid border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={onClose} className="btn-ghost p-1.5 shrink-0"><Icon name="left" size={14}/></button>
            <span className="text-base font-bold text-ink truncate">{pav.label}</span>
            <span className="text-[11px] text-ink-faint whitespace-nowrap">Quantidade de saídas (automático): <strong className="text-ink">{nSaidas}</strong></span>
          </div>
          <PisoDescargaSwitch checked={!!pav.pisoDescarga} onChange={v => dispatch({ type: 'SET_PISO_DESCARGA', pavimentoId: pav.id, estruturaId: pav.estruturaId, valor: v })}/>
        </div>

        <FluxoCtx.Provider value={ctx}>
          <div className="flex flex-1 min-h-0">

            {/* Ambientes soltos */}
            <aside {...dropProps(null, setSobreSoltos)}
              className={`w-[320px] shrink-0 flex flex-col border-r border-solid transition-colors ${sobreSoltos ? 'border-red bg-[rgba(192,21,42,.05)]' : 'border-border'}`}
            >
              <div className="p-3.5 border-b border-solid border-border">
                <div className="text-[13px] font-semibold text-ink">Ambientes sem box</div>
                <div className="text-[11px] text-ink-faint mt-0.5">Arraste para um box. Fora de qualquer box, o ambiente tem acesso direto à área de relativa segurança — não gera pendência.</div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {soltos.map(a => <AmbienteLinha key={a.id} amb={a} noBox={false}/>)}
                {soltos.length === 0 && <div className="text-[11px] text-ink-faint italic">Todos os ambientes já estão em um box.</div>}
              </div>
              <div className="p-3 border-t border-solid border-border flex flex-col gap-2">
                <button className="btn-ghost justify-center" onClick={() => criarAmbiente(null)}><Icon name="plus" size={12}/> Adicionar Ambiente</button>
                {selecionados.size > 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-solid border-border">
                    <span className="text-xs font-semibold text-ink">{selecionados.size} ambiente{selecionados.size > 1 ? 's' : ''} selecionado{selecionados.size > 1 ? 's' : ''}</span>
                    <select value={alvoSelecao} onChange={e => setAlvoSelecao(e.target.value)} className="text-xs py-1.5 bg-transparent">
                      <option value="">Mover para...</option>
                      <option value={NOVO_BOX}>+ Novo box</option>
                      <option value={SEM_BOX}>— Sem box —</option>
                      {alvosBox.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed" disabled={!alvoSelecao} onClick={moverSelecionados}><Icon name="check" size={12}/> Mover</button>
                      <button className="bg-transparent border-none text-ink-faint hover:text-ink cursor-pointer text-xs underline ml-auto" onClick={limparSelecao}>Cancelar seleção</button>
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Área de trabalho */}
            <div ref={wrapRef} className="fluxo-saidas flex-1 min-w-0 relative">
              <ReactFlow
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                onNodesChange={changes => setNodes(ns => applyNodeChanges(changes, ns))}
                onNodeDragStop={(_, __, arrastados) => dispatch({
                  type: 'SET_POSICOES_FLUXO', pavimentoId: pav.id,
                  posicoes: Object.fromEntries(arrastados.map(n => [n.id, arredondar(n.position)])),
                })}
                isValidConnection={conexaoValida} onConnect={ligar}
                onEdgesDelete={desligar}
                // Delete só desliga a seta selecionada — nó some pelo botão de
                // lixeira (com confirmação), nunca por um Delete solto, e
                // selecionar um nó não leva as setas dele junto.
                onBeforeDelete={async ({ edges: es }) => ({ nodes: [], edges: es.filter(e => e.id === setaSelecionada) })}
                onEdgeClick={(_, edge) => setSetaSelecionada(edge.id)}
                onNodeClick={() => setSetaSelecionada(null)} onPaneClick={() => setSetaSelecionada(null)}
                edgesReconnectable={false} deleteKeyCode={['Delete', 'Backspace']}
                fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.2}
              >
                <Background gap={20}/>
                <Controls showInteractive={false}/>
                <MiniMap pannable zoomable nodeColor={n => (n.type === 'grupo' ? 'var(--color-ink-hint)' : n.data.tipo === 'saida' ? 'var(--color-green)' : n.data.tipo === 'escada' ? 'var(--color-amber)' : 'var(--color-ink-faint)')}/>
                <Panel position="top-left" className="flex flex-wrap gap-2">
                  <button className="btn-ghost" onClick={() => criarBox()}><Icon name="plus" size={12}/> Box de ambientes</button>
                  <button className="btn-ghost" onClick={() => criarNo('acesso')}><Icon name="plus" size={12}/> Acesso</button>
                  <button className="btn-ghost" onClick={() => criarNo('saida')}><Icon name="plus" size={12}/> Saída</button>
                  <button className="btn-ghost" onClick={() => criarNo('escada')}><Icon name="plus" size={12}/> Escada/Rampa</button>
                </Panel>
                {setaSelecionada && (
                  <Panel position="top-center">
                    <button className="btn-ghost" onClick={() => desligar(edges.filter(e => e.id === setaSelecionada))}><Icon name="x" size={12}/> Desligar seta selecionada</button>
                  </Panel>
                )}
                <Panel position="top-right" className="text-[10px] text-ink-faint bg-surface/80 rounded px-2 py-1">
                  Arraste da alça vermelha de um nó até outro para ligar · clique numa seta e tecle Delete (ou use o botão) para desligar
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
              onSave={changes => { dispatch({ type: 'UPDATE_AMBIENTE_SE', pavimentoId: pav.id, ambienteId: editAmb.id, changes }); setEditAmb(null) }}
              onCancel={() => setEditAmb(null)}/>
          </div>
        </div>
      )}
    </div>
  )
}

// `pav` é o pavimento CRU (state.pavimentos[i], não o remodelado de
// derivarPavimentos) — o fluxo lê/grava `grupos`, `acessos`, `fluxoPos` e
// `pisoDescarga` tal como vivem no reducer. Detecção de incêndio e
// chuveiros automáticos não aparecem aqui: vêm das Medidas de Segurança da
// estrutura (ver SaidaEmergenciaPage.jsx).
export default function FluxogramaSaidas(props) {
  return (
    <ReactFlowProvider>
      <Fluxograma {...props}/>
    </ReactFlowProvider>
  )
}
