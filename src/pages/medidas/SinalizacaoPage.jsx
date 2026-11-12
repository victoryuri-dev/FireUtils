import LinkNorma from '../../components/ui/LinkNorma'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { useLocation } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { supabase } from '../../lib/supabase'
import { calcularSinalizacaoEstrutura } from '../../data/sinalizacao_calc'
import Icon from '../../components/ui/Icon'
import InfoTip from '../../components/ui/InfoTip'
import EstruturaSection from '../../components/ui/EstruturaSection'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import { useToast } from '../../hooks/useToast'
import { statusEstrutura } from '../../utils/statusEstrutura'

const statusSinalizacao = qtd => qtd > 0
  ? statusEstrutura('concluido', `${qtd} tipo${qtd === 1 ? '' : 's'} de placa`)
  : statusEstrutura('pendente', 'Aguardando dados')

// ── Importação do firedata.json / Supabase (plugin Revit) ────────────
// Formato esperado (ver comentário completo no final do arquivo):
//   { "sinalizacao": { "_timestamp": "...", "itens": [
//       { "estrutura": "Estrutura 1", "tipoPlaca": "S1", "quantidade": 3 },
//       ...
//   ] } }
//
// Granularidade só até estrutura — as famílias de placa (categoria
// "Dispositivos de Segurança", parâmetro de tipo "Código da Placa") não são
// lançadas por pavimento no Revit, então o plugin já envia o quantitativo
// agregado por estrutura, sem pavimento. "estrutura" é casada por nome/label
// contra o que já está cadastrado no projeto (Etapa 2) — o plugin não
// precisa (e não consegue) conhecer os IDs internos gerados pelo app.
// "tipoPlaca" aceita o código oficial da placa (ex.: "S1-E", "E5",
// case-insensitive) — a chave interna do catálogo (ex.: "s1_e") também é
// aceita.
//
// `estruturaIdForcado`: presente no pull do Supabase (uma linha por
// estrutura, já resolvida no envio — ver revit-sync), ausente no upload
// manual de arquivo, onde essa informação não existe fora do próprio JSON.
function resolverImportacaoSinalizacao(json, estruturas, tiposPlaca, estruturaIdForcado) {
  const dados = json?.sinalizacao
  if (!dados?.itens) throw new Error('Chave "sinalizacao.itens" não encontrada no arquivo.')

  const norm = s => (s || '').trim().toLowerCase()
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
      if (!est) { erros.push(`${linha}: estrutura "${it.estrutura}" não encontrada no projeto.`); return }
    } else {
      est = estruturas[0]
      if (!est) { erros.push(`${linha}: nenhuma estrutura cadastrada no projeto para receber a placa.`); return }
    }

    const chaveInformada = norm(it.tipoPlaca)
    const tipoInfo = tiposPlaca.find(t => t.key === chaveInformada || norm(t.codigo) === chaveInformada)
    if (!tipoInfo) { erros.push(`${linha}: placa "${it.tipoPlaca}" não reconhecida.`); return }

    const quantidade = parseInt(it.quantidade) || 1
    const chave = `${est.id}|${tipoInfo.key}`
    const existente = grupos.get(chave)
    if (existente) existente.quantidade += quantidade
    else grupos.set(chave, { estruturaId: est.id, tipoPlaca: tipoInfo.key, quantidade })
  })

  return { resolvidos: [...grupos.values()], erros, timestamp: dados._timestamp || null }
}

// ── Shared UI ─────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return <div className={`bg-surface border border-solid border-border rounded-lg overflow-hidden ${className}`}>{children}</div>
}
function EmptyState({ texto }) {
  return (
    <div className="border border-solid border-border rounded-lg py-12 px-6 text-center bg-surface mb-8">
      <Icon name="sign" size={28} className="mx-auto mb-3 block text-ink-faint opacity-40"/>
      <div className="text-[13px] text-ink-faint leading-[1.6] max-w-[420px] mx-auto">{texto}</div>
    </div>
  )
}
function RefLabel({ children }) {
  return <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">{children}</div>
}
// Cor da tag de código por categoria — alerta é amarelo, orientação/saída é
// verde, proibição e equipamentos são vermelhos (mesmas cores dos pictogramas
// da NBR 13434).
function corTagCategoria(categoriaKey) {
  if (categoriaKey === 'alerta')     return 'bg-amber border-amber text-white'
  if (categoriaKey === 'orientacao') return 'bg-green border-green text-white'
  return 'bg-red border-red text-white'
}
function StepperButton({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="w-6 h-6 flex items-center justify-center rounded border border-solid border-border-2 text-ink-muted hover:border-red-border hover:text-red transition-colors shrink-0">
      {children}
    </button>
  )
}

