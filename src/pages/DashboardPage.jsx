import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import useEntradaEmLote from '../hooks/useEntradaEmLote'
import { useProjeto } from '../context/ProjetoContext'
import { useAuditoria } from '../context/AuditoriaContext'
import { useNorma } from '../hooks/useNorma'
import { useMedidasObrigatorias } from '../hooks/useMedidasObrigatorias'
import { supabase } from '../lib/supabase'
import { getCompartimentacao } from '../data/normas/index'
import { classificarTipoEdificacao } from '../data/compart_calc'
import { divisoesDaEstrutura } from '../utils/classificacao'
import Icon from '../components/ui/Icon'
import ProjectNotesCard from '../components/notes/ProjectNotesCard'
import { fmtNum } from '../utils/numero'
import './DashboardPage.css'
import { usaArtNoProjeto } from '../estados/fluxos'

const DIAS_SEMANA_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// ── Heatmap de atividade — últimos 2 meses ──────────────────────────────
// Uma linha por (projeto, dia) em atividade_diaria, incrementada a cada
// salvamento bem-sucedido no Supabase (ver registrarAtividade em
// ProjetoContext.jsx). Cada quadrado representa um dia; a intensidade do
// vermelho é relativa ao dia de maior contagem na própria janela exibida
// (não um valor absoluto fixo), pra continuar legível tanto num projeto
// pouco editado quanto num muito editado.
//
// A janela é sempre "2 meses corridos até hoje" — a box nasce do tamanho
// da grade (quadrado fixo), não o contrário. O dia atual cai sempre na
// última coluna (a mais à direita), igual ao GitHub.
const CELULA = 11 // gap entre quadrados fica em DashboardPage.css (.dashboard-activity__grid)
const LINHA_MES_ALTURA = 14
const PROJECT_RING_SIZE = 152
const PROJECT_RING_CENTER = PROJECT_RING_SIZE / 2
const PROJECT_RING_RADIUS = (PROJECT_RING_SIZE - 3) / 2
const PROJECT_RING_CIRCUMFERENCE = 2 * Math.PI * PROJECT_RING_RADIUS

