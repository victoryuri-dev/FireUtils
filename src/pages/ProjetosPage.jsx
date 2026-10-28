import { useState, useMemo, useEffect, useRef } from 'react'
import useEntradaEmLote from '../hooks/useEntradaEmLote'
import Icon from '../components/ui/Icon'
import Loader from '../components/ui/Loader'
import { useNorma } from '../hooks/useNorma'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { newIds, useProjeto, hydrateState } from '../context/ProjetoContext'
import { percentualCompletude } from '../utils/completude'
import { statusCatalogo, carregarNormasRemotas } from '../lib/normasRemote'
import { enquadrarTipoProjeto } from '../data/tipoProjeto'
import { getEstadosDisponiveis } from '../data/normas/index'
import { fmtUn } from '../utils/numero'
import { usePerfil } from '../hooks/usePerfil'

// ── helpers ───────────────────────────────────────────────────────────

// Area construida total do projeto: sempre o valor gravado no campo (manual
// ou somado das estruturas pelo switch da Etapa 2) — a soma das estruturas
// so entra como fallback quando esse campo ainda nao foi preenchido.
function totalArea(proj) {
  const soma = (proj.estruturas || []).reduce((s, e) => s + (parseFloat(e.areaTotal) || 0), 0)
  return parseFloat(proj.areaConstruidaTotal) || soma
}

// Mesma completude do dashboard (utils/completude.js), sobre o projeto
// hidratado como o editor o vê. Cache por projeto + versão das normas: a
// conta muda quando as normas da UF terminam de carregar.
let versaoNormasLista = 0
const cacheCompletude = new WeakMap()
function calcCompletude(proj, versao = versaoNormasLista) {
  const c = cacheCompletude.get(proj)
  if (c && c.versao === versao) return c.pct
  const pct = percentualCompletude(hydrateState(proj))
  cacheCompletude.set(proj, { versao, pct })
  return pct
}

function barToneClasses(pct) {
  if (pct === 100) return { text:'text-green', bg:'bg-green', ring:'var(--project-ring-green)' }
  if (pct >= 30)   return { text:'text-amber', bg:'bg-amber', ring:'var(--project-ring-amber)' }
  return { text:'text-red', bg:'bg-red', ring:'var(--color-red)' }
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30)   return `há ${d} dia${d !== 1 ? 's' : ''}`
  const mo = Math.floor(d / 30)
  return `há ${mo} ${mo !== 1 ? 'meses' : 'mês'}`
}

