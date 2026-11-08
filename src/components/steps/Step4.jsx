import Obrigatorio from '../ui/Obrigatorio'
import { useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useCnaeCnpjLookup } from '../../hooks/useCnaeCnpjLookup'
import Icon from '../ui/Icon'
import EstruturaSection from '../ui/EstruturaSection'
import EstruturaHeaderInfo from '../ui/EstruturaHeaderInfo'
import InfoTip from '../ui/InfoTip'
import { fmtUn, fmtNum } from '../../utils/numero'
import { classificarPavimentos } from '../../utils/classificacao'
import ExtensaoConfig from '../../estados/ExtensaoConfig'

const blockTitle = 'text-[11px] font-medium text-ink-faint uppercase tracking-[.08em] mb-3 pb-2 border-b border-solid border-border flex items-center justify-between'
const AREA_OCUPACAO_TIP = 'Informe a área dedicada a esta atividade neste pavimento. Esse valor ajuda a identificar as ocupações principal, secundária e subsidiária. A área informada aqui não aparece no memorial; nele é apresentada a área construída da estrutura.'

function maskCNAE(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 7)
  if (d.length <= 4) return d
  if (d.length === 5) return d.slice(0, 4) + '-' + d[4]
  return d.slice(0, 4) + '-' + d[4] + '/' + d.slice(5, 7)
}

function findGlobally(cargaMap, cnae) {
  for (const [div, cnaes] of Object.entries(cargaMap)) {
    if (cnaes[cnae]) return { cnae, divisao: div, grupo: div.charAt(0), ...cnaes[cnae] }
  }
  return null
}