function ProjectProgressRing({ progress }) {
  const normalizedProgress = Math.min(100, Math.max(0, Number(progress) || 0))
  const strokeOffset = PROJECT_RING_CIRCUMFERENCE * (1 - normalizedProgress / 100)

  return (
    <div
      className="dashboard-overview__ring"
      role="img"
      aria-label={`${normalizedProgress}% concluído`}
      data-progress={normalizedProgress}
    >
      <svg className="dashboard-overview__ring-svg -rotate-90" viewBox={`0 0 ${PROJECT_RING_SIZE} ${PROJECT_RING_SIZE}`} aria-hidden="true">
        <circle
          cx={PROJECT_RING_CENTER}
          cy={PROJECT_RING_CENTER}
          r={PROJECT_RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity=".2"
          strokeWidth="3"
        />
        <circle
          key={normalizedProgress}
          cx={PROJECT_RING_CENTER}
          cy={PROJECT_RING_CENTER}
          r={PROJECT_RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={PROJECT_RING_CIRCUMFERENCE}
          strokeDashoffset={strokeOffset}
          className="anel-progresso dashboard-overview__ring-progress"
          style={{ '--anel-c': PROJECT_RING_CIRCUMFERENCE, '--anel-off': strokeOffset }}
        />
      </svg>
      <strong>{normalizedProgress}<small>%</small></strong>
      <span>concluído</span>
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d} dia${d !== 1 ? 's' : ''}`
  const mo = Math.floor(d / 30)
  return `há ${mo} ${mo !== 1 ? 'meses' : 'mês'}`
}

// Constrói a janela de exatamente 2 meses corridos terminando hoje, já
// alinhada por semana (o primeiro dia cai sempre num domingo) — igual à
// lógica de âncora usada nas colunas.
function buildActivityDays(registros) {
  const contagemPorDia = new Map((registros || []).map(r => [r.dia, r.contagem]))
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const inicio = new Date(hoje)
  inicio.setMonth(inicio.getMonth() - 2)
  const ancora = new Date(inicio)
  ancora.setDate(ancora.getDate() - ancora.getDay())
  const totalDias = Math.round((hoje - ancora) / 86400000) + 1

  const dias = []
  for (let i = totalDias - 1; i >= 0; i--) {
    const data = new Date(hoje)
    data.setDate(data.getDate() - i)
    const chave = data.toISOString().slice(0, 10)
    dias.push({ data, chave, contagem: contagemPorDia.get(chave) || 0 })
  }
  return dias
}

function ActivityHeatmap({ registros, ultimaAlteracao }) {
  const dias = useMemo(() => buildActivityDays(registros), [registros])
  const maxContagem = Math.max(0, ...dias.map(d => d.contagem))

  const nivel = contagem => {
    if (!contagem || !maxContagem) return 0
    const proporcao = contagem / maxContagem
    if (proporcao <= 0.25) return 1
    if (proporcao <= 0.5) return 2
    if (proporcao <= 0.75) return 3
    return 4
  }

  // `dias[0]` é sempre um domingo por construção — serve de âncora direta.
  const ancora = dias[0].data
  const colunaDe = data => Math.floor((data - ancora) / 86400000 / 7)
  const totalColunas = colunaDe(dias[dias.length - 1].data) + 1

  const rotulosMes = []
  let ultimoMes = null
  dias.forEach(d => {
    const mes = d.data.getMonth()
    if (mes !== ultimoMes) {
      rotulosMes.push({ coluna: colunaDe(d.data), texto: MESES_ABREV[mes] })
      ultimoMes = mes
    }
  })

  // O dia atual é sempre o último item de `dias` — cai por construção na
  // última coluna (a mais à direita), igual ao GitHub. Ganha destaque
  // próprio (branco) em vez de seguir a escala de vermelho, pra ficar
  // sempre localizável de primeira, tenha ou não atividade registrada.
  const chaveHoje = dias[dias.length - 1].chave

  return (
    <>
      <div
        className="dashboard-activity__grid"
        style={{
          gridTemplateColumns: `repeat(${totalColunas}, ${CELULA}px)`,
          gridTemplateRows: `${LINHA_MES_ALTURA}px repeat(7, ${CELULA}px)`,
        }}
      >
        {rotulosMes.map(r => (
          <span key={r.coluna} className="dashboard-activity__month" style={{ gridColumn: r.coluna + 1 }}>{r.texto}</span>
        ))}
        {dias.map(d => {
          const ehHoje = d.chave === chaveHoje
          const rotulo = `${d.contagem} ${d.contagem === 1 ? 'atividade' : 'atividades'} — ${DIAS_SEMANA_ABREV[d.data.getDay()]}, ${d.data.getDate()} de ${MESES_ABREV[d.data.getMonth()]}${ehHoje ? ' (hoje)' : ''}`
          return (
            <span
              key={d.chave}
              className={`dashboard-activity__cell ${ehHoje ? 'dashboard-activity__cell--today' : `dashboard-activity__cell--l${nivel(d.contagem)}`}`}
              style={{ gridColumn: colunaDe(d.data) + 1, gridRow: d.data.getDay() + 2 }}
              title={rotulo}
              aria-label={rotulo}
              role="img"
            />
          )
        })}
      </div>
      <p className="dashboard-activity__updated">Última alteração {timeAgo(ultimaAlteracao)}</p>
    </>
  )
}

const SYSTEMS = [
  { key: 'acesso_viatura', icon: 'viaturaMedida', label: 'Acesso de Viatura' },
  { key: 'seg_estrutural', icon: 'wallFire', label: 'Segurança Estrutural' },
  { key: 'compart_horizontal', icon: 'compartHorizontalMedida', label: 'Compartimentação Horizontal' },
  { key: 'saida_emergencia', icon: 'exit', label: 'Saídas de Emergência' },
  { key: 'brigada', icon: 'brigadaMedida', label: 'Brigada de Incêndio' },
  { key: 'iluminacao', icon: 'iluminacaoMedida', label: 'Iluminação de Emergência' },
  { key: 'sinalizacao', icon: 'sinalizacaoMedida', label: 'Sinalização de Emergência' },
  { key: 'extintores', icon: 'ext', label: 'Extintores' },
  { key: 'hidrantes', icon: 'hidranteMedida', label: 'Hidrantes / Mangotinhos' },
  { key: 'alarme', icon: 'alarmeMedida', label: 'Alarme de Incêndio' },
  { key: 'deteccao', icon: 'detectorMedida', label: 'Detecção de Incêndio' },
  { key: 'sprinklers', icon: 'sprinklerMedida', label: 'Chuveiros Automáticos' },
  { key: 'controle_fumaca', icon: 'flame', label: 'Controle de Fumaça' },
  { key: 'compart_vertical', icon: 'compartVerticalMedida', label: 'Compartimentação Vertical' },
  { key: 'controle_acabamento', icon: 'controleAcabamentoMedida', label: 'Controle de Acabamento' },
  { key: 'gerenciamento_risco', icon: 'gerenciamentoRiscoMedida', label: 'Gerenciamento de Risco' },
  { key: 'central_gas', icon: 'info', label: 'Central de Gás' },
  { key: 'spda', icon: 'warn', label: 'SPDA' },
  { key: 'resfriamento', icon: 'drop', label: 'Sistema de Resfriamento' },
  { key: 'espuma', icon: 'spray', label: 'Sistema de Espuma' },
  { key: 'gases_fixos', icon: 'shieldAlert', label: 'Sistema de Gases Fixos' },
  { key: 'fontes_ignicao', icon: 'flame', label: 'Controle de Fontes de Ignição' },
]

// Sistemas com uma tela de dimensionamento própria implementada (ver rotas
// em App.jsx) — os demais caem na página genérica "em construção" e por
// isso nunca são cobrados como pendentes no status do dashboard.
const SCREENS_DISPONIVEIS = new Set([
  'acesso_viatura', 'seg_estrutural', 'compart_horizontal', 'compart_vertical',
  'saida_emergencia', 'extintores', 'iluminacao', 'sinalizacao', 'hidrantes',
  'controle_acabamento', 'gerenciamento_risco',
])

// Status consolidado exibido no card do sistema: 'done' (verde) quando o
// sistema está com todos os dados exigíveis preenchidos, 'progress'
// (amarelo) quando é obrigatório e ainda falta preencher, e 'todo' (cinza)
// quando foi dispensado (não obrigatório) ou ainda não tem tela própria.
function getStatusTone(key, required, progressTone) {
  if (!required || !SCREENS_DISPONIVEIS.has(key)) return 'todo'
  return progressTone === 'done' ? 'done' : 'progress'
}

const COMPLETE_CONFIG_STEPS = [
  { label: 'Identificação', test: s => [s.nome, s.endereco, s.cidade, s.propNome, s.propDocumento, s.respRazaoSocial, s.respCNPJ].every(Boolean) },
  { label: 'Edificação', test: s => (s.estruturas || []).length > 0 && s.estruturas.every(e => e.areaTotal && e.altura) },
  { label: 'Responsável técnico', test: s => Boolean(s.rtNome && (!usaArtNoProjeto(s) || s.artNumero)) },
  { label: 'Classificação', test: s => (s.pavimentos || []).length > 0 && s.pavimentos.every(p => p.divisao && p.cnae) },
  // Antes só conferia as entradas que já existiam em cargaState — uma
  // divisão nova (estrutura adicionada depois, por exemplo) sem entrada
  // nenhuma passava batido, como se a etapa já estivesse completa. Agora
  // recalcula, a partir das estruturas/pavimentos atuais, toda divisão que
  // deveria ter carga lançada e confere cada uma.
  { label: 'Carga de incêndio', test: s => {
    const estruturas = s.estruturas || []
    if (estruturas.length === 0) return false
    const divisoesPorEstrutura = estruturas.map(est => ({
      est, divisoes: divisoesDaEstrutura((s.pavimentos || []).filter(p => p.estruturaId === est.id)),
    }))
    if (!divisoesPorEstrutura.some(d => d.divisoes.length > 0)) return false
    return divisoesPorEstrutura.every(({ est, divisoes }) => {
      const cargaEst = s.cargaState?.[est.id] || {}
      return divisoes.every(code => {
        const c = cargaEst[code]
        return c?.metodo === 'levantamento' ? Boolean(c.valorManual) : Boolean(c?.cargaIncendio)
      })
    })
  } },
  // Além de ter sistemas identificados, todo sistema obrigatório que o
  // próprio usuário desligou manualmente no toggle (ver MotivosIsencao em
  // Step6.jsx) precisa do motivo da isenção preenchido. Confere
  // sistemasPorEstrutura === false (o toggle manual de verdade), não só
  // `ativo` — isso deixa de fora as isenções automáticas da
  // Compartimentação (substituição/compartimento único), que já têm
  // motivo e fluxo próprios na tela de Compartimentação.
  { label: 'Medidas de segurança', test: (s, activeSystems, porEstrutura) => {
    if (activeSystems.length === 0) return false
    return (porEstrutura || []).every(pe => {
      const estId = pe.estrutura.id
      const manuais = s.sistemasPorEstrutura?.[estId] || {}
      const motivos = s.motivosIsencaoPorEstrutura?.[estId] || {}
      return Object.keys(pe.sistemas).every(key =>
        !(pe.sistemas[key]?.obrigatorio && manuais[key] === false) || Boolean(motivos[key]) || Boolean(s.semMotivoIsencaoPorEstrutura?.[estId]?.[key]))
    })
  } },
]

const DIMENSIONING_CONFIG_STEPS = [
  { label: 'Edificação', test: s => Boolean(s.nome) && (s.estruturas || []).length > 0 && s.estruturas.every(e => e.areaTotal && e.altura) },
  COMPLETE_CONFIG_STEPS[3],
  COMPLETE_CONFIG_STEPS[4],
  COMPLETE_CONFIG_STEPS[5],
]

const fmtNumber = value => value ? fmtNum(value, 2, '—') : '—'

function getFireLoad(cargaState) {
  return Object.values(cargaState || {})
    .flatMap(item => item && ('metodo' in item || 'cargaIncendio' in item || 'valorManual' in item)
      ? [item]
      : Object.values(item || {}))
    .reduce((highest, item) => {
      const value = item?.metodo === 'levantamento' ? Number(item?.valorManual) || 0 : item?.cargaIncendio || 0
      return Math.max(highest, value)
    }, 0)
}

function getSystemProgress(key, state, structureId = null) {
  const scopedItems = items => structureId
    ? (items || []).filter(item => item.estruturaId === structureId)
    : (items || [])
  if (key === 'hidrantes') {
    if (state.hidrantes?.dimensionamento) return { tone: 'done', label: 'Sincronizado com o Revit', detail: 'Cálculo hidráulico disponível' }
    if (state.hidrantes?.tipo) return { tone: 'progress', label: 'Em dimensionamento', detail: 'Classificação definida' }
  }
  const extintores = scopedItems(state.extintores)
  const iluminacao = scopedItems(state.iluminacao)
  const sinalizacao = scopedItems(state.sinalizacao)
  if (key === 'extintores' && extintores.length) return { tone: 'progress', label: `${extintores.length} lançamento${extintores.length === 1 ? '' : 's'}`, detail: 'Dados iniciados' }
  if (key === 'iluminacao' && iluminacao.length) return { tone: 'progress', label: `${iluminacao.length} lançamento${iluminacao.length === 1 ? '' : 's'}`, detail: 'Dados iniciados' }
  if (key === 'sinalizacao' && sinalizacao.length) return { tone: 'progress', label: `${sinalizacao.length} lançamento${sinalizacao.length === 1 ? '' : 's'}`, detail: 'Dados iniciados' }
  if (key === 'alarme' || key === 'deteccao') {
    const ests = (state.estruturas || []).filter(e => !structureId || e.id === structureId)
    const iniciada = e => key === 'alarme'
      ? !!(e.alarme?.central || e.alarme?.centralLocal || e.alarme?.fonteAuxiliar)
      : (state.pavimentos || []).some(p => p.estruturaId === e.id && (Object.keys(p.deteccao?.tipos || {}).length > 0 || p.deteccao?.qtd))
    const concluidas = ests.filter(e => e.concluidas?.[key]).length
    if (ests.length && concluidas === ests.length) return { tone: 'done', label: 'Concluído', detail: `${concluidas} edificaç${concluidas === 1 ? 'ão' : 'ões'}` }
    if (ests.some(iniciada)) return { tone: 'progress', label: 'Em preenchimento', detail: `${concluidas} de ${ests.length} concluída${concluidas === 1 ? '' : 's'}` }
  }
  if (key === 'acesso_viatura' && state.acessoViatura?.larguraAdotada) {
    return { tone: 'progress', label: 'Em preenchimento', detail: 'Parâmetros informados' }
  }
  return { tone: 'todo', label: 'A desenvolver', detail: 'Abra para dimensionar' }
}

const getRiskLabel = fireLoad => {
  if (!fireLoad) return 'Aguardando classificação'
  if (fireLoad <= 300) return 'Risco baixo'
  if (fireLoad <= 1200) return 'Risco médio'
  return 'Risco alto'
}

// Resumo de ocupação/divisão pro card técnico — uma única divisão mostra a
// descrição do grupo (ex.: "Comercial") como valor principal e a própria
// divisão (ex.: "Divisão C-1") como detalhe; mais de uma vira "Ocupação
// mista", com as divisões listadas no detalhe (mesmo critério de
// ocupacaoInfo em ProjetosPage.jsx).
function getOcupacaoResumo(divisions, grupos) {
  if (!divisions || divisions.length === 0) return { valor: '—', detalhe: 'Classificação pendente' }
  if (divisions.length === 1) {
    const divisao = divisions[0]
    const letra = divisao.charAt(0)
    return { valor: grupos?.[letra] || `Grupo ${letra}`, detalhe: `Divisão ${divisao}` }
  }
  return { valor: 'Ocupação mista', detalhe: divisions.join(', ') }
}

function TechnicalCardStack({ cards, selectedId, systemsCount, onSelect, grupos }) {
  const cardRef = useRef(null)
  const drag = useRef({ active: false, startX: 0, deltaX: 0 })
  const activeIndex = Math.max(0, cards.findIndex(card => card.id === selectedId))
  const activeCard = cards[activeIndex] || cards[0]
  const stackedCards = cards.length > 1
    ? Array.from({ length: Math.min(2, cards.length - 1) }, (_, index) => cards[(activeIndex + index + 1) % cards.length])
    : []

  const moveTo = direction => {
    if (cards.length < 2) return
    const nextIndex = (activeIndex + direction + cards.length) % cards.length
    const node = cardRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!node || reduceMotion) {
      onSelect(cards[nextIndex].id)
      return
    }
    gsap.killTweensOf(node)
    gsap.to(node, {
      x: direction > 0 ? -90 : 90,
      rotate: direction > 0 ? -2.2 : 2.2,
      opacity: 0,
      duration: .18,
      ease: 'power2.in',
      onComplete: () => {
        onSelect(cards[nextIndex].id)
        requestAnimationFrame(() => {
          gsap.fromTo(node,
            { x: direction > 0 ? 70 : -70, rotate: direction > 0 ? 1.5 : -1.5, opacity: 0 },
            { x: 0, rotate: 0, opacity: 1, duration: .38, ease: 'power3.out', clearProps: 'transform,opacity' })
        })
      },
    })
  }

  const handlePointerDown = event => {
    drag.current = { active: true, startX: event.clientX, deltaX: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
    gsap.killTweensOf(cardRef.current)
  }

  const handlePointerMove = event => {
    if (!drag.current.active) return
    const deltaX = Math.max(-150, Math.min(150, event.clientX - drag.current.startX))
    drag.current.deltaX = deltaX
    gsap.set(cardRef.current, { x: deltaX, rotate: deltaX * .012, opacity: 1 - Math.abs(deltaX) / 500 })
  }

  const handlePointerEnd = () => {
    if (!drag.current.active) return
    drag.current.active = false
    const deltaX = drag.current.deltaX
    if (Math.abs(deltaX) > 64) {
      moveTo(deltaX < 0 ? 1 : -1)
      return
    }
    gsap.to(cardRef.current, { x: 0, rotate: 0, opacity: 1, duration: .35, ease: 'power3.out', clearProps: 'transform,opacity' })
  }

  if (!activeCard) return null
  const ocup = getOcupacaoResumo(activeCard.divisions, grupos)

  return (
    <div className="dashboard-card-stack">
      <div className="dashboard-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {activeCard.name}. {systemsCount} sistema{systemsCount === 1 ? '' : 's'} aplicáve{systemsCount === 1 ? 'l' : 'is'}.
      </div>
      <div className="dashboard-card-stack__stage">
        {stackedCards.slice().reverse().map((card, reverseIndex) => (
          <div className="dashboard-technical-card dashboard-technical-card--back" data-depth={stackedCards.length - reverseIndex} key={card.id} aria-hidden="true">
            <span>{card.name}</span>
          </div>
        ))}
        <article
          ref={cardRef}
          className="dashboard-technical-card dashboard-technical-card--active"
          tabIndex={0}
          aria-label={`${activeCard.name}. Arraste para os lados ou use as setas para trocar de edificação.`}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') moveTo(-1)
            if (event.key === 'ArrowRight') moveTo(1)
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="dashboard-technical-card__name">
            <span>Nome da edificação</span>
            <h3>{activeCard.name}</h3>
          </div>
          <dl className="dashboard-technical-card__metrics">
            <div><dt>Ocupação e divisão</dt><dd>{ocup.valor}</dd><small>{ocup.detalhe}</small></div>
            <div><dt>Área construída</dt><dd>{fmtNumber(activeCard.area)}<small>{activeCard.area ? ' m²' : ''}</small></dd><small>{activeCard.terrain ? `Terreno ${fmtNumber(activeCard.terrain)} m²` : 'Terreno não informado'}</small></div>
            <div><dt>Pavimentos</dt><dd>{activeCard.floorCount || '—'}<small>{activeCard.floorCount ? ` pavimento${activeCard.floorCount === 1 ? '' : 's'}` : ''}</small></dd><small>{activeCard.heightClass || 'Altura não informada'}</small></div>
            <div><dt>Risco de incêndio</dt><dd>{getRiskLabel(activeCard.fireLoad)}</dd><small>{activeCard.fireLoad ? `${fmtNumber(activeCard.fireLoad)} MJ/m²` : 'Carga de incêndio não informada'}</small></div>
          </dl>
        </article>
      </div>
      <div className="dashboard-card-stack__navigation">
        <div className="dashboard-card-stack__arrows">
          <button type="button" onClick={() => moveTo(-1)} disabled={cards.length < 2} aria-label="Edificação anterior"><Icon name="chevL" size={16}/></button>
          <span><strong>{String(activeIndex + 1).padStart(2, '0')}</strong> / {String(cards.length).padStart(2, '0')}</span>
          <button type="button" onClick={() => moveTo(1)} disabled={cards.length < 2} aria-label="Próxima edificação"><Icon name="chevR" size={16}/></button>
        </div>
        <div className="dashboard-card-stack__dots" role="radiogroup" aria-label="Selecionar visão técnica">
          {cards.map(card => <button type="button" role="radio" className={card.id === selectedId ? 'is-active' : ''} key={card.id} onClick={() => onSelect(card.id)} aria-label={`Ver ${card.name}`} aria-checked={card.id === selectedId}/>) }
        </div>
        <span>Arraste para explorar as edificações</span>
      </div>
    </div>
  )
}

export default function DashboardPage({ onGoConfig, onNavigate }) {
  const shellRef = useRef(null)
  const identRef = useRef(null)
  const { state, dispatch } = useProjeto()
  const { grupos } = useNorma()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const { campos, pendencias } = useAuditoria()
  const [selectedStructureId, setSelectedStructureId] = useState('all')
  const [atividade, setAtividade] = useState([])
  const [identHeight, setIdentHeight] = useState(null)
  const [gradientGlow, setGradientGlow] = useState(.72)
  const [gradientGlowDuration, setGradientGlowDuration] = useState(5)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let timer
    const updateGlow = () => {
      const duration = 3.8 + Math.random() * 3
      setGradientGlowDuration(duration)
      setGradientGlow(.56 + Math.random() * .38)
      timer = window.setTimeout(updateGlow, duration * 1000)
    }
    updateGlow()

    return () => window.clearTimeout(timer)
  }, [])

  // Notas acompanha a altura real de Identificação (ao lado, no mesmo grid)
  // em vez de um valor fixo no CSS — o conteúdo de Identificação varia
  // (modo "apenas dimensionamento" tem 2 linhas a menos, endereço longo
  // quebra linha etc.), então só medir o elemento de verdade garante que
  // os dois cards fiquem sempre com a mesma altura.
  useEffect(() => {
    const el = identRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect?.height
      if (h) setIdentHeight(Math.round(h))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // O heatmap mostra 2 meses corridos (ver ActivityHeatmap) — busca uma
  // janela um pouco mais folgada (75 dias) pra sempre cobrir isso mesmo
  // com o alinhamento por semana no início da janela.
  useEffect(() => {
    if (!state.id) { setAtividade([]); return }
    let cancelado = false
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - 74)
    supabase
      .from('atividade_diaria')
      .select('dia,contagem')
      .eq('projeto_id', state.id)
      .gte('dia', inicio.toISOString().slice(0, 10))
      .then(({ data: registros, error }) => {
        if (cancelado) return
        if (error) { console.error('Falha ao carregar atividade do projeto:', error.message); setAtividade([]); return }
        setAtividade(registros || [])
      })
    return () => { cancelado = true }
  }, [state.id])

  const data = useMemo(() => {
    const structures = state.estruturas || []
    const activeSystems = SYSTEMS
      .filter(system => sistemas[system.key]?.ativo)
      .map(system => {
        const required = Boolean(sistemas[system.key]?.obrigatorio)
        const progress = getSystemProgress(system.key, state)
        return { ...system, required, progress, statusTone: getStatusTone(system.key, required, progress.tone) }
      })
      .sort((a, b) => Number(b.required) - Number(a.required))
    const configSteps = state.tipoProjeto === 'dimensionamento' ? DIMENSIONING_CONFIG_STEPS : COMPLETE_CONFIG_STEPS
    const configuredSteps = configSteps.filter(step => step.test(state, activeSystems, porEstrutura))
    const groups = [...new Set((state.pavimentos || []).map(p => p.grupo).filter(Boolean))].sort()
    const divisions = [...new Set((state.pavimentos || []).map(p => p.divisao).filter(Boolean))].sort()
    // Pavimentos = acima do solo + subsolos. Visão geral: vale a estrutura com mais pavimentos (não a soma entre estruturas)
    const totalPavimentos = item => (Number(item.nPavimentos) || 0) + (Number(item.nSubsolos) || 0)
    const floorCount = structures.reduce((max, item) => Math.max(max, totalPavimentos(item)), 0)
    // Classificação da altura (mesma da Compartimentação, Anexo B da NT 09): usa a
    // altura piso a piso; sem altura informada num prédio de mais de 1 pavimento, não classifica.
    const classesTipo = getCompartimentacao(state.uf)?.CLASSES_TIPO_EDIFICACAO
    const heightClassOf = item => {
      const h = Number(item.alturaPisoPiso) || 0
      if (h <= 0 && (Number(item.nPavimentos) || 1) + (Number(item.nSubsolos) || 0) > 1) return null
      return classesTipo ? classificarTipoEdificacao(h, classesTipo)?.nome || null : null
    }
    const tallest = structures.reduce((best, item) => (!best || (Number(item.alturaPisoPiso) || 0) > (Number(best.alturaPisoPiso) || 0)) ? item : best, null)
    const heightClass = tallest ? heightClassOf(tallest) : null
    // Terreno é do lote (parâmetro do projeto), igual em todos os cards
    const terrain = Number(state.areaTerreno) || 0
    const basementCount = structures.reduce((max, item) => Math.max(max, Number(item.nSubsolos) || 0), 0)
    const area = Number(state.areaConstruidaTotal) || structures.reduce((sum, item) => sum + (Number(item.areaTotal) || 0), 0)
    const height = structures.reduce((highest, item) => Math.max(highest, Number(item.altura) || 0), 0)
    const fireLoad = getFireLoad(state.cargaState)
    const configDone = configuredSteps.length === configSteps.length
    // Completude do projeto inteiro — não só a configuração inicial — vem
    // direto da auditoria de campos obrigatórios (useAuditoria/
    // auditoriaProjeto.js), que já cobre campo a campo cada etapa de
    // configuração E cada medida de segurança exigida (extintores,
    // iluminação, brigada, detecção/alarme, hidrantes, etc.), sem
    // reimplementar essa lógica aqui com uma segunda fonte de verdade que
    // poderia divergir. Documentação não entra: não é um campo obrigatório
    // do projeto, é a fase seguinte, só exibida como próximo passo.
    const pendenciasSistema = new Set(pendencias.filter(c => c.rota?.startsWith('medida/')).map(c => c.rota.slice('medida/'.length)))
    const systemsDone = activeSystems.filter(s => !pendenciasSistema.has(s.key))
    const projectPercent = campos.length > 0 ? Math.round(((campos.length - pendencias.length) / campos.length) * 100) : 0
    const projectReady = campos.length > 0 && pendencias.length === 0
    const hasTechnicalData = Boolean(state.nome || area || height || fireLoad || groups.length || state.rtNome)

    const selectedStructure = structures.find(item => item.id === selectedStructureId)
    const selectedPavements = selectedStructure
      ? (state.pavimentos || []).filter(item => item.estruturaId === selectedStructure.id)
      : (state.pavimentos || [])
    const structureSystems = selectedStructure
      ? porEstrutura.find(item => item.estrutura.id === selectedStructure.id)?.sistemas || {}
      : sistemas
    const summarySystems = SYSTEMS.filter(system => structureSystems[system.key]?.ativo)
    const displayedSystems = summarySystems
      .map(system => {
        const required = Boolean(structureSystems[system.key]?.obrigatorio)
        const progress = getSystemProgress(system.key, state, selectedStructure?.id)
        return { ...system, required, progress, statusTone: getStatusTone(system.key, required, progress.tone) }
      })
      .sort((a, b) => Number(b.required) - Number(a.required))
    const summaryGroups = [...new Set(selectedPavements.map(item => item.grupo).filter(Boolean))].sort()
    const summaryDivisions = [...new Set(selectedPavements.map(item => item.divisao).filter(Boolean))].sort()
    const makeStructureSummary = structure => {
      const structurePavements = (state.pavimentos || []).filter(item => item.estruturaId === structure.id)
      return {
        id: structure.id,
        name: structure.nome || 'Edificação sem nome',
        area: Number(structure.areaTotal) || 0,
        terrain,
        height: Number(structure.altura) || 0,
        floorCount: totalPavimentos(structure),
        heightClass: heightClassOf(structure),
        basementCount: Number(structure.nSubsolos) || 0,
        fireLoad: getFireLoad(state.cargaState?.[structure.id]),
        groups: [...new Set(structurePavements.map(item => item.grupo).filter(Boolean))].sort(),
        divisions: [...new Set(structurePavements.map(item => item.divisao).filter(Boolean))].sort(),
      }
    }
    const summary = selectedStructure ? {
      id: selectedStructure.id,
      name: selectedStructure.nome || 'Edificação sem nome',
      label: selectedStructure.nome,
      area: Number(selectedStructure.areaTotal) || 0,
      terrain,
      height: Number(selectedStructure.altura) || 0,
      floorCount: totalPavimentos(selectedStructure),
      heightClass: heightClassOf(selectedStructure),
      basementCount: Number(selectedStructure.nSubsolos) || 0,
      fireLoad: getFireLoad(state.cargaState?.[selectedStructure.id]),
      groups: summaryGroups,
      divisions: summaryDivisions,
      systemCount: summarySystems.length,
      requiredCount: summarySystems.filter(system => structureSystems[system.key]?.obrigatorio).length,
    } : {
      id: 'all', name: 'Visão geral do projeto', label: 'Visão geral', area, terrain, height, floorCount, heightClass, basementCount, fireLoad,
      groups: summaryGroups, divisions: summaryDivisions,
      systemCount: activeSystems.length,
      requiredCount: activeSystems.filter(system => system.required).length,
    }

    const technicalCards = [{ id: 'all', name: 'Visão geral do projeto', area, terrain, height, floorCount, heightClass, basementCount, fireLoad, groups, divisions }, ...structures.map(makeStructureSummary)]

    return { activeSystems, displayedSystems, configuredSteps, configStepCount: configSteps.length, groups, divisions, systemsDone, configDone, projectPercent, projectReady, hasTechnicalData, summary, technicalCards }
  }, [state, sistemas, porEstrutura, selectedStructureId, campos, pendencias])

  const { projectReady, configDone } = data
  const projectProgress = Math.min(100, Math.max(0, Number(data.projectPercent) || 0))
  const sistemasPendentes = data.activeSystems.length - data.systemsDone.length
  const proximaPendencia = configDone
    ? pendencias.find(item => item.rota?.startsWith('medida/')) || pendencias[0]
    : pendencias.find(item => item.rota === 'config') || pendencias[0]
  const proximaSecao = proximaPendencia?.secao || 'configuração do projeto'
  const abrirProximaPendencia = () => {
    if (!proximaPendencia || proximaPendencia.rota === 'config') onGoConfig()
    else onNavigate?.(proximaPendencia.rota.replace('medida/', ''))
  }

  // O resumo funciona como uma orientação de continuidade: descreve o estado
  // real e aponta o próximo campo obrigatório, em vez de repetir percentuais.
  const situacaoTitulo = projectReady
    ? 'O projeto está completo e pronto para gerar os documentos necessários.'
    : configDone
      ? sistemasPendentes === 1
        ? `Ainda falta 1 sistema para configurar. Paramos em ${proximaSecao}.`
        : `Ainda faltam ${sistemasPendentes} sistemas para configurar. Paramos em ${proximaSecao}.`
      : data.hasTechnicalData
        ? 'Vamos terminar a base técnica do projeto.'
        : 'Vamos começar pelas informações essenciais do projeto.'
  const address = [state.endereco, state.numero, state.bairro, state.cidade && `${state.cidade} — ${state.uf || 'MA'}`].filter(Boolean).join(', ')
  useEntradaEmLote(shellRef, '.anim-entra', 'montagem')
  return (
    <main ref={shellRef} className="dashboard-shell">
      <div className="dashboard-content">
        <header className="dashboard-header anim-entra">
          <div>
            <h1>{state.nome || 'Projeto sem nome'}</h1>
          </div>
          <button type="button" className="btn-primary dashboard-header__button" onClick={onGoConfig}><Icon name="settings" size={14}/> Editar configuração</button>
        </header>

        <div className="dashboard-top-row">
          <section
            className="dashboard-overview anim-entra"
            aria-label="Situação geral do projeto"
            style={{
              '--dashboard-gradient-stop': `${projectProgress}%`,
              '--dashboard-gradient-color': `rgba(204, 26, 50, ${(projectProgress / 100 * .42).toFixed(3)})`,
              '--dashboard-gradient-glow': gradientGlow,
              '--dashboard-gradient-glow-duration': `${gradientGlowDuration}s`,
            }}
          >
            <div className="dashboard-overview__beams" aria-hidden="true"><i/><i/><i/></div>
            <div className="dashboard-overview__score">
              <ProjectProgressRing progress={projectProgress}/>
            </div>
            <div className="dashboard-overview__content">
              <div className="dashboard-overview__copy">
                <h2>{situacaoTitulo}</h2>
                {projectReady ? (
                  <button type="button" className="dashboard-overview__action" onClick={() => onNavigate?.('documentos')}>
                    Acessar documentos <Icon name="right" size={14}/>
                  </button>
                ) : proximaPendencia && (
                  <button type="button" className="dashboard-overview__action" onClick={abrirProximaPendencia}>
                    Continuar em {proximaSecao} <Icon name="right" size={14}/>
                  </button>
                )}
              </div>
              <div className="dashboard-stages">
                <div className={configDone ? 'is-complete' : 'is-current'}><span>01</span><strong>Configuração</strong><small>{data.configuredSteps.length} de {data.configStepCount} etapas</small></div>
                <div className={configDone ? (projectReady ? 'is-complete' : 'is-current') : ''}><span>02</span><strong>Sistemas</strong><small>{data.systemsDone.length} de {data.activeSystems.length} concluídos</small></div>
              </div>
            </div>
          </section>

          <aside className="dashboard-panel dashboard-activity anim-entra" aria-label="Atividade recente do projeto — últimos 2 meses">
            <h2 className="dashboard-activity__title">Atividade</h2>
            <ActivityHeatmap registros={atividade} ultimaAlteracao={state.updatedAt}/>
          </aside>
        </div>

        <section className="dashboard-information-grid">
          <article ref={identRef} className="dashboard-panel dashboard-identification anim-entra">
            <div className="dashboard-section-heading"><div><h2>Identificação do projeto</h2><p>Dados administrativos e responsáveis</p></div><Icon name="info" size={15}/></div>
            <dl>
              <div><dt>Nome do projeto</dt><dd>{state.nome || 'Não informado'}</dd></div>
              <div><dt>Localização</dt><dd>{address || 'Não informada'}</dd></div>
              <div><dt>Proprietário</dt><dd>{state.propNome || 'Não informado'}</dd></div>
              <div><dt>Responsável pelo uso</dt><dd>{state.respRazaoSocial || 'Não informado'}</dd></div>
              {state.tipoProjeto === 'dimensionamento' ? <div><dt>Modalidade</dt><dd>Apenas dimensionamento</dd></div> : <>
                <div><dt>Responsável técnico</dt><dd>{state.rtNome || 'Não informado'}</dd></div>
                <div><dt>Registro / ART</dt><dd>{[state.rtConselho, state.artNumero].filter(Boolean).join(' · ') || 'Não informado'}</dd></div>
              </>}
            </dl>
            <button type="button" className="dashboard-text-button" onClick={onGoConfig}>Editar identificação <Icon name="right" size={13}/></button>
          </article>

          <ProjectNotesCard notes={state.notas} dispatch={dispatch} height={identHeight} className="anim-entra"/>
        </section>

        <section className="dashboard-technical anim-entra" aria-label={`Resumo técnico — ${selectedStructureId === 'all' ? 'todas as edificações' : data.summary.label}`}>
          <TechnicalCardStack cards={data.technicalCards} selectedId={selectedStructureId} systemsCount={data.displayedSystems.length} onSelect={setSelectedStructureId} grupos={grupos}/>
        </section>

        <section className="dashboard-systems anim-entra">
          <div className="dashboard-section-heading dashboard-section-heading--systems"><div><h2>Sistemas aplicados</h2><p>{selectedStructureId === 'all' ? 'Status consolidado de todas as edificações' : `Sistemas aplicáveis a ${data.summary.label}`}</p></div><span>{data.displayedSystems.length} aplicáveis</span></div>
          {data.displayedSystems.length ? <div className="dashboard-system-list">{data.displayedSystems.map(system => (
            <button type="button" className="dashboard-system" key={system.key} onClick={() => onNavigate?.(system.key)}>
              <span className={`dashboard-system__icon dashboard-system__icon--${system.statusTone}`}><Icon name={system.icon} size={17}/></span>
              <span className="dashboard-system__name"><strong>{system.label}</strong><small>{system.required ? 'Obrigatório' : 'Opcional habilitado'}</small></span>
              <span className={`dashboard-system__status dashboard-system__status--${system.statusTone}`}><strong>{system.progress.label}</strong><small>{system.progress.detail}</small></span>
              <Icon name="right" size={15} className="dashboard-system__arrow"/>
            </button>
          ))}</div> : <div className="dashboard-empty"><Icon name="settings" size={18}/><div><strong>Nenhum sistema definido</strong><p>Conclua a classificação e as medidas de segurança na configuração.</p></div><button type="button" onClick={onGoConfig}>Configurar projeto</button></div>}
        </section>

        <section className={`anim-entra dashboard-documents ${!data.hasTechnicalData ? 'dashboard-documents--disabled' : ''}`}>
          <div><span className="dashboard-documents__icon"><Icon name="documentosMedida" size={19}/></span><div><h2>Memorial e documentos do projeto</h2><p>{state.tipoProjeto === 'dimensionamento' ? 'Revise o memorial descritivo montado a partir dos dimensionamentos.' : 'Revise o memorial descritivo e o Anexo B montados a partir desta configuração.'}</p></div></div>
          <button type="button" className="btn-ghost" disabled={!data.hasTechnicalData} onClick={() => onNavigate?.('documentos')}>{data.hasTechnicalData ? 'Abrir documentos' : 'Aguardando configuração'} {data.hasTechnicalData && <Icon name="right" size={14}/>}</button>
        </section>
      </div>
    </main>
  )
}