function fmtArea(v) {
  if (!v) return '—'
  return fmtUn(v, 'm²', 2, '—')
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Ocupação do projeto: uma única divisão em comum, ou "Mista" quando há
// mais de uma divisão diferente entre os pavimentos.
function ocupacaoInfo(pavimentos) {
  const divs = [...new Set((pavimentos || []).map(p => p.divisao).filter(Boolean))]
  if (divs.length > 1) return 'Mista'
  if (divs.length === 1) return divs[0]
  return '—'
}

// Maior carga de incêndio entre todas as estruturas/divisões do projeto —
// mesma leitura direta do cargaState usada antes da Etapa 5 resolver por
// CNAE (não depende de contexto de norma carregado).
function maxCarga(cargaState) {
  return Object.values(cargaState || {}).flatMap(porEst => Object.values(porEst || {})).reduce((acc, c) => {
    const q = c?.metodo === 'levantamento' ? parseFloat(c?.valorManual) || 0 : c?.cargaIncendio || 0
    return Math.max(acc, q)
  }, 0)
}

// Mesmos limiares de risco (300/1200 MJ/m²) usados no resto do app
// (Etapa 5, Dashboard, EstruturaHeaderInfo).
function riscoInfo(q) {
  if (!q) return { label: '—', tone: 'neutral' }
  if (q <= 300)  return { label: 'Baixo', tone: 'green' }
  if (q <= 1200) return { label: 'Médio', tone: 'amber' }
  return { label: 'Alto', tone: 'red' }
}

const CHIP_TONE = {
  green:   'bg-green-dim border-green-border text-green',
  amber:   'bg-amber-dim border-amber-border text-amber',
  red:     'bg-red-dim border-red-border text-red',
  neutral: 'bg-surface-2 border-border text-ink-faint',
}

function Chip({ tone = 'neutral', icon, children }) {
  return (
    <span className={`inline-flex items-center w-fit gap-1 text-[10px] font-bold uppercase py-0.5 px-2.5 rounded-[20px] whitespace-nowrap border border-solid shrink-0 ${CHIP_TONE[tone]}`}>
      {icon && <Icon name={icon} size={11}/>}
      {children}
    </span>
  )
}

// ── Ícones inline ─────────────────────────────────────────────────────

const IcoGrid = ({ active }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--color-ink)' : 'var(--color-ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const IcoList = ({ active }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--color-ink)' : 'var(--color-ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
    <rect x="3" y="5" width="3" height="3" rx=".5"/><rect x="3" y="11" width="3" height="3" rx=".5"/><rect x="3" y="17" width="3" height="3" rx=".5"/>
  </svg>
)

// ── Pill de status (filtro clicável) ────────────────────────────────────
// Substitui os antigos quadrados grandes de estatística: agora é um filtro
// — clicar ativa (borda + fundo na cor do status) e filtra a lista; clicar
// de novo desativa.
function StatusPill({ dot, tone, label, active, onClick }) {
  const activeClass = {
    green: 'border-green-border bg-green-dim text-green',
    amber: 'border-amber-border bg-amber-dim text-amber',
    muted: 'border-border bg-surface-2 text-ink',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[11px] py-1 px-2.5 rounded-[20px] border border-solid whitespace-nowrap cursor-pointer transition-colors duration-150 ${active ? activeClass : 'border-border bg-surface text-ink-faint hover:border-ink-hint hover:text-ink-muted'}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${dot}`}/>
      {label}
    </button>
  )
}

// ── Menu de ações do card (excluir / duplicar) ─────────────────────────
// Botão de "3 pontos" que, ao ser hovereado, se transforma numa bandeja com
// os dois ícones de ação — a bandeja tem um fundo em degradê que vai de
// opaco (perto dos ícones, à direita) a transparente (à esquerda).
function CardActions({ onDelete, onDuplicate, fixado = false, onFixar, layout = 'linha', className = '' }) {
  // Abre só ao clicar nos 3 pontinhos; fecha ao clicar fora, apertar Esc ou
  // usar uma ação.
  const [clicado, setClicado] = useState(false)
  const open = clicado
  const raizRef = useRef(null)

  useEffect(() => {
    if (!clicado) return
    const fora = e => { if (!raizRef.current?.contains(e.target)) setClicado(false) }
    const esc = e => { if (e.key === 'Escape') setClicado(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [clicado])

  const acao = fn => () => { setClicado(false); fn?.() }

  const itens = [
    onFixar && { chave: 'fixar', icone: fixado ? 'pinOff' : 'pin', rotulo: fixado ? 'Desafixar' : 'Fixar no topo', fn: onFixar },
    { chave: 'duplicar', icone: 'copy', rotulo: 'Duplicar', fn: onDuplicate },
    { chave: 'excluir', icone: 'trash', rotulo: 'Excluir', fn: onDelete, perigo: true },
  ].filter(Boolean)

  const botaoPontos = (
    <button
      type="button"
      title="Mais opções"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setClicado(c => !c)}
      className={`flex items-center justify-center w-[26px] h-[26px] rounded-md border border-solid cursor-pointer transition-colors duration-150 ${open ? 'bg-surface-2 border-border text-ink' : 'bg-transparent border-transparent text-ink-faint hover:bg-surface-2 hover:text-ink'}`}
    >
      <Icon name="moreVert" size={14}/>
    </button>
  )

  const botaoAcao = it => (
    <button key={it.chave} type="button" role="menuitem" onClick={acao(it.fn)} title={it.chave === 'fixar' ? (fixado ? 'Desafixar projeto' : 'Fixar no topo') : `${it.rotulo} projeto`}
      className={`flex items-center justify-center w-[26px] h-[26px] rounded-md bg-surface border border-solid border-transparent text-ink-faint cursor-pointer transition-colors duration-150 ${it.perigo ? 'hover:bg-red-dim hover:text-red hover:border-red-border' : 'hover:bg-surface-2 hover:text-ink hover:border-border'}`}>
      <Icon name={it.icone} size={12}/>
    </button>
  )

  // Só ícones, sem balão: em coluna abaixo dos 3 pontinhos (grade) ou em
  // linha à esquerda deles (lista). Os 3 pontinhos ficam sempre à vista e
  // fecham o menu.
  return (
    <div ref={raizRef} data-menu-aberto={open || undefined} onClick={e => e.stopPropagation()} className={`h-[26px] w-[26px] shrink-0 ${className}`}>
      {botaoPontos}
      {open && (
        <div role="menu" className={layout === 'coluna'
          ? 'absolute right-0 top-[30px] z-20 flex flex-col gap-1'
          : 'absolute right-[30px] top-0 z-20 flex items-center gap-1'}>
          {itens.map(botaoAcao)}
        </div>
      )}
    </div>
  )
}

// ── Project card (grid) ───────────────────────────────────────────────

// Pavimentos (com subsolos) da estrutura que tem mais pavimentos; "Térrea" se e so 1.
function pavimentosLabel(proj) {
  const total = (proj.estruturas || []).reduce((mx, e) => Math.max(mx, (parseInt(e.nPavimentos) || 1) + (parseInt(e.nSubsolos) || 0)), 0)
  if (!total) return null
  return total === 1 ? 'Térrea' : `${total} pavimentos`
}

// Rótulo do tipo de projeto: dimensionamento, ou o enquadramento técnico /
// simplificado pelos limiares da tabela de medidas do estado (o mesmo do
// memorial). '—' enquanto as normas da UF não carregaram ou falta área/altura.
function rotuloProjeto(proj) {
  if (proj.tipoProjeto === 'dimensionamento') return 'Dimensionamento'
  const { tipo } = enquadrarTipoProjeto(proj.uf, proj.estruturas)
  return tipo === 'simplificado' ? 'Simplificado' : tipo === 'tecnico' ? 'Técnico' : '—'
}

function ProjectCard({ proj, onOpen, onDelete, onDuplicate, fixado, onFixar }) {
  const pavLabel = pavimentosLabel(proj)
  const [replay, setReplay] = useState(0)
  const pct    = calcCompletude(proj)
  const bar    = barToneClasses(pct)
  const ocup   = ocupacaoInfo(proj.pavimentos)
  const risco  = riscoInfo(maxCarga(proj.cargaState))

  return (
    <div
      onClick={() => onOpen(proj)}
      onMouseEnter={() => setReplay(n => n + 1)}
      className="card-projeto group relative bg-surface hover:bg-surface border border-solid border-border hover:border-ink-hint hover:shadow-[var(--shadow-sm)] rounded-lg p-4 cursor-pointer transition-[border-color,box-shadow] duration-150 flex flex-col gap-3.5"
    >
      {/* Ações (excluir / duplicar) */}
      <CardActions
        className="absolute top-2.5 right-2.5 z-10"
        onDelete={() => onDelete(proj)}
        onDuplicate={() => onDuplicate(proj)}
        fixado={fixado}
        onFixar={() => onFixar(proj)}
        layout="coluna"
      />

      {/* Nome — exatamente como foi digitado, sem forçar caixa alta */}
      <div className="flex items-center gap-2.5 pr-7 min-w-0">
        <ProgressoAnel pct={pct} color={bar.ring} replay={replay}/>
        <div className="font-heading text-[15px] font-bold text-ink leading-[1.3] truncate">
          {proj.nome || <span className="text-ink-faint font-normal">Sem nome</span>}
        </div>
        {fixado && <span className="shrink-0 text-ink-faint" title="Projeto fixado"><Icon name="pin" size={12}/></span>}
      </div>

      {/* Ocupação e risco */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Chip tone="red">{ocup}</Chip>
        <Chip tone={risco.tone} icon="flame">{risco.label}</Chip>
        {pavLabel && <Chip icon="stair">{pavLabel}</Chip>}
      </div>

      {/* Números-chave */}
      <dl className="m-0 grid grid-cols-[auto_auto_auto] justify-start gap-x-6">
        <StatBloco label="UF" value={proj.uf || '—'}/>
        <StatBloco label="Projeto" value={rotuloProjeto(proj)}/>
        <StatBloco label="A.C.T." value={fmtArea(totalArea(proj))}/>
      </dl>

      {/* Rodapé */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-solid border-border text-[11px] text-ink-faint">
        <span>Criado em {fmtDate(proj.createdAt)}</span>
        <span>Editado {timeAgo(proj.updatedAt)}</span>
      </div>
    </div>
  )
}

// Anel de completude do projeto; 100% vira um check.
function ProgressoAnel({ pct, color, replay = 0 }) {
  const r = 9.5, c = 2 * Math.PI * r
  return (
    <span className="relative shrink-0 w-5 h-5" style={{ color }} title={`Completude: ${pct}%`} role="img" aria-label={`Completude ${pct}%`}>
      <svg width="20" height="20" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5"/>
        <circle key={replay} cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          className="anel-progresso" style={{ '--anel-c': c, '--anel-off': c * (1 - pct / 100) }}/>
      </svg>
      {pct === 100 && <Icon name="check" size={9} strokeWidth={2.25} className="absolute inset-0 m-auto"/>}
    </span>
  )
}

// Numero-chave do cartao: rotulo pequeno em cima, valor em destaque embaixo.
function StatBloco({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] text-ink-faint uppercase tracking-[.08em] leading-none mb-1.5">{label}</dt>
      <dd className="m-0 font-heading text-[14px] font-bold text-ink leading-none whitespace-nowrap">{value}</dd>
    </div>
  )
}

// ── Project row (list) ────────────────────────────────────────────────
// Mesmos campos do card da grade (Nome, Risco, Ocupação, UF, A.C.T.,
// Completude), só que em linha — cada linha é seu próprio card com borda
// e espaço entre elas, e o cabeçalho nomeia as colunas uma única vez (sem
// repetir rótulo por linha).

const LIST_GRID_COLS = 'grid-cols-[1fr_110px_110px_60px_130px_1fr_32px]'

function ListHeader() {
  const cols = ['Nome do projeto', 'Risco', 'Ocupação', 'UF', 'A.C.T.', 'Completude', '']
  return (
    <div className={`grid ${LIST_GRID_COLS} gap-3.5 items-center px-4`}>
      {cols.map((h, i) => (
        <span key={i} className="text-[11px] text-ink-faint uppercase tracking-[.05em] whitespace-nowrap">
          {h}
        </span>
      ))}
    </div>
  )
}

function ProjectRow({ proj, onOpen, onDelete, onDuplicate, fixado, onFixar }) {
  const pct   = calcCompletude(proj)
  const bar   = barToneClasses(pct)
  const ocup  = ocupacaoInfo(proj.pavimentos)
  const risco = riscoInfo(maxCarga(proj.cargaState))

  return (
    <div
      onClick={() => onOpen(proj)}
      className={`group grid ${LIST_GRID_COLS} gap-3.5 items-center py-3.5 px-4 bg-surface border border-solid border-border hover:border-ink-hint hover:shadow-[var(--shadow-sm)] rounded-lg cursor-pointer transition-[border-color,box-shadow] duration-150`}
    >
      {/* Nome — exatamente como foi digitado */}
      <span className="font-heading text-[13px] font-bold text-ink overflow-hidden text-ellipsis whitespace-nowrap">
        {fixado && <span className="inline-flex align-[-1px] mr-1.5 text-ink-faint" title="Projeto fixado"><Icon name="pin" size={11}/></span>}
        {proj.nome || <span className="text-ink-faint font-normal">Sem nome</span>}
      </span>

      {/* Risco */}
      <Chip tone={risco.tone} icon="flame">{risco.label}</Chip>

      {/* Ocupação */}
      <Chip tone="red">{ocup}</Chip>

      {/* UF */}
      <span className="text-[13px] font-bold text-ink whitespace-nowrap">{proj.uf || '—'}</span>

      {/* A.C.T. */}
      <span className="text-[13px] font-bold text-ink whitespace-nowrap">{fmtArea(totalArea(proj))}</span>

      {/* Completude */}
      <div className="h-[3px] bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar.bg}`} style={{width:`${pct}%`}}/>
      </div>

      {/* Ações */}
      <div className="flex justify-center">
        <CardActions className="relative" layout="linha" onDelete={() => onDelete(proj)} onDuplicate={() => onDuplicate(proj)} fixado={fixado} onFixar={() => onFixar(proj)}/>
      </div>
    </div>
  )
}

// ── Escolha do estado (antes de criar o projeto) ───────────────────────
// O estado é perguntado ANTES de abrir a ferramenta e fica gravado no
// projeto pra sempre (ver SET_FIELD 'uf' em ProjetoContext.jsx): ele define
// a norma usada em todo o wizard e o modelo de documento gerado no fim
// (memorial em texto corrido do MA x formulário oficial do CBMPB). Só ficam
// habilitados os estados com norma cadastrada pro tipo de projeto escolhido.
function EscolhaEstadoModal({ tipo, onEscolher, onCancel }) {
  // Disponibilidade de cada estado = catálogo da base normativa (Supabase).
  const { recarregarNormas } = useProjeto()
  const catalogo = statusCatalogo()
  const estados = getEstadosDisponiveis()
  const disponivel = e => (tipo === 'dimensionamento' ? e.ativo || e.ativoDimensionamento : e.ativo)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={onCancel}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="escolha-estado-titulo"
        onClick={e => e.stopPropagation()}
        className="bg-surface border border-solid border-border rounded-lg py-7 px-8 w-[440px] max-w-[90vw] shadow-[var(--shadow-md)]"
      >
        <div className="text-center mb-5">
          <div id="escolha-estado-titulo" className="font-heading text-base font-semibold text-ink mb-2">
            Em qual estado fica a edificação?
          </div>
          <div className="text-[13px] text-ink-faint leading-[1.6]">
            A norma aplicada e o modelo dos documentos dependem do estado. Ele não poderá ser alterado depois de criado o projeto.
          </div>
        </div>

        {catalogo !== 'ok' ? (
          <div className="flex flex-col items-center gap-3 py-6 mb-5">
            {catalogo === 'carregando'
              ? <Loader size={28}/>
              : <>
                  <span className="text-[13px] text-ink-faint text-center">Não foi possível carregar a lista de estados da base normativa.</span>
                  <button className="btn-ghost" onClick={recarregarNormas}>Tentar de novo</button>
                </>}
          </div>
        ) : (
        <div className="flex flex-col gap-2 mb-5">
          {estados.map(e => {
            const ok = disponivel(e)
            return (
              <button
                key={e.uf}
                type="button"
                disabled={!ok}
                onClick={() => onEscolher(e.uf)}
                title={ok ? undefined : 'Norma deste estado ainda não disponível'}
                className={`flex items-center justify-between gap-3 py-3 px-4 rounded-md border border-solid text-left transition-colors ${ok ? 'border-border bg-transparent cursor-pointer hover:border-red-border hover:bg-red-dim' : 'border-border bg-surface-2 cursor-not-allowed'}`}
              >
                <span className={`font-heading text-[14px] font-medium ${ok ? 'text-ink' : 'text-ink-hint'}`}>{e.nome}</span>
                {ok
                  ? <span className="text-[11px] text-ink-faint">{e.uf}</span>
                  : <span className="flex items-center gap-1 text-[11px] text-ink-hint"><Icon name="lock" size={13}/> em breve</span>}
              </button>
            )
          })}
        </div>
        )}

        <button className="btn-ghost w-full justify-center" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Modal de confirmação (excluir / duplicar) ──────────────────────────
// Ambas as ações do card (excluir e duplicar) passam por aqui antes de
// acontecer — o usuário sempre precisa confirmar.

function ConfirmModal({ tone, icon, title, message, confirmLabel, onConfirm, onCancel }) {
  const toneClass = tone === 'red'
    ? { dot: 'bg-red-dim border-red-border text-red', btn: 'bg-red hover:brightness-90' }
    : { dot: 'bg-blue-dim border-blue-border text-blue', btn: 'bg-ink-muted hover:bg-ink text-bg' }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-surface border border-solid border-border rounded-lg py-7 px-8 w-[400px] max-w-[90vw] shadow-[var(--shadow-md)]"
      >
        {/* Ícone */}
        <div className={`w-11 h-11 rounded-full border border-solid flex items-center justify-center mx-auto mb-[18px] ${toneClass.dot}`}>
          <Icon name={icon} size={18}/>
        </div>

        <div className="text-center mb-5">
          <div className="font-heading text-base font-semibold text-ink mb-2">
            {title}
          </div>
          <div className="text-[13px] text-ink-faint leading-[1.6]">
            {message}
          </div>
        </div>

        <div className="flex gap-2.5">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 h-9 rounded-md border-none text-white text-[13px] font-medium cursor-pointer transition-colors duration-150 ${toneClass.btn}`}
          >
            <Icon name={icon} size={12}/> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Estado vazio ──────────────────────────────────────────────────────

function EmptyState({ hasFilter, onNew }) {
  return (
    <div className="text-center py-20 px-5 text-ink-faint">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        className="mx-auto mb-4 block opacity-30">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        <path d="M14 2v6h6"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
      </svg>
      <div className="text-[15px] font-medium text-ink-muted mb-1.5">
        {hasFilter ? 'Nenhum projeto encontrado' : 'Nenhum projeto ainda'}
      </div>
      <div className="text-[13px] mb-5">
        {hasFilter
          ? 'Tente ajustar os filtros de busca.'
          : 'Crie seu primeiro projeto de PPCI.'}
      </div>
      {!hasFilter && (
        <button className="btn-primary" onClick={onNew}>
          <Icon name="plus" size={13}/> Novo projeto
        </button>
      )}
    </div>
  )
}

// ── Botão "Novo projeto" com atalho pra "Apenas dimensionamento" ───────
// A seta abre um dropdown com o segundo modo de criação — um projeto sem
// responsável pelo uso/localização/responsável técnico, só com o
// necessário pra dimensionar Saída de Emergência, Hidrantes e Chuveiros
// Automáticos (ver ConfiguracaoPage.jsx).
function NovoProjetoBotao({ onNewProject }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [aberto])

  return (
    <div ref={ref} className="relative flex">
      <button
        className="btn-primary btn-primary-novo btn-primary-novo-l uppercase tracking-wide font-heading font-bold"
        onClick={() => onNewProject('completo')}
      >
        <Icon name="plus" size={18} strokeWidth={3}/> Criar novo projeto
      </button>
      <button
        className="btn-primary btn-primary-novo btn-primary-novo-r ml-[2.5px] px-2.5 shrink-0"
        onClick={() => setAberto(v => !v)}
        title="Outros tipos de projeto"
      >
        <Icon name="chevD" size={17} strokeWidth={3}/>
      </button>
      {aberto && (
        <div className="absolute top-full right-0 mt-1.5 min-w-[240px] bg-surface border border-solid border-border rounded-lg shadow-[var(--shadow-md)] z-50 py-1.5 overflow-hidden">
          <button
            className="w-full text-left px-3.5 py-2.5 bg-transparent border-none cursor-pointer hover:bg-surface-2 flex flex-col gap-0.5"
            onClick={() => { setAberto(false); onNewProject('dimensionamento') }}
          >
            <span className="font-heading text-[13px] font-medium text-ink">Apenas dimensionamento</span>
            <span className="text-[11px] text-ink-faint leading-[1.4]">Gera apenas memorial de cálculo</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Dropdown de filtro (prefixo fixo no botão, lista só com os valores) ─
// Um <select> nativo usa o mesmo texto da opção tanto fechado quanto na
// lista aberta — não dá pra ter "UF: MA" fechado e só "MA" nos itens. Por
// isso os filtros de Grupo/UF usam este dropdown customizado.
function FilterDropdown({ prefix, value, options, onChange }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [aberto])

  const atual = options.find(o => o.value === value) || options[0]

  return (
    <div ref={ref} className="relative w-auto shrink-0">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="flex items-center gap-2 bg-surface border border-solid border-border text-ink text-[13px] py-[9px] px-3 rounded-md cursor-pointer whitespace-nowrap"
      >
        {prefix}: {atual.label}
        <Icon name="chevD" size={11} className="text-ink-faint"/>
      </button>
      {aberto && (
        <div className="absolute top-full left-0 mt-1.5 min-w-full bg-surface border border-solid border-border rounded-lg shadow-[var(--shadow-md)] z-50 py-1.5 overflow-hidden">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setAberto(false) }}
              className={`w-full text-left px-3.5 py-2 bg-transparent border-none cursor-pointer whitespace-nowrap hover:bg-surface-2 text-[13px] ${o.value === value ? 'text-ink font-semibold' : 'text-ink-muted'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TituloGrupo({ titulo, total }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-faint">
      {titulo === 'Fixados' && <Icon name="pin" size={11}/>}
      <span>{titulo}</span>
      <span className="tabular-nums font-normal">· {total}</span>
    </div>
  )
}

// ── Header Logo ───────────────────────────────────────────────────────

// ── ProjetosPage ──────────────────────────────────────────────────────

// user.id -> ultima lista de projetos carregada (vive enquanto a aba estiver aberta).
const cacheProjetos = new Map()

export default function ProjetosPage({ onOpenProject, onNewProject }) {
  const { grupos } = useNorma()
  const { user } = useAuth()
  // Fixados: preferência da conta (perfil), não dado do projeto.
  const { perfil, salvarFixados } = usePerfil()
  const fixadosSalvos = perfil?.projetosFixados
  const fixados = useMemo(() => fixadosSalvos || [], [fixadosSalvos])
  const [erroFixar, setErroFixar] = useState(null)
  const alternarFixado = async proj => {
    setErroFixar(null)
    const ids = fixados.includes(proj.id) ? fixados.filter(id => id !== proj.id) : [...fixados, proj.id]
    const r = await salvarFixados(ids)
    if (!r.ok) setErroFixar(r.erro)
  }
  const [view,        setView]        = useState('grid')
  const [tick,        setTick]        = useState(0)
  const [toDelete,    setToDelete]    = useState(null)
  const [toDuplicate, setToDuplicate] = useState(null)
  const [search,      setSearch]      = useState('')
  const [sort,        setSort]        = useState('recent')
  const [filterUF,     setFilterUF]     = useState('')
  const [filterGrupo,  setFilterGrupo]  = useState('')
  const [filterStatus, setFilterStatus] = useState([]) // multiselect: 'concluidos' | 'andamento' | 'rascunhos'
  // Tipo de projeto ('completo' | 'dimensionamento') aguardando a escolha do
  // estado — null = modal fechado (ver EscolhaEstadoModal).
  const [novoTipo, setNovoTipo] = useState(null)
  const pedirEstado = tipo => setNovoTipo(tipo === 'dimensionamento' ? 'dimensionamento' : 'completo')
  // Lista em cache (por usuario) so pra nao piscar o loader ao voltar pra
  // esta tela: mostra a ultima lista de imediato e atualiza em segundo plano.
  const cache = user ? cacheProjetos.get(user.id) : null
  const [allProjects, setAllProjects] = useState(cache || [])
  const [loading,     setLoading]     = useState(!cache)

  // Roda a cada vez que a pagina "Meus projetos" monta (ou apos delete/recarga) —
  // busca a lista de projetos do usuário no Postgres.
  useEffect(() => {
    if (!user) return
    let cancelado = false
    if (!cacheProjetos.has(user.id)) setLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('projetos').select('dados').eq('user_id', user.id)
      if (cancelado) return
      const lista = error ? [] : (data || []).map(row => row.dados)
      if (!error) cacheProjetos.set(user.id, lista)
      setAllProjects(lista)
      setLoading(false)
    })()
    return () => { cancelado = true }
  }, [user, tick])

  // Normas das UFs da lista (o enquadramento técnico/simplificado do card
  // depende dos limiares do estado); a chave remonta os cards quando chegam.
  const [normasVersao, setNormasVersao] = useState(0)
  const ufsDaLista = [...new Set(allProjects.map(p => p.uf).filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (!ufsDaLista) return
    let cancelado = false
    Promise.all(ufsDaLista.split(',').map(carregarNormasRemotas)).then(() => {
      if (cancelado) return
      versaoNormasLista += 1   // cards remontados (key) recalculam a completude
      setNormasVersao(v => v + 1)
    })
    return () => { cancelado = true }
  }, [ufsDaLista])

  const handleDeleteConfirm = async () => {
    if (!toDelete) return
    await supabase.from('projetos').delete().eq('id', toDelete.id)
    setToDelete(null)
    setTick(t => t + 1)
  }

  const handleDuplicateConfirm = async () => {
    if (!toDuplicate || !user) return
    const { id, createdAt } = newIds()
    const dados = {
      ...toDuplicate,
      id,
      createdAt,
      updatedAt: createdAt,
      nome: `${toDuplicate.nome || 'Sem nome'} (cópia)`,
    }
    await supabase.from('projetos').insert({ id, user_id: user.id, nome: dados.nome, dados })
    setToDuplicate(null)
    setTick(t => t + 1)
  }

  // Estatísticas
  const stats = useMemo(() => {
    const pcts = allProjects.map(p => calcCompletude(p, normasVersao))
    return {
      total:      allProjects.length,
      andamento:  pcts.filter(p => p >= 25 && p < 100).length,
      concluidos: pcts.filter(p => p === 100).length,
      rascunhos:  pcts.filter(p => p < 25).length,
    }
  }, [allProjects, normasVersao])

  // Opções dos filtros
  const ufsDisponiveis = useMemo(() =>
    [...new Set(allProjects.map(p => p.uf).filter(Boolean))].sort(),
  [allProjects])

  const gruposDisponiveis = useMemo(() => {
    const gs = new Set()
    allProjects.forEach(p => p.pavimentos?.forEach(pav => { if (pav.grupo) gs.add(pav.grupo) }))
    return [...gs].sort()
  }, [allProjects])

  const gridRef = useRef(null)
  // Filtro + ordenação
  const filtered = useMemo(() => {
    let list = [...allProjects]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.nome?.toLowerCase().includes(q) ||
        p.cidade?.toLowerCase().includes(q) ||
        p.endereco?.toLowerCase().includes(q)
      )
    }
    if (filterUF)    list = list.filter(p => p.uf === filterUF)
    if (filterGrupo) list = list.filter(p => p.pavimentos?.some(pav => pav.grupo === filterGrupo))
    if (filterStatus.length) {
      list = list.filter(p => {
        const pct = calcCompletude(p, normasVersao)
        const key = pct === 100 ? 'concluidos' : pct >= 25 ? 'andamento' : 'rascunhos'
        return filterStatus.includes(key)
      })
    }

    list.sort((a, b) => {
      if (sort === 'recent')  return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      if (sort === 'oldest')  return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)
      if (sort === 'name')    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      if (sort === 'area')    return totalArea(b) - totalArea(a)
      if (sort === 'pct')     return calcCompletude(b, normasVersao) - calcCompletude(a, normasVersao)
      return 0
    })

    return list
  }, [allProjects, search, sort, filterUF, filterGrupo, filterStatus, normasVersao])

  // Fixados em cima, separados; sem nenhum fixado, a lista fica como antes.
  const gruposDaLista = useMemo(() => {
    const ehFixado = p => fixados.includes(p.id)
    const lista = filtered.filter(ehFixado)
    if (!lista.length) return [{ chave: 'todos', titulo: null, lista: filtered }]
    const demais = filtered.filter(p => !ehFixado(p))
    return [{ chave: 'fixados', titulo: 'Fixados', lista }, ...(demais.length ? [{ chave: 'demais', titulo: 'Outros projetos', lista: demais }] : [])]
  }, [filtered, fixados])

  useEntradaEmLote(gridRef, '.card-projeto', `${loading}|${view}|${filtered.map(p => p.id).join(',')}`)
  const hasFilter = !!(search || filterUF || filterGrupo || filterStatus.length)

  const toggleFilterStatus = key =>
    setFilterStatus(v => v.includes(key) ? v.filter(x => x !== key) : [...v, key])

  // Classes do botão de view toggle
  const viewBtnClass = (active) =>
    `flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-all duration-150 border border-solid ${active ? 'bg-surface-2 border-border text-ink' : 'border-transparent text-ink-faint'}`

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto pt-8 px-10 pb-[60px]">

          {/* Título + botão */}
          <div className="flex items-start justify-between mb-6">
            <h1 className="font-heading text-2xl font-bold text-ink">Meus projetos</h1>
            <div className="flex gap-2">
              <NovoProjetoBotao onNewProject={pedirEstado}/>
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="flex gap-2 items-center mb-3.5 flex-wrap">

            {/* Busca */}
            <div className="flex-1 min-w-[200px] relative">
              <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"/>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, endereço ou ID..."
                className="pl-8"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-ink-faint cursor-pointer p-0.5">
                  <Icon name="x" size={12}/>
                </button>
              )}
            </div>

            {/* Ordenar */}
            <select value={sort} onChange={e => setSort(e.target.value)} className="w-auto">
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="name">Nome A → Z</option>
              <option value="area">Maior área</option>
              <option value="pct">Mais completos</option>
            </select>

            {/* Grupo */}
            <FilterDropdown
              prefix="Grupos"
              value={filterGrupo}
              onChange={setFilterGrupo}
              options={[
                { value: '', label: 'TODOS' },
                ...gruposDisponiveis.map(g => ({ value: g, label: `${g} — ${grupos[g] || g}` })),
              ]}
            />

            {/* Estado */}
            <FilterDropdown
              prefix="UF"
              value={filterUF}
              onChange={setFilterUF}
              options={[
                { value: '', label: 'TODOS' },
                ...ufsDisponiveis.map(uf => ({ value: uf, label: uf })),
              ]}
            />

          </div>

          {/* Contagem + filtros ativos + filtro de status */}
          <div className="flex items-center justify-between gap-2 mb-[18px] flex-wrap">
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <span>{filtered.length} projeto{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</span>
              {filterUF && (
                <FilterChip label={filterUF} onRemove={() => setFilterUF('')}/>
              )}
              {filterGrupo && (
                <FilterChip label={`Grupo ${filterGrupo} — ${grupos[filterGrupo] || filterGrupo}`} onRemove={() => setFilterGrupo('')}/>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {stats.concluidos > 0 && (
                <StatusPill
                  dot="bg-green" tone="green"
                  label={`${stats.concluidos} Concluído${stats.concluidos !== 1 ? 's' : ''}`}
                  active={filterStatus.includes('concluidos')}
                  onClick={() => toggleFilterStatus('concluidos')}
                />
              )}
              {stats.andamento > 0 && (
                <StatusPill
                  dot="bg-amber" tone="amber"
                  label={`${stats.andamento} Em andamento`}
                  active={filterStatus.includes('andamento')}
                  onClick={() => toggleFilterStatus('andamento')}
                />
              )}
              {stats.rascunhos > 0 && (
                <StatusPill
                  dot="bg-ink-faint" tone="muted"
                  label={`${stats.rascunhos} Rascunho${stats.rascunhos !== 1 ? 's' : ''}`}
                  active={filterStatus.includes('rascunhos')}
                  onClick={() => toggleFilterStatus('rascunhos')}
                />
              )}
              <div className="w-px h-6 bg-border shrink-0 mx-1"/>
              <div className="flex gap-0.5">
                <button className={viewBtnClass(view === 'grid')} onClick={() => setView('grid')} title="Grade">
                  <IcoGrid active={view === 'grid'}/>
                </button>
                <button className={viewBtnClass(view === 'list')} onClick={() => setView('list')} title="Lista">
                  <IcoList active={view === 'list'}/>
                </button>
              </div>
            </div>
          </div>

          {/* ── Conteúdo ── */}
          {loading ? (
            <div className="py-16 flex justify-center"><Loader size={40}/></div>
          ) : filtered.length === 0 ? (
            <EmptyState hasFilter={hasFilter} onNew={() => pedirEstado('completo')}/>
          ) : view === 'grid' ? (
            <div ref={gridRef} className="flex flex-col gap-6">
              {gruposDaLista.map(g => (
                <section key={g.chave} aria-label={g.titulo || 'Projetos'}>
                  {g.titulo && <TituloGrupo titulo={g.titulo} total={g.lista.length}/>}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-3">
                    {g.lista.map(proj => (
                      <ProjectCard key={`${proj.id}-${normasVersao}`} proj={proj} onOpen={onOpenProject} onDelete={setToDelete} onDuplicate={setToDuplicate}
                        fixado={fixados.includes(proj.id)} onFixar={alternarFixado}/>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {gruposDaLista.map(g => (
                <section key={g.chave} className="flex flex-col gap-2.5" aria-label={g.titulo || 'Projetos'}>
                  {g.titulo && <TituloGrupo titulo={g.titulo} total={g.lista.length}/>}
                  <ListHeader/>
                  {g.lista.map(proj => (
                    <ProjectRow key={`${proj.id}-${normasVersao}`} proj={proj} onOpen={onOpenProject} onDelete={setToDelete} onDuplicate={setToDuplicate}
                      fixado={fixados.includes(proj.id)} onFixar={alternarFixado}/>
                  ))}
                </section>
              ))}
            </div>
          )}
          {erroFixar && <div className="ibox red mt-4" role="alert"><Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/><span className="text-xs">{erroFixar}</span></div>}

        </div>
      </div>

      {/* Modais de confirmação */}
      {novoTipo && (
        <EscolhaEstadoModal
          tipo={novoTipo}
          onEscolher={uf => { const tipo = novoTipo; setNovoTipo(null); onNewProject(tipo, uf) }}
          onCancel={() => setNovoTipo(null)}
        />
      )}

      {toDelete && (
        <ConfirmModal
          tone="red"
          icon="trash"
          title="Excluir projeto?"
          message={(
            <>
              O projeto{' '}
              <strong className="text-ink">{toDelete.nome || 'Sem nome'}</strong>{' '}
              será excluído permanentemente. Esta ação não pode ser desfeita.
            </>
          )}
          confirmLabel="Excluir permanentemente"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setToDelete(null)}
        />
      )}
      {toDuplicate && (
        <ConfirmModal
          tone="blue"
          icon="copy"
          title="Duplicar projeto?"
          message={(
            <>
              Uma cópia do projeto{' '}
              <strong className="text-ink">{toDuplicate.nome || 'Sem nome'}</strong>{' '}
              será criada com os mesmos dados.
            </>
          )}
          confirmLabel="Duplicar projeto"
          onConfirm={handleDuplicateConfirm}
          onCancel={() => setToDuplicate(null)}
        />
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] py-0.5 pr-2 pl-2.5 rounded-[20px] bg-surface-2 border border-solid border-border text-ink-muted">
      {label}
      <button onClick={onRemove} className="bg-transparent border-none text-ink-faint cursor-pointer p-0 flex items-center">
        <Icon name="x" size={10}/>
      </button>
    </span>
  )
}