// ── CNAE Autocomplete ─────────────────────────────────────────────────
function CnaeBusca({ auditPrefix, divisao, value, descValue, onSelect, onDescChange, onAutoFill }) {
  const { cnaesDiv, cargaMap } = useNorma()
  const [query, setQuery]     = useState(value || '')
  const [open, setOpen]       = useState(false)
  const [results, setResults] = useState([])
  const ref = useRef()
  const allCnaes = Object.entries(cnaesDiv(divisao))

  useEffect(() => { setQuery(value || '') }, [value])

  const populate = (q) => {
    if (!q) {
      setResults(allCnaes.map(([cnae, d]) => ({ cnae, divisao, ...d })))
    } else {
      const ql = q.toLowerCase()
      setResults(
        allCnaes
          .filter(([cnae, d]) => cnae.includes(q) || d.descricao.toLowerCase().includes(ql))
          .map(([cnae, d]) => ({ cnae, divisao, ...d }))
      )
    }
  }

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleFocus = () => { populate(query); setOpen(true) }
  const handleInput = (e) => {
    const raw = e.target.value
    // Assim que aparece uma letra, é busca por descrição ("hospital",
    // "escola"...) — não pelo número do CNAE. maskCNAE descartaria toda
    // letra digitada (só deixa passar dígito), então precisa desviar dela
    // nesse caso pra deixar o texto livre chegar em populate().
    if (/[a-zA-ZÀ-ſ]/.test(raw)) {
      setQuery(raw)
      populate(raw); setOpen(true)
      return
    }
    const masked = maskCNAE(raw)
    setQuery(masked)
    if (masked.length === 9) {
      const found = findGlobally(cargaMap, masked)
      if (found) { setOpen(false); onAutoFill?.(found); return }
    }
    populate(masked); setOpen(true)
  }
  const handleSelect = (item) => { setQuery(item.cnae); setOpen(false); onSelect(item) }
  const handleClear  = () => { setQuery(''); onSelect({ cnae:'', descricao:'', cargaIncendio:null }); setOpen(false) }

  const selectedData = value ? cnaesDiv(divisao)[value] : null
  // `results` só é populado quando o usuário interage com o campo (foco/
  // digitação — ver populate()) — quando o CNAE chega por fora (ex.: botão
  // "Usar esta classificação" de BuscaCnaePorCnpj, que despacha direto no
  // pavimento sem passar por este componente), `results` fica vazio mesmo
  // com um `value` válido, e sem o `!selectedData` aqui "CNAE não
  // encontrado" aparecia por engano pra CNAEs que já estavam corretamente
  // catalogados (o texto da carga de incêndio ficava certo, só a mensagem
  // de erro que era falsa).
  const naoEncontrado = !selectedData && query.length >= 3 && results.length === 0

  return (
    <div ref={ref} className="relative">
      <div className="fg">
        <label>
          CNAE <Obrigatorio id={`${auditPrefix}.cnae`}/>
          <InfoTip side="bottom" align="start" text="Clique no campo para ver todos os CNAEs desta divisão, ou digite o número ou parte da descrição para filtrar."/>
        </label>
        <div className="relative">
          <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"/>
          <input value={query} onChange={handleInput} onFocus={handleFocus}
            placeholder="Buscar por número ou descrição…"
            className={`pl-8 ${query ? 'pr-[30px]' : 'pr-3'}`}/>
          {query && (
            <button onClick={handleClear} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-ink-faint cursor-pointer p-0.5">
              <Icon name="x" size={12}/>
            </button>
          )}
        </div>
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-surface border border-solid border-red-border rounded-md z-[400] max-h-[260px] overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,.5)]">
            <div className="px-3 py-1.5 text-[10px] text-ink-faint border-b border-solid border-border-2 bg-surface-2">
              {results.length} resultado{results.length !== 1 ? 's' : ''} {query ? `para "${query}"` : `em ${divisao}`}
            </div>
            {results.map((r, i) => (
              <div key={i} onClick={() => handleSelect(r)}
                className="px-3 py-2.5 cursor-pointer border-b border-solid border-border-2 grid grid-cols-[90px_1fr_72px] gap-3 items-center hover:bg-red-dim">
                <span className="text-xs tabular-nums text-red font-semibold">{r.cnae}</span>
                <span className="text-xs text-ink leading-[1.4]">{r.descricao}</span>
                <div className={`text-center border border-solid rounded-sm py-1 px-1.5 ${r.cargaIncendio<=300?'bg-green-dim border-green-border':r.cargaIncendio<=1200?'bg-amber-dim border-amber-border':'bg-red-dim border-red-border'}`}>
                  <div className={`text-sm font-bold leading-none ${r.cargaIncendio<=300?'text-green':r.cargaIncendio<=1200?'text-amber':'text-red'}`}>{r.cargaIncendio}</div>
                  <div className="text-[9px] text-ink-faint mt-px">MJ/m2</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedData && (
        <div className="mt-2 text-[12px] text-ink-muted leading-[1.5] py-2 px-3 bg-surface-2 rounded-md border border-solid border-border">
          <span className="tabular-nums text-ink mr-2">{value}</span>
          {selectedData.descricao}
        </div>
      )}
      {naoEncontrado && (
        <div className="fg mt-2">
          <label>CNAE não encontrado — descreva a atividade <Obrigatorio id={`${auditPrefix}.cnaeDesc`}/></label>
          <input value={descValue || ''} onChange={e => onDescChange(e.target.value)} placeholder="Descreva a atividade para referencia no memorial"/>
        </div>
      )}
    </div>
  )
}

