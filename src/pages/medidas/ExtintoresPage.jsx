import LinkNorma from '../../components/ui/LinkNorma'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { preenchido, inteiroPositivo } from '../../data/auditoriaProjeto'
import { useLocation } from 'react-router-dom'
import { useRef, useState } from 'react'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { supabase } from '../../lib/supabase'
import { riscoDoPavimento, calcularPavimento, areaLimiteUnidadeUnica, opcoesCapacidade, distanciaPortatil } from '../../data/extintores_calc'
import Icon from '../../components/ui/Icon'
import Checkbox from '../../components/ui/Checkbox'
import InlineEditableNome from '../../components/ui/InlineEditableNome'
import QuantityStepper from '../../components/ui/QuantityStepper'
import EstruturaSection from '../../components/ui/EstruturaSection'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import { useToast } from '../../hooks/useToast'
import { statusEstrutura, statusPorProgresso } from '../../utils/statusEstrutura'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { fmtUn } from '../../utils/numero'
import ObservacoesComplementares from '../../components/ui/ObservacoesComplementares'

// ── Importação do firedata.json (plugin Revit) ───────────────────────
// Formato esperado — um item por extintor físico (cada família do Revit
// vira um item; o site agrupa os itens idênticos de um mesmo ambiente e
// deduz a quantidade a partir da contagem):
//   { "extintores": { "_timestamp": "...", "itens": [
//       { "estrutura": "Estrutura 1", "pavimento": "Térreo", "ambiente": "Cozinha",
//         "tipo": "2A-20BC - 4 kg", "formato": "Portátil", "capacidade": "2-A:20-B:C", "carga": 4 },
//       ...
//   ] } }
//
// "estrutura" é casada por nome contra o que já está cadastrado no projeto
// (Etapa 2); quando vier vazia, o item entra na primeira estrutura do
// projeto. "pavimento" é casado por label dentro da estrutura resolvida; se
// não bater com nenhum label, tenta como "Nível N" do Revit (ver
// pavimentoPorNivelRevit — não cobre subsolo); se ainda assim não achar
// (nível vazio, subsolo não reconhecido etc.), cai no Térreo da estrutura.
// Quando o item vem com "pavimentoId" (plugin com a correlação "Nível <->
// Pavimento" já preenchida na dockpane — ver niveis_bridge.py/
// CorrelacaoNiveisModal.jsx), esse id é usado direto, ANTES de qualquer
// heurística de nome: é a única forma confiável quando o nome do Nível no
// Revit não tem nenhuma relação com o rótulo do pavimento (ex.: "Pavimento
// Inferior" correlacionado ao "Térreo" do site).
// "ambiente" vazio vira "Geral".
//
// "tipo" é o rótulo livre do produto no Revit (não corresponde às chaves
// internas do catálogo normativo) — o agente extintor (água/espuma/CO2/pó
// BC/pó ABC/classe K) é inferido a partir das classes da "capacidade" (ver
// inferirTipoKey). Quando "tipo" já bater com uma chave interna válida
// (agua|espuma|co2|po_bc|po_abc|halogenado|k_1a|k_2a), ela é usada diretamente.
// "formato" é "Portátil" ou "Sobre rodas" (aceito sem acento/maiúsculas).
// "carga" é a carga (peso) do agente extintor em kg.
function normFormato(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '')
}

// Deduz o agente extintor a partir das classes de fogo da capacidade
// (única informação confiável do agente que o Revit exporta hoje). Não
// distingue CO2/pó BC/halogenado — todos cobrem só B/C — então usa pó
// químico BC como padrão nesse caso, por ser o agente mais comum. Classe K
// (ex.: "1-A:K - 6L") também contém "A" — precisa ser checada ANTES da
// checagem de "A" isolado, senão seria confundida com água. Como "1-A:K" e
// "2-A:K" têm as mesmas classes (A, K), usa o multiplicador de classe A pra
// escolher entre as duas cargas cadastradas (ver TIPOS_PORTATIL).
function inferirTipoKey(capacidade, catalogo) {
  const cap = capacidade || ''
  const classes = new Set(cap.match(/[ABCK]/g) || [])
  let key = null
  if (classes.has('K')) {
    const m = cap.match(/(\d+)\s*-\s*A\s*:\s*K/i)
    key = m?.[1] === '2' ? 'k_2a' : 'k_1a'
  }
  else if (classes.has('A') && classes.has('B') && classes.has('C')) key = 'po_abc'
  else if (classes.has('A') && classes.has('B')) key = 'espuma'
  else if (classes.has('A')) key = 'agua'
  else if (classes.has('B') || classes.has('C')) key = 'po_bc'
  return catalogo.some(t => t.key === key) ? key : null
}