// ── Uma categoria de placas dentro de uma estrutura (acordeão) ─────────
function CategoriaAccordion({ categoria, tipos, itens, estruturaId, dispatch, defaultOpen = false }) {
  const { search } = useLocation()
  const [open, setOpen] = useState(defaultOpen || new URLSearchParams(search).has('audit'))

  const setQuantidade = (tipoPlaca, valorRaw) => {
    const valor = parseInt(valorRaw) || 0
    const item = itens.find(i => i.tipoPlaca === tipoPlaca)
    if (item) {
      if (valor <= 0) dispatch({ type: 'REMOVE_SINALIZACAO', id: item.id })
      else dispatch({ type: 'UPDATE_SINALIZACAO', id: item.id, changes: { quantidade: valor } })
    } else if (valor > 0) {
      dispatch({ type: 'ADD_SINALIZACAO', estruturaId, tipoPlaca, quantidade: valor })
    }
  }

  const tiposUsados = tipos.filter(t => itens.some(i => i.tipoPlaca === t.key && i.quantidade > 0))

  return (
    <div className="border border-solid border-border rounded-md overflow-hidden mb-3 last:mb-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full py-2.5 px-3 bg-surface-2 flex items-center gap-2 flex-wrap text-left cursor-pointer"
      >
        <span className="text-[13px] font-semibold text-ink">{categoria.label}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {tiposUsados.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tiposUsados.map(t => (
                <span key={t.key} className={`inline-block py-0.5 px-1.5 rounded border text-[11px] tabular-nums font-semibold whitespace-nowrap ${corTagCategoria(categoria.key)}`}>{t.codigo}</span>
              ))}
            </div>
          )}
          <Icon name="chevD" size={14} className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}/>
        </div>
      </button>
      {open && (
        <table className="w-full border-collapse">
          <tbody>
            {tipos.map(t => {
              const item = itens.find(i => i.tipoPlaca === t.key)
              const usado = (item?.quantidade || 0) > 0
              return (
                <tr key={t.key}>
                  <td className="py-2 px-3 border-b border-solid border-border-2 w-[104px]">
                    <img src={t.img} alt={t.codigo} className="w-20 h-20 max-w-none object-contain rounded-md"/>
                  </td>
                  <td className="py-2 px-2.5 border-b border-solid border-border-2 w-[56px]">
                    <span className={`inline-block py-0.5 px-1.5 rounded border text-[11px] tabular-nums font-semibold whitespace-nowrap transition-colors ${usado ? corTagCategoria(t.categoria) : 'bg-surface-2 border-border-2 text-ink-muted'}`}>{t.codigo}</span>
                  </td>
                  <td className="py-2 px-2.5 text-[13px] text-ink-muted border-b border-solid border-border-2">
                    {t.label}
                    {t.localInstalacao && <div className="text-[11px] text-ink-faint mt-0.5">{t.localInstalacao}</div>}
                  </td>
                  <td className="py-2 px-2.5 border-b border-solid border-border-2 w-[132px]">
                    {usado ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <StepperButton title="Remover uma" onClick={() => setQuantidade(t.key, item.quantidade - 1)}>
                          <Icon name="minus" size={12}/>
                        </StepperButton>
                        <Obrigatorio id={`${item.id}.quantidade`}/><input type="number" min="0" value={item.quantidade}
                          onChange={e => setQuantidade(t.key, e.target.value)}
                          className="w-12 text-right px-1.5"/>
                        <StepperButton title="Adicionar uma" onClick={() => setQuantidade(t.key, item.quantidade + 1)}>
                          <Icon name="plus" size={12}/>
                        </StepperButton>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button type="button" onClick={() => setQuantidade(t.key, 1)} title="Adicionar"
                          className="w-7 h-7 flex items-center justify-center rounded-md border border-solid border-border-2 text-ink-faint hover:border-red-border hover:text-red hover:bg-red-dim transition-colors">
                          <Icon name="plus" size={14}/>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Conteúdo de sinalização de uma estrutura — categorias direto, sem
// separação por pavimento (ver comentário no topo do arquivo). ──────────
function SinalizacaoEstrutura({ estruturaId, itens, tiposPlaca, categorias, dispatch }) {
  const resultado = calcularSinalizacaoEstrutura(itens, tiposPlaca)
  const tiposUsados = tiposPlaca.filter(t => resultado.porTipo[t.key] > 0)

  return (
    <div>
      {tiposUsados.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[11px] text-ink-faint">{resultado.quantidadeTotal} placa{resultado.quantidadeTotal !== 1 ? 's' : ''} · {resultado.tiposCadastrados} tipo{resultado.tiposCadastrados !== 1 ? 's' : ''}</span>
        </div>
      )}
      {categorias.map(cat => (
        <CategoriaAccordion
          key={cat.key}
          categoria={cat}
          tipos={tiposPlaca.filter(t => t.categoria === cat.key)}
          itens={itens.filter(i => tiposPlaca.find(t => t.key === i.tipoPlaca)?.categoria === cat.key)}
          estruturaId={estruturaId}
          dispatch={dispatch}
        />
      ))}
    </div>
  )
}

// ── Referência normativa (topo da página) ────────────────────────────
function ReferenciaNormativa({ sinNorma }) {
  const { NOTAS } = sinNorma
  const [open, setOpen] = useState(false)

  return (
    <Card className="mb-8">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full py-3 px-[18px] border-b border-solid border-border bg-surface-2 flex items-center gap-2 text-left"
      >
        <span className="text-[13px] font-semibold text-ink">Parâmetros normativos (NT 20 CBMMA)</span>
        <span className="text-[11px] text-ink-faint">cores, formas e local de instalação dos pictogramas</span>
        <Icon name="chevD" size={14} className={`ml-auto text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div className="py-3.5 px-[18px] flex flex-col gap-3">
          <div>
            <RefLabel>Categorias</RefLabel>
            <div className="text-[13px] text-ink-muted leading-[1.6]">{NOTAS.geral}</div>
          </div>
          <div className="text-[11px] text-ink-faint leading-[1.6] pt-2 border-t border-solid border-border-2">
            {NOTAS.fotoluminescencia}<br/>{NOTAS.quantidade}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Page Principal ────────────────────────────────────────────────────
export default function SinalizacaoPage() {
  const { state, dispatch } = useProjeto()
  const { sinalizacao: sinNorma } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()
  const { TIPOS_PLACA, CATEGORIAS } = sinNorma
  const toast = useToast()

  // Resultado de uma importação do Revit: pendências viram um aviso de erro e
  // o que foi importado, um de sucesso.
  const notificarImportacao = (info, erros) => {
    if (erros.length > 0) {
      toast.error(`${erros.length === 1 ? 'Um item não pôde ser importado' : `${erros.length} itens não puderam ser importados`}: ${erros.join(' ')}`)
    }
    if (info) toast.success(`${info.total} placa${info.total !== 1 ? 's' : ''} importada${info.total !== 1 ? 's' : ''} do Revit${info.timestamp ? ` — exportação: ${info.timestamp}` : ''}. Esta importação substituiu o cadastro anterior da(s) estrutura(s) recebida(s).`)
  }
  const [buscando, setBuscando] = useState(false)
  // Id da estrutura sendo atualizada individualmente (botão "Atualizar" no
  // card dela, ver handleBuscarRevitEstrutura) — null quando nenhuma está
  // em busca. Separado de `buscando` (o "Buscar do Revit" do cabeçalho,
  // que busca todas de uma vez).
  const [buscandoEstruturaId, setBuscandoEstruturaId] = useState(null)
  const fileInputRef = useRef(null)

  // Aplica o payload da chave "sinalizacao" (vindo de um arquivo ou do
  // Supabase) — mesmo parser de sempre, só muda a origem do JSON.
  const aplicarSinalizacao = (payloadSinalizacao, estruturaIdForcado) => {
    try {
      const { resolvidos, erros, timestamp } = resolverImportacaoSinalizacao(
        { sinalizacao: payloadSinalizacao }, state.estruturas, TIPOS_PLACA, estruturaIdForcado
      )
      if (resolvidos.length > 0) dispatch({ type: 'IMPORT_SINALIZACAO', itens: resolvidos })
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
        const { total, erros, timestamp } = aplicarSinalizacao(json.sinalizacao)
        notificarImportacao({ timestamp, total }, erros)
      } catch (err) {
        notificarImportacao(null, [err.message || 'Arquivo inválido.'])
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  // Busca uma linha por estrutura (cada arquivo Revit sincroniza a sua) e
  // aplica cada uma escopada — a importação de uma estrutura não mexe no
  // cadastro das demais (ver IMPORT_SINALIZACAO em ProjetoContext.jsx).
  const handleBuscarRevit = async () => {
    setBuscando(true)
    const { data, error } = await supabase
      .from('revit_syncs_latest').select('estrutura_id, payload').eq('projeto_id', state.id).eq('medida', 'sinalizacao')
    setBuscando(false)
    if (error) {
      notificarImportacao(null, [`Falha ao consultar o Supabase: ${error.message}`])
      return
    }
    if (!data || data.length === 0) {
      notificarImportacao(null, ['Nenhum dado de sinalização sincronizado do Revit ainda para este projeto.'])
      return
    }
    let totalGeral = 0
    const errosGeral = []
    let timestampMaisRecente = null
    for (const row of data) {
      const { total, erros, timestamp } = aplicarSinalizacao(row.payload, row.estrutura_id)
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
      .eq('medida', 'sinalizacao').eq('estrutura_id', estruturaId).maybeSingle()
    setBuscandoEstruturaId(null)
    if (error) {
      notificarImportacao(null, [`Falha ao consultar o Supabase: ${error.message}`])
      return
    }
    if (!data) {
      notificarImportacao(null, ['Nenhum dado de sinalização sincronizado do Revit ainda para esta estrutura.'])
      return
    }
    const { total, erros, timestamp } = aplicarSinalizacao(data.payload, estruturaId)
    notificarImportacao({ timestamp, total }, erros)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        <div className="flex items-start justify-between gap-4 mb-7">
          <div>
            <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
            <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
              <Icon name={SISTEMA_ICON.sinalizacao} size={20} color="var(--color-red)" className="shrink-0"/>
              Sinalização de Emergência
            <LinkNorma sistema="sinalizacao"/>
            <InfoTip side="bottom" align="start" text={<>Cadastre as placas de sinalização de emergência utilizadas em cada estrutura, conforme a NT 20 CBMMA / NBR 13434 — proibição, alerta, orientação/saída e equipamentos de combate a incêndio.</>}/>
          </h2>
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

        <ReferenciaNormativa sinNorma={sinNorma}/>

        {state.estruturas.map(est => {
          const pe = porEstrutura.find(p => p.estrutura.id === est.id)
          const exigido = !!pe?.sistemas?.sinalizacao?.ativo
          const status = exigido
            ? statusSinalizacao(state.sinalizacao.filter(i => i.estruturaId === est.id).length)
            : statusEstrutura('concluido', 'Não exigida')
          return (
            <EstruturaSection key={est.id} titulo={<>{est.nome} <Obrigatorio id={`${est.id}.sinalizacao`}/></>} status={status} conclusao={exigido ? { estruturaId: est.id, medida: 'sinalizacao', auto: !!est.origemRevit?.sinalizacao && state.sinalizacao.some(i => i.estruturaId === est.id) } : null} defaultOpen={false} extra={
              <div className="flex items-center gap-2">
                <EstruturaHeaderInfo estrutura={est} semArea/>
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
                  <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam a sinalização de emergência, conforme NT 01 CBMMA.</span>
                </div>
              ) : (
                <SinalizacaoEstrutura
                  estruturaId={est.id}
                  itens={state.sinalizacao.filter(i => i.estruturaId === est.id)}
                  tiposPlaca={TIPOS_PLACA}
                  categorias={CATEGORIAS}
                  dispatch={dispatch}
                />
              )}
            </EstruturaSection>
          )
        })}

        {state.estruturas.length === 0 && (
          <EmptyState texto="Nenhuma estrutura cadastrada ainda — configure as estruturas do projeto na Etapa 2."/>
        )}
      </div>
    </div>
  )
}