// ── Preencher a classificação a partir do CNPJ ─────────────────────────
// Disponível em qualquer pavimento (não só Térreo) — busca manual: o
// usuário clica "Preencher do CNPJ" (o CNPJ já foi informado na Etapa 1,
// Responsável pelo uso), e aparecem botões com os candidatos de CNAE
// encontrados pra escolher qual preencher neste pavimento.
//
// O CNAE principal da Receita nem sempre está cadastrado na base normativa
// (ex.: principal genérico tipo "Lojas de departamentos", mas secundário
// específico — "Supermercados" — já catalogado): por isso sempre aparece
// um botão pro principal (preenche só o CNAE quando ele não bate com
// nenhuma divisão da norma) e, só quando o principal não bateu, um segundo
// botão com o primeiro CNAE secundário que bateu (preenche grupo, divisão
// e CNAE de uma vez).
function BuscaCnaePorCnpj({ pav, dispatch }) {
  const { state } = useProjeto()
  const { buscar, limpar, loading, error, resultado } = useCnaeCnpjLookup()
  const cnpjDigits = (state.respCNPJ || '').replace(/\D/g, '')

  const aplicar = (opcao) => {
    if (!opcao) return
    // Sem match (CNAE da Receita nao cadastrado na base normativa), Grupo e
    // Divisao ficam sem selecao — manter o valor anterior (geralmente o
    // default da primeira divisao) passava a falsa impressao de que o CNAE
    // bateu com aquela classificacao.
    const changes = opcao.match
      ? { grupo: opcao.match.grupo, divisao: opcao.match.divisao, cnae: opcao.cnae, cnaeDesc: opcao.descricao }
      : { grupo: '', divisao: '', cnae: opcao.cnae, cnaeDesc: opcao.descricao }
    dispatch({ type: 'UPDATE_PAV', id: pav.id, changes })
    limpar()
  }

  if (!resultado && !loading && !error) {
    // Sem CNPJ válido na Etapa 1 não há o que buscar: o atalho nem aparece.
    if (cnpjDigits.length !== 14) return null
    return (
      <div className="mb-5">
        <button type="button" className="btn-ghost" onClick={() => buscar(state.respCNPJ)}>
          <Icon name="search" size={12}/> Preencher do CNPJ
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="text-xs text-ink-faint mb-5">Buscando CNAE pelo CNPJ do projeto...</div>
  }
  if (error) {
    return (
      <div className="ibox red mb-5" role="alert">
        <Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/>
        <span className="text-xs">{error}</span>
        <button type="button" className="btn-ghost ml-auto shrink-0" onClick={limpar}>Tentar de novo</button>
      </div>
    )
  }

  const { principal, secundario } = resultado
  return (
    <div className="ibox blue mb-5 flex-col items-stretch gap-2.5">
      <div className="flex items-start gap-2.5">
        <Icon name="info" size={14} color="var(--color-blue)" className="shrink-0 mt-0.5"/>
        <div className="text-xs leading-[1.6]">
          <div className="font-semibold text-ink mb-0.5">CNAE encontrado pelo CNPJ da Etapa 1</div>
          Escolha qual CNAE preencher neste pavimento. Pode ser diferente da ocupação real — confirme antes de usar.
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <button type="button" className="btn-ghost" onClick={() => aplicar(principal)}>
          {principal.cnae} — {principal.descricao}{!principal.match ? ' (sem carga de incêndio cadastrada)' : ''}
        </button>
        {secundario && (
          <button type="button" className="btn-ghost" onClick={() => aplicar(secundario)}>
            {secundario.cnae} — {secundario.descricao}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={limpar}>Descartar</button>
      </div>
    </div>
  )
}

// ── Linha de ocupação subsidiária ─────────────────────────────────────
function AcessRow({ pav, acess, index, usadas, classificacao }) {
  const { dispatch } = useProjeto()
  const { ocupacoes, grupos } = useNorma()
  const areaPreenchida = Number(String(acess.area || '').replace(',', '.')) > 0

  const grupoAtual  = acess.divisao?.charAt(0) || Object.keys(ocupacoes)[0] || 'A'
  const divisoesGrp = ocupacoes[grupoAtual]?.divisoes || {}
  const gruposKeys  = Object.keys(ocupacoes)

  const setGrupo    = (g) => {
    const firstDiv = Object.keys(ocupacoes[g]?.divisoes || {})[0] || ''
    dispatch({ type:'UPDATE_ACESS', id:pav.id, index, changes:{ divisao:firstDiv, cnae:'', cnaeDesc:'' } })
  }
  const setDivisao  = (d) => dispatch({ type:'UPDATE_ACESS', id:pav.id, index, changes:{ divisao:d, cnae:'', cnaeDesc:'' } })
  const setCNAE     = (item) => dispatch({ type:'UPDATE_ACESS', id:pav.id, index, changes:{ cnae:item.cnae, cnaeDesc:item.descricao } })
  const setCnaeDesc = (v) => dispatch({ type:'UPDATE_ACESS', id:pav.id, index, changes:{ cnaeDesc:v } })
  const setArea     = (v) => dispatch({ type:'UPDATE_ACESS', id:pav.id, index, changes:{ area:v } })

  const handleAutoFill = (found) => {
    dispatch({ type:'UPDATE_ACESS', id:pav.id, index, changes:{ divisao:found.divisao, cnae:found.cnae, cnaeDesc:found.descricao } })
  }

  return (
    <div className="border border-solid border-border rounded-lg p-4 bg-bg">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium text-ink">Ocupação {index + 2}</span>
          <span className={`text-[11px] rounded-full px-2 py-1 border border-solid ${classificacao?.isMista ? 'text-amber border-amber-border bg-amber-dim' : 'text-ink-muted border-border'}`}>
            {classificacao?.percentual == null || !areaPreenchida ? 'Classificação a definir' : classificacao.isMista ? 'Secundária' : 'Subsidiária'}
          </span>
          <InfoTip text="A classificação é automática: até 10% da área construída da estrutura, este uso é subsidiário; acima de 10%, é secundário e entra na ocupação mista."/>
        </div>
        <button className="btn-del" title="Remover ocupação adicional" aria-label="Remover ocupação adicional"
          onClick={() => dispatch({ type:'REMOVE_ACESS', id:pav.id, index })}>
          <Icon name="trash" size={13}/>
        </button>
      </div>
      {areaPreenchida && classificacao?.percentual != null && <p className={`text-xs mb-3 ${classificacao.isMista ? 'text-amber' : 'text-ink-muted'}`}>
        Esta atividade ocupa {fmtNum(classificacao.percentual)}% da área construída da estrutura, somando todos os pavimentos.{classificacao.isMista ? ' Como ocupa mais de 10%, é uma ocupação secundária: a edificação passa a ser classificada pelos seus diferentes usos (ocupação mista).' : ' Como ocupa até 10%, é uma ocupação subsidiária: um uso de apoio à atividade principal.'}
      </p>}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3 mb-3.5">
        <div className="fg">
          <label>Grupo <Obrigatorio id={`${pav.id}.acess.${index}.grupo`}/></label>
          <select value={grupoAtual} onChange={e => setGrupo(e.target.value)}>
            {gruposKeys.map(g => (
              <option key={g} value={g}>{g} — {grupos[g] || g}</option>
            ))}
          </select>
        </div>
        <div className="fg">
          <label>Divisão <Obrigatorio id={`${pav.id}.acess.${index}.divisao`}/></label>
          <select value={acess.divisao} onChange={e => setDivisao(e.target.value)} title={divisoesGrp[acess.divisao] ? `${acess.divisao} — ${divisoesGrp[acess.divisao]}` : undefined}>
            {Object.entries(divisoesGrp).map(([code, label]) => {
              const jaUsada = usadas.has(code) && code !== acess.divisao
              return <option key={code} value={code} disabled={jaUsada}>{code} — {label}{jaUsada?' (já utilizada)':''}</option>
            })}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3 items-start">
        <CnaeBusca auditPrefix={`${pav.id}.acess.${index}`} divisao={acess.divisao} value={acess.cnae || ''} descValue={acess.cnaeDesc || ''}
          onSelect={setCNAE} onDescChange={setCnaeDesc} onAutoFill={handleAutoFill}/>
        <div className="fg">
          <label>Área (m²) <Obrigatorio id={`${pav.id}.acess.${index}.area`}/><InfoTip text={AREA_OCUPACAO_TIP}/></label>
          <input type="number" value={acess.area} onChange={e => setArea(e.target.value)} placeholder="0"/>
        </div>
      </div>
    </div>
  )
}

// ── Modal de classificação do pavimento ───────────────────────────────
function PavModal({ pav, onClose }) {
  const { state, dispatch } = useProjeto()
  const { ocupacoes, grupos } = useNorma()
  const estrutura = state.estruturas.find(e => e.id === pav.estruturaId)
  const classificacao = classificarPavimentos(state.pavimentos.filter(p => p.estruturaId === pav.estruturaId), estrutura?.areaTotal)

  const gruposKeys = Object.keys(ocupacoes)
  const divisoes   = ocupacoes[pav.grupo]?.divisoes || {}

  const setGrupo    = (g) => {
    const firstDiv = Object.keys(ocupacoes[g]?.divisoes || {})[0] || ''
    dispatch({ type:'UPDATE_PAV', id:pav.id, changes:{ grupo:g, divisao:firstDiv, cnae:'', cnaeDesc:'' } })
  }
  const setDivisao  = (d) => dispatch({ type:'UPDATE_PAV', id:pav.id, changes:{ divisao:d, cnae:'', cnaeDesc:'' } })
  const setArea     = (v) => dispatch({ type:'UPDATE_PAV', id:pav.id, changes:{ area:v } })
  const setCNAE     = (item) => dispatch({ type:'UPDATE_PAV', id:pav.id, changes:{ cnae:item.cnae, cnaeDesc:item.descricao } })
  const setCnaeDesc = (v) => dispatch({ type:'UPDATE_PAV', id:pav.id, changes:{ cnaeDesc:v } })
  const handleAutoFill = (found) => {
    dispatch({ type:'UPDATE_PAV', id:pav.id, changes:{ grupo:found.grupo, divisao:found.divisao, cnae:found.cnae, cnaeDesc:found.descricao } })
  }

  const usadas = new Set([pav.divisao, ...pav.acess.map(a => a.divisao)])

  return (
    <div
      className="fixed inset-0 z-[500] bg-black/65 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-surface border border-solid border-border rounded-lg w-[760px] max-w-[96vw] max-h-[92vh] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,.55)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 py-[18px] px-[24px] border-b border-solid border-border shrink-0">
          <div className="min-w-0">
            <h3 className="m-0 flex items-center gap-2 font-heading text-[19px] font-semibold text-ink leading-tight">
              <Icon name="stair" size={17} className="text-ink-faint shrink-0"/>{pav.label}
            </h3>
            <div className="text-[12px] text-ink-faint mt-1 truncate">{estrutura?.nome || 'Estrutura'}</div>
          </div>
          <div className="flex gap-2 items-center shrink-0">
            {pav.tipo === 'terreo' && (
              <>
                <button className="btn-ghost text-[12px]"
                  onClick={() => dispatch({ type:'REPLICATE_TERREO', estruturaId: pav.estruturaId })}>
                  <Icon name="check" size={12}/> Repetir para todos
                </button>
                <InfoTip side="bottom" align="end" text="Copia esta classificação do térreo para todos os outros pavimentos desta estrutura."/>
              </>
            )}
            <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar">
              <Icon name="x" size={14}/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-6 px-[24px]">

          <BuscaCnaePorCnpj pav={pav} dispatch={dispatch}/>

          {/* Ocupação principal */}
          <div className="flex flex-col gap-3">
          <div className="border border-solid border-border rounded-lg p-4 bg-bg">
            <div className="flex items-center gap-2 mb-3.5">
              <span className="text-[12px] font-medium text-ink">Ocupação principal <Obrigatorio id={`${pav.estruturaId}.pavimentos`}/></span>
              <InfoTip text="Atividade ou uso principal exercido na edificação ou área de risco (ocupação predominante)."/>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3 mb-3.5">
              <div className="fg">
                <label>Grupo <Obrigatorio id={`${pav.id}.grupo`}/></label>
                <select value={pav.grupo} onChange={e => setGrupo(e.target.value)}>
                  {gruposKeys.map(g => (
                    <option key={g} value={g}>{g} — {grupos[g] || g}</option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label>Divisão <Obrigatorio id={`${pav.id}.divisao`}/></label>
                <select value={pav.divisao} onChange={e => setDivisao(e.target.value)} title={divisoes[pav.divisao] ? `${pav.divisao} — ${divisoes[pav.divisao]}` : undefined}>
                  {Object.entries(divisoes).map(([code, label]) => {
                    const jaUsada = pav.acess.some(a => a.divisao === code)
                    return <option key={code} value={code} disabled={jaUsada}>{code} — {label}{jaUsada?' (já utilizada)':''}</option>
                  })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3 items-start">
              <CnaeBusca auditPrefix={pav.id} divisao={pav.divisao} value={pav.cnae} descValue={pav.cnaeDesc}
                onSelect={setCNAE} onDescChange={setCnaeDesc} onAutoFill={handleAutoFill}/>
              <div className="fg">
                <label>Área (m²) <Obrigatorio id={`${pav.id}.area`}/><InfoTip text={AREA_OCUPACAO_TIP}/></label>
                <input type="number" value={pav.area} onChange={e => setArea(e.target.value)} placeholder="0"/>
              </div>
            </div>
          </div>

          {/* Cada ocupação adicional é um box da mesma lista. */}
                {pav.acess.map((a, i) => (
                  <AcessRow key={i} pav={pav} acess={a} index={i} usadas={usadas} classificacao={classificacao.subsidiariasRaw.find(c => c.divisao === a.divisao)}/>
                ))}
            <button className="btn-add"
              onClick={() => dispatch({ type:'ADD_ACESS', id:pav.id })}>
              <Icon name="plus" size={11}/> Adicionar ocupação
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="py-3.5 px-[24px] border-t border-solid border-border flex justify-end shrink-0">
          <button className="btn-primary" onClick={onClose}>Concluir</button>
        </div>
      </div>
    </div>
  )
}

// ── Card resumo do pavimento ──────────────────────────────────────────
function PavCard({ pav, classificacao, onOpen }) {
  const { ocupacoes, temCNAE, cnaesDiv, grupos } = useNorma()
  const divisoes = ocupacoes[pav.grupo]?.divisoes || {}
  const divLabel = divisoes[pav.divisao] || pav.divisao || '—'
  // Divisoes sem nenhum CNAE cadastrado (ex: J-1..J-4) nunca terao pav.cnae
  // preenchido — contam como classificadas so com a divisao definida.
  const configured = !!(pav.divisao && (pav.cnae || !temCNAE(pav.divisao)))
  const grupoLabel = grupos?.[pav.divisao?.charAt(0) || pav.grupo] || ''
  const cnaeDesc = pav.cnae ? (pav.cnaeDesc || cnaesDiv(pav.divisao)[pav.cnae]?.descricao || '') : ''
  // So ocupacoes secundarias (>10% da area construida) aparecem no card; subsidiarias ficam ocultas aqui.
  const acessSecundarias = pav.acess.filter(a => classificacao?.subsidiariasRaw?.find(c => c.divisao === a.divisao)?.isMista)

  return (
    <div
      onClick={onOpen}
      className={`bg-surface rounded-lg mb-2 cursor-pointer transition-colors duration-150 border border-solid hover:border-ink-hint ${configured ? 'border-border' : 'border-dashed border-border-2'}`}
    >
      <div className="flex items-center justify-between gap-5 py-3.5 px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-faint uppercase tracking-[.06em] leading-none mb-1.5">
            <Icon name="stair" size={13}/>{pav.label}
          </div>

          {configured ? (
            <>
              {/* CNAE: o que o pavimento faz (principal) */}
              {pav.cnae ? (
                <div className="text-[14px] font-semibold text-ink leading-[1.4]">
                  {cnaeDesc || 'Atividade sem descrição'}
                </div>
              ) : (
                <div className="text-[14px] font-semibold text-ink leading-[1.4]">{divLabel}</div>
              )}
              <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-faint mt-1.5">
                {pav.cnae && <span>CNAE <span className="tabular-nums text-ink-muted">{pav.cnae}</span></span>}
                {pav.cnae && pav.area && <span aria-hidden="true">·</span>}
                {pav.area && <span>{fmtUn(pav.area, 'm²', 2, `${pav.area} m²`)}</span>}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-ink-faint">Clique para classificar</div>
          )}

          {/* Ocupacoes secundarias (subsidiarias ficam ocultas no card) */}
          {acessSecundarias.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-solid border-border-2 flex flex-col gap-2">
              <div className="text-[10px] font-medium text-ink-faint uppercase tracking-[.08em]">
                {acessSecundarias.length === 1 ? 'Ocupação secundária' : 'Ocupações secundárias'}
              </div>
              {acessSecundarias.map((a, i) => {
                const aDivLabel = (ocupacoes[a.divisao?.charAt(0)]?.divisoes || {})[a.divisao]
                const aCnaeDesc = a.cnae ? (a.cnaeDesc || cnaesDiv(a.divisao)[a.cnae]?.descricao || '') : ''
                return (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-[14px] font-semibold text-ink leading-[1.4]">
                      {aCnaeDesc || aDivLabel || a.divisao}
                      <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-faint mt-1.5">
                        {a.cnae && <span>CNAE <span className="tabular-nums text-ink-muted">{a.cnae}</span></span>}
                        {a.cnae && a.area && <span aria-hidden="true">·</span>}
                        {a.area && <span>{fmtUn(a.area, 'm²', 2, `${a.area} m²`)}</span>}
                      </div>
                    </div>
                    <span className="tabular-nums text-[11px] font-semibold text-ink-muted py-0.5 px-2 rounded bg-surface-2 border border-solid border-border shrink-0">{a.divisao}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Grupo e, ao lado, a divisao (resultado, em destaque) */}
        <div className="flex items-center gap-3 shrink-0">
          {configured && pav.divisao && (
            <div className="flex items-center gap-3">
              {grupoLabel && (
                <span className="text-[12px] text-ink-faint text-right leading-[1.35] max-w-[170px]">Grupo {pav.divisao?.charAt(0) || pav.grupo} — {grupoLabel}</span>
              )}
              <span className="tabular-nums text-[16px] font-bold text-ink py-1 px-3 rounded-md bg-red-dim border border-solid border-red-border">{pav.divisao}</span>
            </div>
          )}
          <span className="text-ink-faint"><Icon name="chevD" size={14} className="-rotate-90"/></span>
        </div>
      </div>
    </div>
  )
}

// ── Step 4 principal ──────────────────────────────────────────────────
export default function Step4({ step, totalSteps }) {
  const { state }    = useProjeto()
  const { search } = useLocation()
  const alvoAudit = new URLSearchParams(search).get('audit') || ''
  const [openId, setOpenId] = useState(() => state.pavimentos.find(p => alvoAudit.startsWith(`${p.id}.`))?.id || null)

  const openPav = state.pavimentos.find(p => p.id === openId)

  return (
    <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">
      <div className="mb-[26px]">
        <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]">Etapa {step} de {totalSteps}</div>
        <h2 className="text-[22px] font-semibold text-ink mb-[5px]">Classificacao por pavimento</h2>
        <p className="text-[13px] text-ink-faint leading-[1.6]">Clique em um pavimento para classificar sua ocupacao principal e ocupacoes subsidiarias.</p>
      </div>

      {state.pavimentos.length === 0
        ? <div className="ibox amber"><Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/><span>Defina o numero de pavimentos na Etapa 2.</span></div>
        : state.estruturas.map(est => {
            const pavsEst = state.pavimentos.filter(p => p.estruturaId === est.id)
            if (!pavsEst.length) return null
            const classificacaoEst = classificarPavimentos(pavsEst, est.areaTotal)
            return (
              <EstruturaSection key={est.id} titulo={est.nome} extra={<EstruturaHeaderInfo estrutura={est} mostrar={['area', 'ocupacao']}/> }>
                <div>
                  <div className={blockTitle}>Pavimentos</div>
                  {pavsEst.map(pav => (
                    <PavCard key={pav.id} pav={pav} classificacao={classificacaoEst} onOpen={() => setOpenId(pav.id)}/>
                  ))}
                </div>
              </EstruturaSection>
            )
          })
      }

      {state.tipoProjeto !== 'dimensionamento' && <ExtensaoConfig ponto="classificacao"/>}

      {openPav && <PavModal pav={openPav} onClose={() => setOpenId(null)}/>}
    </div>
  )
}