// Compara nomes/labels ignorando acento, caixa e espaços redundantes — o
// nome do nível no Revit e o label do pavimento cadastrado no site raramente
// são digitados de forma idêntica byte-a-byte.
function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// O Revit não sabe se um pavimento é térreo, subsolo ou andar superior — só
// enumera "níveis" (Nível 1, Nível 2, ...) na ordem em que foram criados no
// projeto. Quando o nome não bate com nenhum pavimento cadastrado, tenta
// casar "Nível N" pela mesma numeração que o site já usa internamente para
// os pavimentos acima do solo (id termina em "-P{n}": P1 é sempre o Térreo,
// P2 é o "Pavimento 2" etc. — estável mesmo se o label for renomeado). Não
// tenta adivinhar subsolo: a numeração de nível do Revit para subsolo varia
// por escritório (pode ser negativa, pode reiniciar em 1...), então para
// esses o nome ainda precisa bater (ex.: nível chamado literalmente "Subsolo 1").
function pavimentoPorNivelRevit(nomePavimento, estruturaId, pavimentos) {
  const m = norm(nomePavimento).match(/^(?:n[ií]vel|piso|level)\s*(\d+)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return pavimentos.find(p => p.estruturaId === estruturaId && p.id === `${estruturaId}-P${n}`) || null
}

// `estruturaIdForcado`: quando o lote vem do Supabase (uma linha por
// estrutura, já resolvida no envio — ver revit-sync), a estrutura de
// destino já é conhecida e não depende de casar o nome digitado no Revit
// (`it.estrutura`) contra o cadastro. Passado só na importação por arquivo
// manual (fallback), onde essa informação não existe fora do próprio JSON.
function resolverImportacao(json, estruturas, pavimentos, tiposPortatil, tiposSobreRodas, estruturaIdForcado) {
  const dados = json?.extintores
  if (!dados?.itens) throw new Error('Chave "extintores.itens" não encontrada no arquivo.')

  const grupos = new Map()
  const erros = []

  const estruturaForcada = estruturaIdForcado ? estruturas.find(e => e.id === estruturaIdForcado) : null
  if (estruturaIdForcado && !estruturaForcada) {
    throw new Error('Estrutura vinculada não encontrada no projeto — reconfigure o vínculo no plugin.')
  }

  dados.itens.forEach((it, i) => {
    const linha = `Item ${i + 1}`

    let est
    if (estruturaForcada) {
      est = estruturaForcada
    } else if (norm(it.estrutura)) {
      est = estruturas.find(e => norm(e.nome) === norm(it.estrutura))
      if (!est) { erros.push(`${linha}: estrutura "${it.estrutura}" não encontrada no projeto (cadastradas: ${estruturas.map(e => e.nome).join(', ') || 'nenhuma'}).`); return }
    } else {
      est = estruturas[0]
      if (!est) { erros.push(`${linha}: nenhuma estrutura cadastrada no projeto para receber o extintor.`); return }
    }

    const pav = (it.pavimentoId && pavimentos.find(p => p.estruturaId === est.id && p.id === it.pavimentoId))
      || pavimentos.find(p => p.estruturaId === est.id && norm(p.label) === norm(it.pavimento))
      || pavimentoPorNivelRevit(it.pavimento, est.id, pavimentos)
      || pavimentos.find(p => p.estruturaId === est.id && p.tipo === 'terreo')
    if (!pav) { erros.push(`${linha}: ${est.nome} não tem nenhum pavimento cadastrado para receber o extintor.`); return }

    const formato = normFormato(it.formato)
    if (formato !== 'portatil' && formato !== 'sobrerodas') {
      erros.push(`${linha}: formato "${it.formato}" inválido (use "portatil" ou "sobreRodas").`); return
    }
    const sobreRodas = formato === 'sobrerodas'
    const catalogo = sobreRodas ? tiposSobreRodas : tiposPortatil

    let tipoKey = catalogo.some(t => t.key === it.tipo) ? it.tipo : inferirTipoKey(it.capacidade, catalogo)
    const tipoInfo = catalogo.find(t => t.key === tipoKey)
    if (!tipoInfo) { erros.push(`${linha}: não foi possível determinar o agente extintor a partir de tipo "${it.tipo}" / capacidade "${it.capacidade}".`); return }

    let carga = ''
    if (it.carga != null && it.carga !== '') {
      const n = Number(it.carga)
      if (Number.isNaN(n)) { erros.push(`${linha}: carga "${it.carga}" inválida.`); return }
      carga = String(n)
    }

    const ambiente   = norm(it.ambiente) ? it.ambiente : 'Geral'
    const capacidade = (it.capacidade || tipoInfo.capacidadeMinima).trim()
    const chave = [est.id, pav.id, ambiente, tipoKey, sobreRodas, capacidade, carga].join('|')

    const existente = grupos.get(chave)
    if (existente) existente.quantidade += 1
    else grupos.set(chave, { estruturaId: est.id, pavimentoId: pav.id, ambiente, tipo: tipoKey, sobreRodas, capacidade, carga, quantidade: 1 })
  })

  return { resolvidos: [...grupos.values()], erros, timestamp: dados._timestamp || null }
}

// ── Shared UI ─────────────────────────────────────────────────────────
// overflow-clip (e não -hidden): recorta os cantos arredondados do mesmo
// jeito, mas não vira um contêiner de rolagem — sem isso a barra de seleção
// em massa (sticky, ver PavimentoCard) não grudaria na borda da tela.
function Card({ children, className = '' }) {
  return <div className={`bg-surface border border-solid border-border rounded-lg overflow-clip ${className}`}>{children}</div>
}
// `onClick` torna o cabeçalho um botão de retrair/expandir o card; sem a
// borda de baixo quando recolhido, pra não dobrar com a borda do Card.
function CardHeader({ children, onClick, aberto = true }) {
  return (
    <div onClick={onClick}
      className={`py-3 px-[18px] bg-surface-2 flex items-center gap-2 flex-wrap ${aberto ? 'border-b border-solid border-border' : ''} ${onClick ? 'cursor-pointer select-none' : ''}`}
    >
      {children}
    </div>
  )
}
function RiscoBadge({ risco }) {
  const map    = { baixo: 'low', medio: 'med', alto: 'high' }
  const labels = { baixo: 'Risco baixo', medio: 'Risco médio', alto: 'Risco alto' }
  if (!risco) return <span className="carga-class" style={{ background: 'var(--color-border-2)', color: 'var(--color-ink-faint)' }}>Risco pendente</span>
  return <span className={`carga-class ${map[risco]}`}>{labels[risco]}</span>
}
function Chip({ ok, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md font-semibold text-xs border border-solid ${ok ? 'bg-green-dim border-green-border text-green' : 'bg-red-dim border-red-border text-red'}`}>
      {ok ? '✓' : '✗'} {children}
    </span>
  )
}

// ── Grupo de ambientes a partir da lista flat de extintores ──────────
function agruparPorAmbiente(extintores) {
  const ordem = []
  const mapa = {}
  extintores.forEach(e => {
    if (!mapa[e.ambiente]) { mapa[e.ambiente] = []; ordem.push(e.ambiente) }
    mapa[e.ambiente].push(e)
  })
  return ordem.map(ambiente => ({ ambiente, itens: mapa[ambiente] }))
}

// ── Unidade extintora (folha do ambiente) — arrastável, card inteiro clicável ─
// Mesmo padrão do AmbienteChip das Saídas de Emergência (AcessosDescargasView):
// grip + checkbox de seleção + nome à esquerda, resumo à direita, clique
// abre o formulário de edição (ver ExtintorForm). O grip e o checkbox ficam
// fora do clique de editar. Com pelo menos uma unidade já selecionada
// (`modoSelecao`), clicar em qualquer lugar do card seleciona/desmarca em vez
// de abrir o formulário — só assim dá pra marcar várias rápido, sem mirar no
// checkbox de cada uma. Uma unidade só troca de ambiente (dentro do mesmo
// pavimento) — o ambiente em si não é destino de outro ambiente.
// `seguidores` (quando presente): { ids, delta } dos OUTROS cards que fazem
// parte da mesma seleção que o card que a mão pegou — cada um deles usa o
// MESMO delta do arrasto (não tem draggable próprio ativo), só que somado a
// um deslocamento fixo por posição na pilha, pra parecer uma pilha de
// cartas colada embaixo do card líder, acompanhando o mouse junto.
function UnidadeCard({ ext, tiposPortatil, tiposSobreRodas, onEdit, onRemove, selecionado, onToggleSelecao, modoSelecao, seguidores }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `ext:${ext.id}`, data: { kind: 'ext', id: ext.id, ambiente: ext.ambiente },
  })
  const tipoLabel = (ext.sobreRodas ? tiposSobreRodas : tiposPortatil).find(t => t.key === ext.tipo)?.label || ext.tipo
  const idxPilha = seguidores ? seguidores.ids.indexOf(ext.id) : -1
  const souSeguidor = idxPilha >= 0
  const style = isDragging
    ? (transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined)
    : souSeguidor
      ? {
          transform: `translate3d(${seguidores.delta.x}px, ${seguidores.delta.y + 10 + idxPilha * 8}px, 0)`,
          zIndex: 40 - idxPilha,
          opacity: Math.max(0.35, 0.85 - idxPilha * 0.12),
          pointerEvents: 'none',
        }
      : undefined
  return (
    <div ref={setNodeRef} style={style} onClick={() => modoSelecao ? onToggleSelecao(ext.id) : onEdit(ext.id)}
      className={`group flex items-center justify-between gap-3 py-2.5 px-3 rounded-md border border-solid bg-surface cursor-pointer transition-colors ${selecionado ? 'border-red' : 'border-border-2 hover:border-ink-hint'} ${isDragging ? 'opacity-40 relative z-50' : ''} ${souSeguidor ? 'relative shadow-[var(--shadow-md)]' : ''}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 max-w-[50%]">
        <button {...attributes} {...listeners} onClick={e => e.stopPropagation()} className="flex opacity-60 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-ink-faint touch-none shrink-0" title="Arrastar extintor">
          <Icon name="grip" size={13}/>
        </button>
        <Checkbox checked={selecionado} onChange={() => onToggleSelecao(ext.id)} title="Selecionar pra mover em massa"/>
        <span className="font-heading text-[13px] font-semibold text-ink truncate min-w-0">{tipoLabel}</span>
      </div>
      <div className="flex items-center gap-2.5 shrink-0 text-[11px] text-ink-faint whitespace-nowrap">
        <span>{ext.sobreRodas ? 'Sobre rodas' : 'Portátil'}</span>
        <span className="opacity-30">|</span>
        <span className="tabular-nums">{ext.capacidade || '—'}</span>
        {ext.carga !== '' && ext.carga != null && (
          <>
            <span className="opacity-30">|</span>
            <span>{fmtUn(ext.carga, 'kg', 2, `${ext.carga} kg`)}</span>
          </>
        )}
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[.06em]">Qtd.</span>
          <strong className="font-heading text-[16px] font-bold text-red leading-none">{parseInt(ext.quantidade) || 0}</strong>
        </span>
        <button onClick={e => { e.stopPropagation(); onRemove(ext.id) }} className="bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-1 ml-1" title="Excluir extintor">
          <Icon name="trash" size={12}/>
        </button>
      </div>
    </div>
  )
}

// ── Formulário de edição de uma unidade extintora (modal) ───────────────
// Mesmo formato do AmbienteForm das Saídas de Emergência (se_shared.jsx):
// campos em grade, rodapé com Cancelar/Salvar. A capacidade extintora nasce
// preenchida com o mínimo normativo do tipo (tabelas de capacidade mínima da NT 21 do estado),
// mas é livre para o projetista aumentar conforme a capacidade do agente
// efetivamente aplicado no projeto — trocar formato/tipo repõe o mínimo.
const inputClass = 'bg-bg border border-solid border-border rounded-md text-ink text-xs py-1.5 px-2.5 w-full outline-none box-border'

function Label({ children }) {
  return <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1">{children}</div>
}

function ExtintorForm({ ext, tiposPortatil, tiposSobreRodas, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    sobreRodas: !!ext.sobreRodas,
    tipo: ext.tipo,
    capacidade: ext.capacidade || '',
    carga: ext.carga != null ? String(ext.carga) : '',
    quantidade: parseInt(ext.quantidade) || 1,
  }))
  const catalogo = form.sobreRodas ? tiposSobreRodas : tiposPortatil

  const setFormato = valor => setForm(f => {
    const sobreRodas = valor === 'sobreRodas'
    const novoCatalogo = sobreRodas ? tiposSobreRodas : tiposPortatil
    const tipo = novoCatalogo.some(t => t.key === f.tipo) ? f.tipo : 'po_abc'
    return { ...f, sobreRodas, tipo, capacidade: novoCatalogo.find(t => t.key === tipo)?.capacidadeMinima || '' }
  })
  const setTipo = tipo => setForm(f => ({ ...f, tipo, capacidade: catalogo.find(t => t.key === tipo)?.capacidadeMinima || '' }))

  const podeSalvar = preenchido(form.tipo) && preenchido(form.capacidade) && inteiroPositivo(form.quantidade)
  const salvar = () => { if (!podeSalvar) return; onSave({
    sobreRodas: form.sobreRodas, tipo: form.tipo, capacidade: form.capacidade.trim(),
    carga: form.carga, quantidade: Math.max(1, form.quantidade),
  }) }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <Label>Formato</Label>
          <select className={inputClass} value={form.sobreRodas ? 'sobreRodas' : 'portatil'} onChange={e => setFormato(e.target.value)}>
            <option value="portatil">Portátil</option>
            <option value="sobreRodas">Sobre rodas</option>
          </select>
        </div>
        <div>
          <Label>Tipo <Obrigatorio/></Label>
          <select className={inputClass} value={form.tipo} onChange={e => setTipo(e.target.value)}>
            {catalogo.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <Label>Capacidade <Obrigatorio/></Label>
          <input className={`${inputClass} tabular-nums`} value={form.capacidade}
            onChange={e => setForm(f => ({ ...f, capacidade: e.target.value }))} onKeyDown={e => e.key === 'Enter' && salvar()}/>
        </div>
        <div>
          <Label>Carga (kg)</Label>
          <input className={inputClass} type="number" min="0" step="0.1" placeholder="ex.: 6" value={form.carga}
            onChange={e => setForm(f => ({ ...f, carga: e.target.value }))} onKeyDown={e => e.key === 'Enter' && salvar()}/>
        </div>
      </div>

      <div>
        <Label>Quantidade <Obrigatorio/></Label>
        <QuantityStepper value={form.quantidade} min={1} onChange={v => setForm(f => ({ ...f, quantidade: v }))}/>
      </div>

      <div className="flex items-center justify-end pt-3 mt-1 border-t border-solid border-border-2">
        <div className="flex gap-1.5">
          <button className="btn-ghost" onClick={onCancel}><Icon name="x" size={12}/> Cancelar</button>
          <button className="btn-primary" onClick={salvar} disabled={!podeSalvar}><Icon name="check" size={12}/> Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ── Ambiente (nó da lista) — arrastável, soltável, cabeçalho retrai/expande ─
// Mesmo padrão do AcessoCard das Saídas de Emergência: cabeçalho inteiro
// retrai/expande (o nome é editável inline pelo lápis), o card é destino de
// soltar unidades extintoras (mover unidade entre ambientes) e é arrastável
// pelo grip — arrastar um ambiente sobre outro só troca a ordem dos dois na
// lista; ambiente nunca vira filho de ambiente. Sem overflow-hidden no card
// (o cabeçalho arredonda o próprio canto): com ele, a unidade arrastada
// ficaria recortada ao sair do ambiente de origem.
function AmbienteCard({ estruturaId, pavimentoId, ambiente, itens, tiposPortatil, tiposSobreRodas, dispatch, selecionados, onToggleSelecao, onEditUnidade, onRemoveUnidade, seguidores }) {
  const [aberto, setAberto] = useState(true)

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `amb:${ambiente}`, data: { kind: 'amb', ambiente },
  })
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `drop-amb:${ambiente}`, data: { kind: 'ambiente', ambiente },
  })
  // Tanto a unidade quanto o ambiente arrastados guardam em data.ambiente o
  // ambiente de origem — só destaca o card como destino quando é outro.
  const destacar = isOver && active?.data.current?.ambiente !== ambiente
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  const totalQtd = itens.reduce((s, e) => s + (parseInt(e.quantidade) || 0), 0)

  const renomear = novoNome => dispatch({ type: 'RENAME_AMBIENTE_EXTINTOR', estruturaId, pavimentoId, ambienteAntigo: ambiente, ambienteNovo: novoNome })
  const remover = e => {
    e.stopPropagation()
    if (window.confirm(`Remover "${ambiente}" e ${itens.length === 1 ? 'o extintor' : `os ${itens.length} extintores`} dentro dele?`)) {
      dispatch({ type: 'REMOVE_AMBIENTE_EXTINTOR', estruturaId, pavimentoId, ambiente })
    }
  }

  return (
    <div ref={node => { setDragRef(node); setDropRef(node) }} style={style}
      className={`group rounded-lg border border-solid bg-surface transition-colors ${destacar ? 'border-red bg-[rgba(192,21,42,.05)]' : 'border-border hover:border-ink-hint'} ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className={`flex items-center justify-between gap-4 py-3 px-3.5 cursor-pointer select-none bg-surface-2 ${aberto ? 'rounded-t-[7px]' : 'rounded-[7px]'}`} onClick={() => setAberto(a => !a)}>
        <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
          <button {...attributes} {...listeners} onClick={e => e.stopPropagation()} className="flex opacity-60 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-ink-faint touch-none shrink-0" title="Arrastar ambiente (reordenar)">
            <Icon name="grip" size={14}/>
          </button>
          <Icon name={aberto ? 'chevD' : 'chevR'} size={15} className="text-ink-faint shrink-0"/>
          <InlineEditableNome value={ambiente} onCommit={renomear} textClassName="font-heading text-[15px] font-bold text-ink truncate"/>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-ink-faint whitespace-nowrap mr-1">{totalQtd} extintor{totalQtd !== 1 ? 'es' : ''}</span>
          <button onClick={remover} className="bg-transparent border-none text-ink-faint hover:text-red cursor-pointer p-1 ml-1" title="Remover ambiente e todos os extintores">
            <Icon name="trash" size={12}/>
          </button>
        </div>
      </div>
      {aberto && (
        <div className="pl-7 pr-3.5 pb-3.5 flex flex-col gap-2.5 border-t border-solid border-border-2 pt-3">
          {itens.map(ext => (
            <UnidadeCard key={ext.id} ext={ext} tiposPortatil={tiposPortatil} tiposSobreRodas={tiposSobreRodas}
              onEdit={onEditUnidade} onRemove={onRemoveUnidade}
              selecionado={selecionados.has(ext.id)} onToggleSelecao={onToggleSelecao} modoSelecao={selecionados.size > 0} seguidores={seguidores}/>
          ))}
          <div className="flex justify-center gap-2 pt-1">
            <button className="btn-ghost" onClick={() => dispatch({ type: 'ADD_EXTINTOR', estruturaId, pavimentoId, ambiente })}>
              <Icon name="plus" size={12}/> ADICIONAR EXTINTOR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Card de um pavimento ──────────────────────────────────────────────
function PavimentoCard({ pavimento, estruturaId, extintoresDoPav, cargaState, extNorma, dispatch }) {
  const { LIMIARES_RISCO, AREA_LIMITE_UNIDADE_UNICA, TIPOS_PORTATIL, TIPOS_SOBRE_RODAS, DISTANCIA_MAXIMA, NOTAS } = extNorma

  const risco = riscoDoPavimento(pavimento, cargaState, LIMIARES_RISCO)
  const grupos = agruparPorAmbiente(extintoresDoPav)
  const resultado = calcularPavimento(extintoresDoPav, risco, pavimento.area, {
    tiposPortatil: TIPOS_PORTATIL, tiposSobreRodas: TIPOS_SOBRE_RODAS,
    areaLimite: AREA_LIMITE_UNIDADE_UNICA,
  })

  const limiteArea = risco ? areaLimiteUnidadeUnica(risco, AREA_LIMITE_UNIDADE_UNICA) : null

  const adicionarAmbiente = () => {
    const nomesExistentes = new Set(grupos.map(g => g.ambiente))
    let n = grupos.length + 1
    while (nomesExistentes.has(`Ambiente ${n}`)) n++
    dispatch({ type: 'ADD_EXTINTOR', estruturaId, pavimentoId: pavimento.id, ambiente: `Ambiente ${n}` })
  }

  // ── Mover unidades entre ambientes (arrastar / seleção em massa) ──────
  // Tudo escopado ao pavimento: um DndContext por card, então uma unidade
  // nunca troca de pavimento — só de ambiente dentro dele.
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [alvoSelecao, setAlvoSelecao] = useState('')
  const { search } = useLocation()
  const alvoAudit = new URLSearchParams(search).get('audit') || ''
  const [editandoId, setEditandoId] = useState(() => extintoresDoPav.find(e => alvoAudit.startsWith(`${e.id}.`))?.id || null)
  // Recolhido, o conteúdo só fica escondido (`hidden`), não desmontado — a
  // seleção e o retraído/expandido de cada ambiente sobrevivem ao fechar.
  const [aberto, setAberto] = useState(true)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Seleção só vale pro que ainda existe no pavimento — uma unidade apagada
  // (ou removida junto com o ambiente) sai da seleção sozinha.
  const idsSelecionados = extintoresDoPav.filter(e => selecionados.has(e.id)).map(e => e.id)
  const selecionadosValidos = new Set(idsSelecionados)
  const alvoValido = alvoSelecao !== '' && grupos.some(g => g.ambiente === alvoSelecao)

  const toggleSelecao = id => setSelecionados(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const limparSelecao = () => { setSelecionados(new Set()); setAlvoSelecao('') }
  const moverPara = (ids, ambiente) => dispatch({ type: 'MOVER_EXTINTORES', estruturaId, pavimentoId: pavimento.id, ids, ambiente })
  const moverSelecionados = () => {
    if (!idsSelecionados.length || !alvoValido) return
    moverPara(idsSelecionados, alvoSelecao)
    limparSelecao()
  }
  const apagarSelecionados = () => {
    if (!idsSelecionados.length) return
    if (!window.confirm(`Apagar ${idsSelecionados.length} ${idsSelecionados.length > 1 ? 'itens selecionados' : 'item selecionado'}?`)) return
    idsSelecionados.forEach(id => dispatch({ type: 'REMOVE_EXTINTOR', id }))
    limparSelecao()
  }

  // Pilha visual de cards durante um arrasto em lote — ver `seguidores` em
  // UnidadeCard. Só existe (não-null) enquanto a unidade que a mão pegou faz
  // parte de uma seleção com mais de uma; do contrário o arrasto é normal
  // (só aquele card se move, comportamento de sempre do dnd-kit).
  const [pilha, setPilha] = useState(null)

  const handleDragStart = ({ active }) => {
    const a = active.data.current
    if (a?.kind === 'ext' && idsSelecionados.length > 1 && idsSelecionados.includes(a.id)) {
      setPilha({ ids: idsSelecionados.filter(id => id !== a.id), delta: { x: 0, y: 0 } })
    }
  }
  const handleDragMove = ({ delta }) => setPilha(prev => (prev ? { ...prev, delta } : prev))
  const handleDragCancel = () => setPilha(null)

  const handleDragEnd = ({ active, over }) => {
    setPilha(null)
    const a = active.data.current
    const o = over?.data.current
    if (!a || o?.kind !== 'ambiente') return

    if (a.kind === 'ext') {
      // Arrastar uma unidade que faz parte da seleção leva o conjunto
      // inteiro junto, não só a linha que a mão pegou.
      const emLote = idsSelecionados.length > 1 && idsSelecionados.includes(a.id)
      if (!emLote && o.ambiente === a.ambiente) return
      moverPara(emLote ? idsSelecionados : [a.id], o.ambiente)
      if (emLote) limparSelecao()
      return
    }

    // kind === 'amb': só reordena — soltar um ambiente sobre outro põe o
    // arrastado na posição do alvo. Não existe ambiente dentro de ambiente.
    if (o.ambiente === a.ambiente) return
    const nomes = grupos.map(g => g.ambiente)
    const de = nomes.indexOf(a.ambiente)
    const para = nomes.indexOf(o.ambiente)
    if (de < 0 || para < 0) return
    const ordem = [...nomes]
    ordem.splice(de, 1)
    ordem.splice(para, 0, a.ambiente)
    dispatch({ type: 'ORDENAR_AMBIENTES_EXTINTOR', estruturaId, pavimentoId: pavimento.id, ordem })
  }

  // Formulário de edição (modal) da unidade clicada — ver ExtintorForm. Se a
  // unidade some enquanto o formulário está aberto (ex.: apagada em outra
  // aba), o modal simplesmente fecha.
  const extEditando = extintoresDoPav.find(e => e.id === editandoId) || null
  const removerUnidade = id => dispatch({ type: 'REMOVE_EXTINTOR', id })

  const conforme = resultado.temA && resultado.temBC && resultado.minimoAtendido

  return (
    <Card className="mb-4">
      <CardHeader aberto={aberto} onClick={() => setAberto(a => !a)}>
        <Icon name={aberto ? 'chevD' : 'chevR'} size={15} className="text-ink-faint shrink-0"/>
        <span className="text-[13px] font-semibold text-ink">{pavimento.label} <Obrigatorio id={`${pavimento.id}.extintores`}/></span>
        <RiscoBadge risco={risco}/>
        <span className="text-[11px] text-ink-faint ml-auto flex items-center gap-3">
          {!aberto && <span>{resultado.totalUnidades} unidade{resultado.totalUnidades !== 1 ? 's' : ''} extintora{resultado.totalUnidades !== 1 ? 's' : ''}</span>}
          {pavimento.area && <span>{fmtUn(pavimento.area, 'm²', 2, `${pavimento.area} m²`)}</span>}
        </span>
      </CardHeader>

      {/* Resultado — o que importa, em primeiro lugar */}
      <div className={`py-3.5 px-[18px] border-b border-solid border-border ${conforme ? 'bg-green-dim' : 'bg-amber-dim'} ${aberto ? '' : 'hidden'}`}>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="shrink-0 text-center">
            <div className="text-2xl font-bold text-ink leading-none">{resultado.totalUnidades}</div>
            <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mt-1 whitespace-nowrap">unidade{resultado.totalUnidades !== 1 ? 's' : ''} extintora{resultado.totalUnidades !== 1 ? 's' : ''}</div>
          </div>

          {risco && (
            <div className="shrink-0 text-center border-l border-solid border-border pl-6">
              <div className="text-sm font-bold text-ink leading-none whitespace-nowrap">
                {distanciaPortatil(extNorma, risco)} m <span className="font-normal text-ink-faint">/</span> {DISTANCIA_MAXIMA.sobreRodas[risco]} m
              </div>
              <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mt-1 whitespace-nowrap">dist. máx. portátil / sobre rodas</div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap border-l border-solid border-border pl-6">
            <Chip ok={resultado.temA}>Classe A</Chip>
            <Chip ok={resultado.temBC}>Classes B/C</Chip>
            <Chip ok={resultado.minimoAtendido}>Mínimo do pavimento</Chip>
          </div>
        </div>

        {(!resultado.minimoAtendido || resultado.viaUnidadeUnica) && (
          <div className="text-[11px] text-ink-faint leading-[1.6] mt-3 pt-3 border-t border-solid border-border-2">
            {!resultado.minimoAtendido && NOTAS.minimoPorPavimento}
            {resultado.viaUnidadeUnica && `Atendido pela exceção de unidade única — ${NOTAS.unidadeUnica} (área do pavimento ≤ ${fmtUn(limiteArea, 'm²')} para o risco ${risco}).`}
          </div>
        )}
      </div>

      {/* collisionDetection=pointerWithin: o destino do drag é o card de
          ambiente sob o ponteiro do mouse (mesmo critério das Saídas de
          Emergência — o padrão do dnd-kit compara a área do item arrastado
          com a de cada card e erra o destino quando o item é mais largo). */}
      <DndContext sensors={sensors} collisionDetection={pointerWithin}
        onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}
      >
        <div className={`py-3.5 px-[18px] ${aberto ? '' : 'hidden'}`}>
          {!risco && (
            <div className="ibox amber">
              <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
              <span className="text-xs">A carga de incêndio deste pavimento ainda não foi classificada na Etapa 5 (Carga de Incêndio) — o risco predominante não pode ser determinado até lá.</span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {grupos.map(g => (
              <AmbienteCard
                key={g.ambiente}
                estruturaId={estruturaId}
                pavimentoId={pavimento.id}
                ambiente={g.ambiente}
                itens={g.itens}
                tiposPortatil={TIPOS_PORTATIL}
                tiposSobreRodas={TIPOS_SOBRE_RODAS}
                dispatch={dispatch}
                selecionados={selecionadosValidos}
                onToggleSelecao={toggleSelecao}
                onEditUnidade={setEditandoId}
                onRemoveUnidade={removerUnidade}
                seguidores={pilha}
              />
            ))}
            {grupos.length === 0 && (
              <div className="p-8 text-center text-ink-faint text-[13px] border border-dashed border-border rounded-lg">
                Nenhum ambiente criado ainda. Clique abaixo para começar.
              </div>
            )}
          </div>

          <div className="flex justify-center mt-3">
            <button className="btn-ghost" onClick={adicionarAmbiente}>
              <Icon name="plus" size={12}/> ADICIONAR AMBIENTE
            </button>
          </div>
        </div>
      </DndContext>

      {/* Barra de seleção em massa — sticky no rodapé do card, pra ficar
          visível enquanto houver unidades marcadas (só unidades extintoras
          têm checkbox; ambiente não é selecionável). */}
      {aberto && idsSelecionados.length > 0 && (
        <div className="sticky bottom-0 z-10 flex items-center gap-3 flex-wrap py-2.5 px-[18px] border-t border-solid border-red bg-surface-2 shadow-[0_-8px_24px_rgba(0,0,0,.35)]">
          <span className="text-xs font-semibold text-ink whitespace-nowrap">
            {idsSelecionados.length} {idsSelecionados.length > 1 ? 'itens selecionados' : 'item selecionado'}
          </span>
          <select value={alvoSelecao} onChange={e => setAlvoSelecao(e.target.value)}
            className="w-auto flex-1 max-w-[320px] text-xs py-1.5 bg-transparent"
          >
            <option value="">Mover para...</option>
            {grupos.map(g => <option key={g.ambiente} value={g.ambiente}>{g.ambiente}</option>)}
          </select>
          <button className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed" disabled={!alvoValido} onClick={moverSelecionados}>
            <Icon name="check" size={12}/> Mover
          </button>
          <button className="inline-flex items-center gap-1.5 bg-transparent border border-solid border-red text-red hover:bg-red hover:text-white cursor-pointer text-xs font-semibold rounded-md py-1.5 px-3 transition-colors" onClick={apagarSelecionados}>
            <Icon name="trash" size={12}/> Apagar selecionados
          </button>
          <button className="bg-transparent border-none text-ink-faint hover:text-ink cursor-pointer text-xs underline ml-auto" onClick={limparSelecao}>
            Cancelar seleção
          </button>
        </div>
      )}

      {extEditando && (
        <div className="fixed inset-0 z-[600] bg-black/65 backdrop-blur-sm flex items-center justify-center" onClick={() => setEditandoId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-solid border-border rounded-lg w-[560px] max-w-[95vw] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-heading text-base font-bold text-ink">Editar extintor</span>
              <button onClick={() => setEditandoId(null)} className="bg-transparent border-none text-ink-faint hover:text-ink cursor-pointer p-1"><Icon name="x" size={14}/></button>
            </div>
            <ExtintorForm ext={extEditando} tiposPortatil={TIPOS_PORTATIL} tiposSobreRodas={TIPOS_SOBRE_RODAS}
              onSave={changes => { dispatch({ type: 'UPDATE_EXTINTOR', id: extEditando.id, changes }); setEditandoId(null) }}
              onCancel={() => setEditandoId(null)}/>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Referência normativa (topo da página) ────────────────────────────
const RISCO_ROWS = [
  { key: 'baixo', label: 'Risco baixo' },
  { key: 'medio', label: 'Risco médio' },
  { key: 'alto',  label: 'Risco alto' },
]

function RefLabel({ children }) {
  return <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">{children}</div>
}

// Unidade extintora mínima (extintores portáteis) e distância máxima a
// percorrer por nível de risco (CAPACIDADE_POR_NIVEL da norma), uma linha
// por opção — a PB tem duas no nível III (ver opcoesCapacidade em
// data/extintores_calc.js).
function TabelaCapacidadePorRisco({ extNorma, classe }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-surface-2">
          <th className="text-[10px] text-ink-faint uppercase tracking-[.06em] font-medium py-2 px-2.5 text-left border-b border-solid border-border">Risco</th>
          <th className="text-[10px] text-ink-faint uppercase tracking-[.06em] font-medium py-2 px-2.5 text-right border-b border-solid border-border">Capacidade mínima</th>
          <th className="text-[10px] text-ink-faint uppercase tracking-[.06em] font-medium py-2 px-2.5 text-right border-b border-solid border-border">Dist. máxima</th>
        </tr>
      </thead>
      <tbody>
        {RISCO_ROWS.flatMap(r => {
          const ops = opcoesCapacidade(extNorma, r.key)
          return (ops.length ? ops : [null]).map((op, i) => (
            <tr key={`${r.key}-${i}`}>
              <td className="py-1.5 px-2.5 text-sm text-ink border-b border-solid border-border-2">{i === 0 ? r.label : 'ou'}</td>
              <td className="py-1.5 px-2.5 text-sm font-semibold text-ink tabular-nums text-right border-b border-solid border-border-2">{op?.[classe]?.capacidade ?? '—'}</td>
              <td className="py-1.5 px-2.5 text-sm font-semibold text-ink tabular-nums text-right border-b border-solid border-border-2">{op?.[classe] ? `${op[classe].distanciaMaxima} m` : '—'}</td>
            </tr>
          ))
        })}
      </tbody>
    </table>
  )
}

function ReferenciaNormativa({ extNorma }) {
  const { TIPOS_PORTATIL, TIPOS_SOBRE_RODAS, DISTANCIA_MAXIMA, ALTURA_INSTALACAO, LOCAIS_RISCO_ESPECIAL, DISTANCIA_ENTRADA_ESCADA } = extNorma
  const [open, setOpen] = useState(false)

  return (
    <Card className="mb-8">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full py-3 px-[18px] border-b border-solid border-border bg-surface-2 flex items-center gap-2 text-left"
      >
        <span className="text-[13px] font-semibold text-ink">Parâmetros normativos{extNorma.NORMA?.sigla ? ` (${extNorma.NORMA.sigla})` : ''}</span>
        <span className="text-[11px] text-ink-faint">distâncias, capacidades mínimas e alturas de instalação</span>
        <Icon name="chevD" size={14} className={`ml-auto text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && <div className="py-3.5 px-[18px] flex flex-col gap-4">
        <div>
          <RefLabel>Distância máxima a percorrer</RefLabel>
          <div className="border border-solid border-border rounded-md overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2">
                  <th className="text-[10px] text-ink-faint uppercase tracking-[.06em] font-medium py-2 px-2.5 text-left border-b border-solid border-border">Risco</th>
                  <th className="text-[10px] text-ink-faint uppercase tracking-[.06em] font-medium py-2 px-2.5 text-right border-b border-solid border-border">Portátil</th>
                  <th className="text-[10px] text-ink-faint uppercase tracking-[.06em] font-medium py-2 px-2.5 text-right border-b border-solid border-border">Sobre rodas</th>
                </tr>
              </thead>
              <tbody>
                {RISCO_ROWS.map(r => (
                  <tr key={r.key}>
                    <td className="py-1.5 px-2.5 text-sm text-ink border-b border-solid border-border-2">{r.label}</td>
                    <td className="py-1.5 px-2.5 text-sm font-semibold text-ink tabular-nums text-right border-b border-solid border-border-2">{DISTANCIA_MAXIMA.portatil[r.key]} m</td>
                    <td className="py-1.5 px-2.5 text-sm font-semibold text-ink tabular-nums text-right border-b border-solid border-border-2">{DISTANCIA_MAXIMA.sobreRodas[r.key]} m</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 px-2.5 text-sm text-ink border-b border-solid border-border-2">Classe D (metais)</td>
                  <td className="py-1.5 px-2.5 text-sm font-semibold text-ink tabular-nums text-right border-b border-solid border-border-2" colSpan={2}>{DISTANCIA_MAXIMA.classeD} m</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <RefLabel>Capacidade extintora mínima por risco de incêndio (extintores portáteis)</RefLabel>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">Classe A</div>
              <div className="border border-solid border-border rounded-md overflow-hidden">
                <TabelaCapacidadePorRisco extNorma={extNorma} classe="A"/>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">Classe B</div>
              <div className="border border-solid border-border rounded-md overflow-hidden">
                <TabelaCapacidadePorRisco extNorma={extNorma} classe="B"/>
              </div>
            </div>
          </div>
        </div>

        <div>
          <RefLabel>Capacidade extintora mínima por tipo</RefLabel>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">Portátil</div>
              <ul className="flex flex-col gap-1">
                {TIPOS_PORTATIL.map(t => (
                  <li key={t.key} className="text-[13px] text-ink-muted flex justify-between gap-2">
                    <span>{t.label}</span><span className="tabular-nums font-semibold text-ink">{t.capacidadeMinima}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">Sobre rodas</div>
              <ul className="flex flex-col gap-1">
                {TIPOS_SOBRE_RODAS.map(t => (
                  <li key={t.key} className="text-[13px] text-ink-muted flex justify-between gap-2">
                    <span>{t.label}</span><span className="tabular-nums font-semibold text-ink">{t.capacidadeMinima}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div>
          <RefLabel>Altura de instalação</RefLabel>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="text-ink-muted">Suporte de parede</span>
              <span className="tabular-nums font-semibold text-ink">{ALTURA_INSTALACAO.suporteParede.alturaMinimaBase}–{ALTURA_INSTALACAO.suporteParede.alturaMaxima} m</span>
            </div>
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="text-ink-muted">Apoiado no piso</span>
              <span className="tabular-nums font-semibold text-ink">{ALTURA_INSTALACAO.apoiadoPiso.min}–{ALTURA_INSTALACAO.apoiadoPiso.max} m</span>
            </div>
          </div>
        </div>

        <div>
          <RefLabel>Entrada e escadas</RefLabel>
          <div className="text-[13px] text-ink-muted leading-[1.6]">Pelo menos um extintor a até {DISTANCIA_ENTRADA_ESCADA} m da entrada principal da edificação e das escadas nos demais pavimentos.</div>
        </div>

        <div>
          <RefLabel>Locais de risco especial (exigem extintor próprio)</RefLabel>
          <div className="flex flex-wrap gap-1.5">
            {LOCAIS_RISCO_ESPECIAL.map(local => (
              <span key={local} className="text-[11px] text-ink-muted bg-surface-2 border border-solid border-border-2 rounded py-1 px-2">{local}</span>
            ))}
          </div>
        </div>
      </div>}
    </Card>
  )
}

// ── Page Principal ────────────────────────────────────────────────────
export default function ExtintoresPage() {
  const { state, dispatch } = useProjeto()
  const { extintores: extNorma } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()
  const toast = useToast()

  // Resultado de uma importação do Revit: pendências viram um aviso de erro e
  // o que foi importado, um de sucesso.
  const notificarImportacao = (info, erros) => {
    if (erros.length > 0) {
      toast.error(`${erros.length === 1 ? 'Um item não pôde ser importado' : `${erros.length} itens não puderam ser importados`}: ${erros.join(' ')}`)
    }
    if (info) toast.success(`${info.total} extintor${info.total !== 1 ? 'es' : ''} importado${info.total !== 1 ? 's' : ''} do Revit${info.timestamp ? ` — exportação: ${info.timestamp}` : ''}. Esta importação substituiu o cadastro anterior.`)
  }
  const [buscando, setBuscando] = useState(false)
  // Id da estrutura sendo atualizada individualmente (botão "Atualizar" no
  // card dela, ver handleBuscarRevitEstrutura) — null quando nenhuma está
  // em busca. Separado de `buscando` (o "Buscar do Revit" do cabeçalho,
  // que busca todas de uma vez).
  const [buscandoEstruturaId, setBuscandoEstruturaId] = useState(null)
  const fileInputRef = useRef(null)

  // Aplica o payload da chave "extintores" (vindo de um arquivo ou do
  // Supabase) — mesmo parser de sempre, só muda a origem do JSON.
  // `estruturaIdForcado`: presente no pull do Supabase (uma linha por
  // estrutura), ausente no upload manual de arquivo.
  const aplicarExtintores = (payloadExtintores, estruturaIdForcado) => {
    try {
      const { resolvidos, erros, timestamp } = resolverImportacao(
        { extintores: payloadExtintores }, state.estruturas, state.pavimentos,
        extNorma.TIPOS_PORTATIL, extNorma.TIPOS_SOBRE_RODAS, estruturaIdForcado
      )
      if (resolvidos.length > 0) dispatch({ type: 'IMPORT_EXTINTORES', itens: resolvidos })
      return { total: resolvidos.length, erros, timestamp }
    } catch (err) {
      return { total: 0, erros: [err.message || 'Dados inválidos.'], timestamp: null }
    }
  }

  const handleImport = e => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result)
        const { total, erros, timestamp } = aplicarExtintores(json.extintores)
        notificarImportacao({ timestamp, total }, erros)
      } catch (err) {
        notificarImportacao(null, [err.message || 'Arquivo inválido.'])
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  // Busca uma linha por estrutura (cada arquivo Revit sincroniza a sua) e
  // aplica cada uma escopada — a importação de uma estrutura não mexe no
  // cadastro das demais (ver IMPORT_EXTINTORES em ProjetoContext.jsx).
  const handleBuscarRevit = async () => {
    setBuscando(true)
    const { data, error } = await supabase
      .from('revit_syncs_latest').select('estrutura_id, payload').eq('projeto_id', state.id).eq('medida', 'extintores')
    setBuscando(false)
    if (error) {
      notificarImportacao(null, [`Falha ao consultar o Supabase: ${error.message}`])
      return
    }
    if (!data || data.length === 0) {
      notificarImportacao(null, ['Nenhum dado de extintores sincronizado do Revit ainda para este projeto.'])
      return
    }
    let totalGeral = 0
    const errosGeral = []
    let timestampMaisRecente = null
    for (const row of data) {
      const { total, erros, timestamp } = aplicarExtintores(row.payload, row.estrutura_id)
      totalGeral += total
      errosGeral.push(...erros)
      if (timestamp && (!timestampMaisRecente || timestamp > timestampMaisRecente)) timestampMaisRecente = timestamp
    }
    notificarImportacao({ timestamp: timestampMaisRecente, total: totalGeral }, errosGeral)
  }

  // Mesma busca de handleBuscarRevit, mas escopada a uma única estrutura
  // (botão "Atualizar" no card dela) — útil quando só o modelo Revit
  // daquela estrutura mudou, sem precisar re-sincronizar as demais.
  const handleBuscarRevitEstrutura = async estruturaId => {
    setBuscandoEstruturaId(estruturaId)
    const { data, error } = await supabase
      .from('revit_syncs_latest').select('payload').eq('projeto_id', state.id)
      .eq('medida', 'extintores').eq('estrutura_id', estruturaId).maybeSingle()
    setBuscandoEstruturaId(null)
    if (error) {
      notificarImportacao(null, [`Falha ao consultar o Supabase: ${error.message}`])
      return
    }
    if (!data) {
      notificarImportacao(null, ['Nenhum dado de extintores sincronizado do Revit ainda para esta estrutura.'])
      return
    }
    const { total, erros, timestamp } = aplicarExtintores(data.payload, estruturaId)
    notificarImportacao({ timestamp, total }, erros)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        <div className="flex items-start justify-between gap-4 mb-7">
          <div>
            <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
            <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
              <Icon name={SISTEMA_ICON.extintores} size={20} color="var(--color-red)" className="shrink-0"/>
              Sistema de Proteção por Extintores de Incêndio
            <LinkNorma sistema="extintores"/>
          </h2>
            <p className="w-full text-[13px] text-ink-faint leading-[1.6] m-0">
              Distribuição de extintores por estrutura, pavimento e ambiente conforme a {extNorma.NORMA?.sigla || 'norma de extintores do estado'}. Cadastre manualmente ou importe do plugin Revit — o risco predominante (que define a área-limite para unidade única) vem da carga de incêndio classificada na Etapa 5.
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport}/>
            <button className="btn-ghost flex items-center gap-1.5 whitespace-nowrap" onClick={handleBuscarRevit} disabled={buscando}>
              <Icon name="upload" size={13}/>
              {buscando ? 'Buscando…' : 'Buscar do Revit'}
            </button>
            <button type="button" className="text-[10px] text-ink-faint hover:text-ink underline bg-transparent border-none cursor-pointer p-0" onClick={() => fileInputRef.current?.click()}>
              ou importar de um arquivo .json
            </button>
          </div>
        </div>

        <ReferenciaNormativa extNorma={extNorma}/>

        {state.estruturas.map(est => {
          const pavimentos = state.pavimentos.filter(p => p.estruturaId === est.id)
          const pe = porEstrutura.find(p => p.estrutura.id === est.id)
          const exigido = !!pe?.sistemas?.extintores?.ativo
          const comExtintor = pavimentos.filter(pav => state.extintores.some(e => e.pavimentoId === pav.id)).length
          // Pavimento com extintor que não atende (classe A, B/C ou mínimo por
          // pavimento) conta como pendência — mesmo com dados importados.
          const pendencias = pavimentos.filter(pav => {
            const doPav = state.extintores.filter(e => e.pavimentoId === pav.id)
            if (doPav.length === 0) return false
            const r = calcularPavimento(doPav, riscoDoPavimento(pav, state.cargaState, extNorma.LIMIARES_RISCO), pav.area, {
              tiposPortatil: extNorma.TIPOS_PORTATIL, tiposSobreRodas: extNorma.TIPOS_SOBRE_RODAS,
              areaLimite: extNorma.AREA_LIMITE_UNIDADE_UNICA,
            })
            return !(r.temA && r.temBC && r.minimoAtendido)
          }).length
          const base = statusPorProgresso(comExtintor, Math.max(pavimentos.length, 1), {
            pendente: 'Aguardando dados', andamento: `${comExtintor} de ${pavimentos.length} pavimentos`, concluido: 'Dados carregados',
          })
          const status = !exigido
            ? statusEstrutura('concluido', 'Não exigida')
            : pendencias > 0
            ? statusEstrutura('andamento', `${pendencias} pavimento${pendencias === 1 ? '' : 's'} com pendência`)
            : base
          const semPendencias = pendencias === 0 && comExtintor >= Math.max(pavimentos.length, 1)
          return (
            <EstruturaSection key={est.id} titulo={est.nome} status={status} conclusao={exigido ? { estruturaId: est.id, medida: 'extintores', auto: !!est.origemRevit?.extintores && semPendencias } : null} defaultOpen={false} extra={
              <div className="flex items-center gap-2">
                <EstruturaHeaderInfo estrutura={est} mostrar={['risco']}/>
                {exigido && (
                  <button type="button" className="btn-ghost text-[10px] py-1 px-2 gap-1"
                    onClick={e => { e.stopPropagation(); handleBuscarRevitEstrutura(est.id) }}
                    disabled={buscandoEstruturaId === est.id}
                    title="Buscar do Revit só os dados desta estrutura">
                    <Icon name="upload" size={10}/>
                    {buscandoEstruturaId === est.id ? 'Buscando…' : 'Atualizar'}
                  </button>
                )}
              </div>
            }>
              {!exigido ? (
                <div className="ibox green">
                  <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
                  <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam a proteção por extintores, conforme a tabela de exigências do estado.</span>
                </div>
              ) : pavimentos.length === 0 ? (
                <div className="ibox amber">
                  <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
                  <span className="text-xs">Nenhum pavimento cadastrado nesta estrutura ainda — configure os pavimentos na Etapa 2.</span>
                </div>
              ) : pavimentos.map(pav => (
                <PavimentoCard
                  key={pav.id}
                  pavimento={pav}
                  estruturaId={est.id}
                  extintoresDoPav={state.extintores.filter(e => e.pavimentoId === pav.id)}
                  cargaState={state.cargaState[est.id] || {}}
                  extNorma={extNorma}
                  dispatch={dispatch}
                />
              ))}
              <ObservacoesComplementares estrutura={est} medida="extintores"/>
            </EstruturaSection>
          )
        })}

      </div>
    </div>
  )
}
