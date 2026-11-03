import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuditoria } from '../../context/AuditoriaContext'
import Icon from './Icon'
import { useProjeto } from '../../context/ProjetoContext'
import { statusEstrutura } from '../../utils/statusEstrutura'

// Container colapsavel para blocos "por estrutura" — usado em toda tela que
// repete conteudo (formulario, cards, tabela) uma vez pra cada estrutura do
// projeto (torre/bloco). Comeca aberto por padrao (as telas de medidas de
// seguranca passam defaultOpen={false}); o estado aberto/fechado e local a
// tela (nao persiste entre navegacoes nem entra no estado do projeto).
//
// E um card com borda propria (nao so um cabecalho) para que o conteudo
// aberto fique visualmente contido — sem isso, formularios longos de uma
// estrutura se misturam com os da estrutura seguinte.
//
// overflow-clip (e não -hidden): recorta os cantos arredondados igual, mas
// não vira um contêiner de rolagem — com hidden, qualquer `sticky` dentro
// (ex.: barra de seleção em massa dos Extintores) grudaria na borda deste
// card em vez da borda da tela.
//
// `status` ({ tone, label }, ver utils/statusEstrutura.js) mostra, mesmo com o
// card fechado, se a configuração/os dados da estrutura estão pendentes ou
// resolvidos: pílula ao lado do título + linha de destaque na borda esquerda.
const STATUS_TONE = {
  pendente:  { pill: 'bg-surface-2 border-border text-ink-faint',                          bar: 'bg-border',  dot: 'ring-1 ring-current bg-transparent' },
  andamento: { pill: 'bg-amber-dim border-amber-border text-amber',                            bar: 'bg-amber',     dot: 'bg-current shadow-[0_0_8px_currentColor]' },
  concluido: { pill: 'bg-green-dim border-green-border text-green',                            bar: 'bg-green',     dot: '' },
  atencao:   { pill: 'bg-red-dim border-red-border text-red',                   bar: 'bg-red',       dot: 'bg-current shadow-[0_0_8px_currentColor]' },
}

function StatusPill({ status }) {
  const t = STATUS_TONE[status.tone] || STATUS_TONE.pendente
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 py-[3px] pl-2 pr-2.5 rounded-full border border-solid text-[10px] font-semibold tracking-[.02em] whitespace-nowrap shrink-0 ${t.pill}`}
    >
      {status.tone === 'concluido'
        ? <Icon name="check" size={11} strokeWidth={3}/>
        : <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${t.dot}`}/>}
      {status.label}
    </span>
  )
}

// `conclusao` ({ estruturaId, medida, auto }) liga o "concluir" manual: a
// estrutura só fica verde quando o usuário a marca como concluída (botão no
// fim do card) — enquanto isso, mesmo com tudo preenchido, o status fica
// amarelo ("Revisar e concluir"), já que os dados ainda podem mudar. `auto`
// = já vem concluída sem ação do usuário (ex.: dados sincronizados do Revit,
// ou medida não exigida); a escolha explícita do usuário (concluir/reabrir)
// sempre vale mais que `auto`. Fica em estrutura.concluidas[medida].
function useConclusao(conclusao, status) {
  const { state, dispatch } = useProjeto()
  if (!conclusao) return { status }
  const est = state.estruturas.find(e => e.id === conclusao.estruturaId)
  const escolha = est?.concluidas?.[conclusao.medida]
  const concluida = escolha ?? !!conclusao.auto
  const definir = value => dispatch({
    type: 'SET_ESTRUTURA_FIELD', id: conclusao.estruturaId, field: 'concluidas',
    value: { ...(est?.concluidas || {}), [conclusao.medida]: value },
  })
  let efetivo = status
  if (concluida) {
    if (!status || status.tone !== 'concluido') efetivo = statusEstrutura('concluido', 'Concluída')
    else if (escolha === true) efetivo = statusEstrutura('concluido', 'Concluída')
  } else if (status?.tone === 'concluido') {
    efetivo = statusEstrutura('andamento', 'Revisar e concluir')
  }
  return { status: efetivo, concluida, automatica: escolha === undefined && concluida, definir }
}

function BarraConclusao({ concluida, automatica, definir, pendencias = [] }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-4 pt-3.5 border-t border-solid border-border">
      <span className="text-[11px] text-ink-faint leading-[1.5]">
        {concluida
          ? (automatica ? 'Concluída com os dados sincronizados do Revit. Reabra se precisar revisar.' : 'Estrutura marcada como concluída. Reabra para voltar a acompanhar o status.')
          : pendencias.length ? `Preencha os campos obrigatórios antes de concluir: ${pendencias.map(p => p.rotulo).join('; ')}.` : 'Enquanto não for marcada como concluída, a estrutura permanece em amarelo.'}
      </span>
      <button type="button" disabled={!concluida && pendencias.length > 0} onClick={() => definir(!concluida)} className={concluida ? 'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-solid border-blue-border bg-blue-dim px-3.5 text-xs font-semibold text-blue transition-colors hover:border-blue hover:bg-blue hover:text-white shrink-0' : 'btn-success shrink-0'}>
        <Icon name={concluida ? 'edit' : 'check'} size={13}/>
        {concluida ? 'Reabrir' : 'Marcar como concluída'}
      </button>
    </div>
  )
}

// `pendenciasExtras` ([{ rotulo }]): pendências que só a própria tela sabe
// calcular (ex.: Compartimentação) e que, somadas às da auditoria, também
// travam o "Marcar como concluída".
export default function EstruturaSection({ titulo, extra, status: statusBase, conclusao, pendenciasExtras = [], defaultOpen = true, children }) {
  const { search } = useLocation()
  const [open, setOpen] = useState(defaultOpen || new URLSearchParams(search).has('audit'))
  const c = useConclusao(conclusao, statusBase)
  const { pendencias } = useAuditoria()
  const rota = [`medida/${conclusao?.medida}`]
  const pendenciasMedida = [...pendencias.filter(p => (!p.estruturaId || p.estruturaId === conclusao?.estruturaId) && rota.includes(p.rota)), ...pendenciasExtras]
  const status = c.status
  const bar = status ? (STATUS_TONE[status.tone] || STATUS_TONE.pendente).bar : null

  return (
    <div className="relative mb-5 border border-solid border-border rounded-lg overflow-clip bg-surface transition-colors duration-300 ease-out hover:border-ink-hint focus-within:border-ink-hint last:mb-0">
      {bar && <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-[2px] ${bar} opacity-80`}/>}
      <div
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2.5 py-4 px-4 cursor-pointer select-none group ${open ? 'border-b border-solid border-border' : ''}`}
      >
        <Icon
          name="chevD"
          size={14}
          className={`text-ink-faint shrink-0 transition-transform duration-150 group-hover:text-ink ${open ? '' : '-rotate-90'}`}
        />
        <h3 className="text-sm font-bold text-ink m-0 min-w-0 max-w-[40%] shrink-0 truncate">{titulo}</h3>
        {status && <StatusPill status={status}/>}
        <div className="flex-1"/>
        <div className="min-w-0">{extra}</div>
      </div>
      {open && <div className="p-4">{children}{conclusao && <BarraConclusao {...c} pendencias={pendenciasMedida}/>}</div>}
    </div>
  )
}
