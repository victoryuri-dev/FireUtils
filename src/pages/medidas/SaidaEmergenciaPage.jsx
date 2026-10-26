import LinkNorma from '../../components/ui/LinkNorma'
import { useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { supabase } from '../../lib/supabase'
import { getSE } from '../../data/normas/index'
import Icon from '../../components/ui/Icon'
import EstruturaSection from '../../components/ui/EstruturaSection'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import { statusEstrutura } from '../../utils/statusEstrutura'
import { useToast } from '../../hooks/useToast'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { fmtUn } from '../../utils/numero'
import AcessosDescargasView from './AcessosDescargasView'
import { calcPopPav, contarSaidasPavimento, getDistanciaPavimento, tipoEscadaEstrutura } from '../../data/se_calc'
import ObservacoesComplementares from '../../components/ui/ObservacoesComplementares'

// ── Helpers ───────────────────────────────────────────────────────────
let _seq = 0
const uid  = () => `se-${Date.now()}-${++_seq}`

// Ambientes ficam no reducer compartilhado (state.pavimentos[].ambientes) —
// aqui só remodela pro formato que esta página usa. `pisoDescarga`/
// `acessos` são repassados como estão no reducer — o popup de Acessos e
// Descargas (AcessosDescargasView) lê o pavimento cru direto de
// state.pavimentos, não esta versão remodelada. `divisao` é a
// classificação de ocupação da Etapa 4 (Step4.jsx) — usada pela distância
// máxima a percorrer, não pelas divisões dos ambientes daqui.
function derivarPavimentos(projetoPavs) {
  if (!projetoPavs?.length) return []
  return projetoPavs.map(p => ({
    id: p.id, nome: p.label, estruturaId: p.estruturaId,
    pisoDescarga: p.pisoDescarga ?? (p.tipo === 'terreo'),
    divisao: p.divisao,
    ambientes: p.ambientes || [],
    acessos: p.acessos || [],
  }))
}

// ── Badge informativo (chuveiros/detecção — não editáveis aqui) ────────
// Só aparece quando o sistema realmente existe na estrutura (inativo = oculto).
function SistemaBadge({ ativo, label }) {
  if (!ativo) return null
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-[11px] py-1 px-2.5 rounded-md border border-solid border-red-border bg-red-dim text-red">
      <span className="w-1.5 h-1.5 rounded-full bg-red"/>
      {label}
    </span>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────
function TH({ children, right, center }) {
  return <th className={`text-[10px] text-ink-faint uppercase tracking-[.07em] font-medium py-[9px] px-3.5 border-b border-solid border-border whitespace-nowrap bg-surface-2 ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>{children}</th>
}
function TD({ children, red, bold, muted, right, center }) {
  const colorClass = red ? 'text-red' : muted ? 'text-ink-faint' : 'text-ink'
  return <td className={`py-2.5 px-3.5 text-[13px] ${colorClass} ${bold ? 'font-bold' : 'font-normal'} border-b border-solid border-border-2 align-middle ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>{children}</td>
}
function Chip({ val, green }) {
  return <span className={`inline-block py-[3px] px-2.5 rounded font-bold text-[13px] tabular-nums border border-solid ${green ? 'bg-green-dim border-green-border text-green' : 'bg-red-dim border-red-border text-red'}`}>{val}</span>
}
function DimTable({ children }) {
  return <div className="border border-solid border-border rounded-md overflow-hidden mb-1"><table className="w-full border-collapse">{children}</table></div>
}

// ── Importação do firedata.json (plugin Revit) ────────────────────────
function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Acha o pavimento "de verdade" do site (id estável, ex.: est-1-P2) a
// partir do nome que vem do Revit — mesma lógica de casamento usada em
// ExtintoresPage.jsx. Com `estruturaId`, restringe a busca aos pavimentos
// dela (pull do Supabase, uma estrutura por vez); sem ele (upload manual
// de arquivo), busca entre todos.
function resolverPavimentoSite(nomeImportado, estruturaId, projetoPavimentos) {
  const candidatos = estruturaId ? projetoPavimentos.filter(p => p.estruturaId === estruturaId) : projetoPavimentos
  const porLabel = candidatos.find(p => norm(p.label) === norm(nomeImportado))
  if (porLabel) return porLabel
  const m = norm(nomeImportado).match(/^(?:n[ií]vel|piso|level)\s*(\d+)$/)
  if (m) {
    const porNivel = candidatos.find(p => p.id.endsWith(`-P${parseInt(m[1], 10)}`))
    if (porNivel) return porNivel
  }
  return candidatos.find(p => p.tipo === 'terreo') || null
}

// Ao contrário da versão antiga (que substituía a lista inteira de
// pavimentos por objetos novos, com ids sintéticos desconectados do
// projeto), resolve cada pavimento importado contra o cadastro real do
// site e devolve só as atualizações — quem chama decide como aplicar
// (mesclar, não substituir), preservando pavimentos de outras estruturas.
// `temChuveiros`/`temDeteccao` do payload NÃO são mais aplicados — esses
// dois são Medidas de Segurança da estrutura (Step6), não algo que a
// importação de ambientes deva sobrescrever silenciosamente.
//
// Ambiente já existente no pavimento é ATUALIZADO no lugar — mantém `id` e
// `acessoId`, só troca os dados que são autoridade do Revit (nome/divisão/
// área) — em vez de recriado do zero, o que soltava (órfão) qualquer
// ambiente que já estivesse dentro de um Acesso/Saída a cada nova
// importação. Casamento é primeiro por `revitId` (Room.UniqueId, ver
// rooms.get_rooms_classificados no plugin) — estável mesmo se o ambiente
// for renomeado numa reclassificação ou tiver só a área editada — com
// fallback pro NOME normalizado só pra ambiente sincronizado antes dessa
// mudança (ainda sem revitId salvo). `popTipo`/`assentos`/`popManual` NÃO
// vêm mais do Revit (ver montar_payload_ambientes no plugin) — população é
// autoridade do site (é lá que se escolhe "assento fixo"/manual e mora a
// taxa normativa vigente; ver site-sync ação populacao_ambientes, que
// devolve o cálculo pro plugin aplicar de volta no Room) — por isso esses
// três campos sempre preservam o valor já cadastrado, nunca são
// sobrescritos por uma importação do Revit. `origem: 'revit'` marca todo
// ambiente que passa por aqui — distingue do `origem: 'manual'` de quem
// nasce pelo botão "Adicionar Ambiente" (ver AcessosDescargasView.jsx).
function resolverImportacaoSaidas(payloadSE, estruturaIdForcado, projetoPavimentos) {
  if (!payloadSE?.pavimentos) throw new Error('Chave "pavimentos" não encontrada nos dados.')

  const erros = []
  const atualizacoes = new Map()

  payloadSE.pavimentos.forEach((p, pi) => {
    const nomeImportado = p.nome || `Pavimento ${pi + 1}`
    const pavSite = resolverPavimentoSite(nomeImportado, estruturaIdForcado, projetoPavimentos)
    if (!pavSite) { erros.push(`"${nomeImportado}": nenhum pavimento correspondente encontrado no projeto.`); return }
    const existentesPorRevitId = new Map((pavSite.ambientes || []).filter(a => a.revitId).map(a => [a.revitId, a]))
    const existentesPorNome = new Map((pavSite.ambientes || []).map(a => [norm(a.nome), a]))
    const idsUsados = new Set()
    atualizacoes.set(pavSite.id, {
      tipo: p.tipo || 'normal',
      ambientes: (p.ambientes || []).map((a, ai) => {
        const nome = a.nome || `Ambiente ${ai + 1}`
        // Cada ambiente já cadastrado só pode ser reaproveitado UMA vez:
        // ambientes com o mesmo nome (ex.: dois "Banheiro") caíam no mesmo
        // existente e ficavam com o mesmo `id`, então selecionar/mover um
        // levava os outros junto.
        const candidato = (a.revitId && existentesPorRevitId.get(a.revitId)) || existentesPorNome.get(norm(nome))
        const existente = candidato && !idsUsados.has(candidato.id) ? candidato : null
        if (existente) idsUsados.add(existente.id)
        return {
          id:        existente?.id        ?? uid(),
          acessoId:  existente?.acessoId  ?? null,
          nome,
          divisao:   a.divisao   || '',
          area:      a.area      ?? 0,
          popTipo:   existente?.popTipo   || 'area',
          assentos:  existente?.assentos  ?? 0,
          popManual: existente?.popManual ?? 0,
          revitId:   a.revitId   ?? existente?.revitId ?? null,
          origem:    'revit',
        }
      }),
    })
  })

  return { atualizacoes, erros, timestamp: payloadSE._timestamp || null }
}

// ── Page principal ────────────────────────────────────────────────────
// ── Tipo de escada de emergência da estrutura (Anexo C, Tabela 3) ─────
// Identifica o tipo pela altura piso a piso x divisão(ões) — só quando a
// edificação tem mais de 1 pavimento. As notas são apenas exibidas: as das
// divisões presentes e as gerais (nada vira configuração).
const TIPO_ESCADA_TOM = {
  NE: 'border-green-border bg-green-dim text-green',
  EP: 'border-amber-border bg-amber-dim text-amber',
  PF: 'border-red-border bg-red-dim text-red',
}
function TipoEscadaEstrutura({ estrutura, divisoes, tiposEscada }) {
  const [verNotas, setVerNotas] = useState(false)
  const r = tipoEscadaEstrutura(estrutura, divisoes, tiposEscada)
  // Sem a tabela na base central (normas_dados → saida_emergencia →
  // tipos_escada): avisa, em vez de não mostrar nada — estrutura de um
  // pavimento só não tem escada e continua sem aviso.
  if (!tiposEscada) {
    const totalPav = (parseInt(estrutura.nPavimentos) || 1) + (parseInt(estrutura.nSubsolos) || 0)
    if (totalPav <= 1) return null
    return (
      <div className="ibox amber mb-3">
        <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
        <span className="text-xs">Tipo de escada não determinado: a tabela de tipos de escada deste estado não está cadastrada na base normativa (Supabase — normas_dados, sistema saida_emergencia, chave tipos_escada).</span>
      </div>
    )
  }
  if (!r || r.status === 'nao_aplica') return null

  const pronto = r.status === 'ok'
  const t = pronto ? tiposEscada.tipos[r.exigido] : null
  const simbolo = pronto && (r.exigido === '+' || r.exigido === '-')
  const altura = parseFloat(estrutura.alturaPisoPiso)

  return (
    <div className="mb-4 bg-surface border border-solid border-border rounded-lg overflow-hidden">
      <div className="py-3.5 px-[18px] flex items-center justify-between gap-3 border-b border-solid border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="stair" size={15} color="var(--color-red)"/>
          <span className="text-xs font-bold text-ink">Tipo de escada de emergência</span>
          <span className="text-[11px] text-ink-faint hidden sm:inline">Anexo C, Tabela 3</span>
        </div>
      </div>

      <div className="py-3.5 px-[18px]">
        {r.status === 'sem_altura' && (
          <span className="text-xs text-ink-faint">Informe a altura da edificação (Etapa 2) para identificar o tipo de escada.</span>
        )}
        {r.status === 'sem_divisao' && (
          <span className="text-xs text-ink-faint">Classifique a divisão de ocupação dos pavimentos (Etapa 4) para identificar o tipo de escada.</span>
        )}
        {pronto && (
          <>
            <dl className="m-0 flex flex-wrap items-start gap-x-10 gap-y-3">
              <div>
                <dt className="text-[10px] text-ink-faint uppercase tracking-[.08em] leading-none mb-1.5">Altura piso a piso</dt>
                <dd className="m-0 h-6 flex items-center font-heading text-[14px] font-bold text-ink leading-none whitespace-nowrap">{altura ? fmtUn(altura, 'm', 2, '—') : '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-ink-faint uppercase tracking-[.08em] leading-none mb-1.5">Faixa de altura</dt>
                <dd className="m-0 h-6 flex items-center font-heading text-[14px] font-bold text-ink leading-none whitespace-nowrap">{r.faixa.label}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-ink-faint uppercase tracking-[.08em] leading-none mb-1.5">{r.porDivisao.length > 1 ? 'Divisões (mais restritiva vale)' : 'Divisão'}</dt>
                <dd className="m-0 min-h-6 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {r.porDivisao.map(p => (
                    <span key={p.divisao} className={`font-heading text-[14px] font-bold leading-none ${p.tipo === r.exigido ? 'text-ink' : 'text-ink-faint'}`}>
                      {p.divisao}{r.porDivisao.length > 1 && <span className="text-[10px] font-medium text-ink-faint ml-1">{p.tipo}</span>}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-ink-faint uppercase tracking-[.08em] leading-none mb-1.5">Tipo exigido</dt>
                <dd className="m-0 h-6 flex items-center">
                  <span className={`inline-flex items-center h-6 px-2.5 rounded-full border border-solid text-[11px] font-semibold whitespace-nowrap ${TIPO_ESCADA_TOM[r.exigido] || 'border-border text-ink-faint'}`}>
                    {simbolo ? t.nome : `${r.exigido} — ${t.nome}`}
                  </span>
                </dd>
              </div>
            </dl>
            {r.consultar && (
              <div className="ibox amber mt-3">
                <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
                <span className="text-xs">{r.exigido === '+' ? 'Ocupação não coberta pela tabela: consultar' : 'Além do tipo indicado, consultar'} NT, normas ou regulamentos específicos.</span>
              </div>
            )}
            <div className="mt-3.5 pt-3 border-t border-solid border-border">
              <button type="button" onClick={() => setVerNotas(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink bg-transparent border-none cursor-pointer p-0">
                <Icon name="chevD" size={12} className={`transition-transform ${verNotas ? 'rotate-180' : ''}`}/>
                {verNotas ? 'Ocultar notas' : `Notas da tabela (${r.notas.length})`}
              </button>
              {verNotas && (
                <ul className="flex flex-col gap-2 m-0 mt-3 pl-0 list-none">
                  {r.notas.map(n => (
                    <li key={n.chave} className="flex gap-2 text-[11px] text-ink-muted leading-[1.6]">
                      <strong className="text-ink shrink-0 w-4">{/^\d+$/.test(n.chave) ? `(${n.chave})` : `${n.chave})`}</strong>
                      <span>{n.texto}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// `extra`: conteúdo do estado no fim da página (ex.: PB, declarações do
// formulário do CBMPB — ver estados/PB/paginas.jsx).
export default function SaidaEmergenciaPage({ extra = null }) {
  const { state, dispatch } = useProjeto()
  const { uf, info, ocupacoes } = useNorma()
  const { porEstrutura: medidasPorEstrutura } = useMedidasObrigatorias()
  const seNorma         = getSE(uf)
  const { DISTANCIAS_MAXIMAS } = seNorma

  // Chuveiros automáticos e detecção de incêndio não são configuráveis
  // aqui — vêm das Medidas de Segurança de cada estrutura (Step6):
  // obrigatório pela norma OU habilitado manualmente lá.
  const sistemasPorEst = Object.fromEntries(medidasPorEstrutura.map(pe => [pe.estrutura.id, pe.sistemas]))
  const getTemChuveiros = estId => !!sistemasPorEst[estId]?.sprinklers?.ativo
  const getTemDeteccao  = estId => !!sistemasPorEst[estId]?.deteccao?.ativo

  // Ambientes/acessos vêm do reducer compartilhado (state.pavimentos) — ver
  // `derivarPavimentos`. Recalculado a cada render, então reflete tanto
  // esta aba quanto o que chegar por broadcast de outra.
  const pavimentos = derivarPavimentos(state.pavimentos)
  // Pavimento cujo popup de Acessos e Descargas está aberto — null = fechado.
  // Ambientes, acessos/saídas e piso de descarga são todos editados ali
  // dentro; esta página só lista os pavimentos.
  const { search } = useLocation()
  const alvoAudit = new URLSearchParams(search).get('audit') || ''
  const [viewPavId, setViewPavId] = useState(() => state.pavimentos.find(p => alvoAudit.startsWith(`${p.id}.`) || p.ambientes?.some(a => alvoAudit.startsWith(`${a.id}.`)))?.id || null)
  // Colapso dos cards é só desta aba/sessão.
  const toast = useToast()

  // Resultado de uma importação do Revit: erro e/ou sucesso viram notificações.
  const notificarImportacao = (timestamp, erro) => {
    if (erro) toast.error(`Erro ao importar: ${erro}`)
    if (timestamp) toast.success(`Dados importados do Revit — última exportação: ${timestamp}. Confira os ambientes e ajuste se necessário.`)
  }
  const [buscando,     setBuscando]     = useState(false)
  // Id da estrutura sendo atualizada individualmente (botão "Atualizar" no
  // card dela, ver handleBuscarRevitEstrutura) — null quando nenhuma está
  // em busca. Separado de `buscando` (o "Buscar do Revit" do cabeçalho,
  // que busca todas de uma vez).
  const [buscandoEstruturaId, setBuscandoEstruturaId] = useState(null)
  const fileInputRef = useRef(null)


  // Aplica um lote (arquivo ou linha do Supabase) — despacha só os
  // pavimentos resolvidos no lote, preservando o resto (inclusive de outras
  // estruturas) via IMPORT_AMBIENTES_SE.
  const aplicarSaidas = (payloadSE, estruturaId) => {
    try {
      const { atualizacoes, erros, timestamp } = resolverImportacaoSaidas(payloadSE, estruturaId, state.pavimentos)
      if (atualizacoes.size > 0) {
        dispatch({
          type: 'IMPORT_AMBIENTES_SE',
          atualizacoes: [...atualizacoes.entries()].map(([pavimentoId, dados]) => ({ pavimentoId, ambientes: dados.ambientes })),
        })
      }
      return { erros, timestamp }
    } catch (err) {
      return { erros: [err.message || 'Dados inválidos.'], timestamp: null }
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
        const { erros, timestamp } = aplicarSaidas(json?.saidas_emergencia ?? json?.se_import, null)
        notificarImportacao(timestamp, erros.length ? erros.join(' ') : null)
      } catch (err) {
        notificarImportacao(null, err.message || 'Arquivo inválido.')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  // Busca uma linha por estrutura (cada arquivo Revit sincroniza a sua) e
  // aplica cada uma escopada.
  const handleBuscarRevit = async () => {
    setBuscando(true)
    const { data, error } = await supabase
      .from('revit_syncs_latest').select('estrutura_id, payload').eq('projeto_id', state.id).eq('medida', 'saidas_emergencia')
    setBuscando(false)
    if (error) {
      notificarImportacao(null, `Falha ao consultar o Supabase: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      notificarImportacao(null, 'Nenhum dado de saídas de emergência sincronizado do Revit ainda para este projeto.')
      return
    }
    const errosGeral = []
    let timestampMaisRecente = null
    for (const row of data) {
      const { erros, timestamp } = aplicarSaidas(row.payload, row.estrutura_id)
      errosGeral.push(...erros)
      if (timestamp && (!timestampMaisRecente || timestamp > timestampMaisRecente)) timestampMaisRecente = timestamp
    }
    notificarImportacao(timestampMaisRecente, errosGeral.length ? errosGeral.join(' ') : null)
  }

  // Mesma busca de handleBuscarRevit, mas escopada a uma única estrutura
  // (botão "Atualizar" no card dela) — útil quando só o modelo Revit
  // daquela estrutura mudou, sem precisar re-sincronizar (e sobrescrever
  // o timestamp de importação exibido) das demais.
  const handleBuscarRevitEstrutura = async estruturaId => {
    setBuscandoEstruturaId(estruturaId)
    const { data, error } = await supabase
      .from('revit_syncs_latest').select('payload').eq('projeto_id', state.id)
      .eq('medida', 'saidas_emergencia').eq('estrutura_id', estruturaId).maybeSingle()
    setBuscandoEstruturaId(null)
    if (error) {
      notificarImportacao(null, `Falha ao consultar o Supabase: ${error.message}`)
      return
    }
    if (!data) {
      notificarImportacao(null, 'Nenhum dado de saídas de emergência sincronizado do Revit ainda para esta estrutura.')
      return
    }
    const { erros, timestamp } = aplicarSaidas(data.payload, estruturaId)
    notificarImportacao(timestamp, erros.length ? erros.join(' ') : null)
  }

  const viewPav = viewPavId ? state.pavimentos.find(p => p.id === viewPavId) : null

  const dadosPav = pavimentos.map(p => {
    const temChuveiros    = getTemChuveiros(p.estruturaId)
    const temDeteccao     = getTemDeteccao(p.estruturaId)
    const pop             = calcPopPav(p, seNorma.TAXA_POPULACIONAL)
    const nSaidas         = Math.max(1, contarSaidasPavimento(p.acessos))
    const dist            = getDistanciaPavimento(p, nSaidas, temChuveiros, temDeteccao, DISTANCIAS_MAXIMAS)
    return { pav:p, pop, nSaidas, dist }
  })

  const porEstrutura = state.estruturas.map(est => ({
    estrutura: est,
    dadosPav: dadosPav.filter(d => d.pav.estruturaId === est.id),
  }))

  const temPavimentos = pavimentos.length > 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
              <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
                <Icon name={SISTEMA_ICON.saida_emergencia} size={20} color="var(--color-red)" className="shrink-0"/>
                Saídas de Emergência
              <LinkNorma sistema="saida_emergencia"/>
          </h2>
              <p className="w-full text-[13px] text-ink-faint leading-[1.6] m-0">
                Clique em um pavimento para cadastrar os ambientes e montar a árvore de acessos, saídas e escadas/rampas, conforme {info?.nome || 'NT vigente'} / NBR 9077.
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

        </div>

        {/* Pavimentos */}
        {!temPavimentos ? (
          <div className="p-9 text-center text-ink-faint text-[13px] bg-surface border border-solid border-border rounded-lg">
            Nenhum pavimento configurado. Cadastre os pavimentos da edificação na Etapa 2 (Edificação).
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {porEstrutura.filter(g => g.dadosPav.length > 0).map(({ estrutura, dadosPav: dadosDaEstrutura }) => {
              // Ambiente sem acesso atribuído = acesso direto à área de relativa
              // segurança, não é pendência (ver AcessosDescargasView/memorial).
              const status = statusEstrutura('concluido', 'Dados carregados')
              return (
                <EstruturaSection
                  key={estrutura.id}
                  titulo={estrutura.nome}
                  status={status}
                  conclusao={{ estruturaId: estrutura.id, medida: 'saida_emergencia', auto: !!estrutura.origemRevit?.saida_emergencia }}
                  defaultOpen={false}
                  extra={
                    <div className="flex items-center gap-2 shrink-0">
                      <EstruturaHeaderInfo estrutura={estrutura} mostrar={['pavimentos', 'ocupacao']}/>
                      <SistemaBadge ativo={getTemChuveiros(estrutura.id)} label="Chuveiros automáticos"/>
                      <SistemaBadge ativo={getTemDeteccao(estrutura.id)} label="Detecção de incêndio"/>
                      <button type="button" className="btn-ghost text-[10px] py-1 px-2 gap-1"
                        onClick={e => { e.stopPropagation(); handleBuscarRevitEstrutura(estrutura.id) }}
                        disabled={buscandoEstruturaId === estrutura.id}
                        title="Buscar do Revit só os dados desta estrutura">
                        <Icon name="upload" size={10}/>
                        {buscandoEstruturaId === estrutura.id ? 'Buscando…' : 'Atualizar'}
                      </button>
                    </div>
                  }
                >
                  <TipoEscadaEstrutura estrutura={estrutura} divisoes={dadosDaEstrutura.map(d => d.pav.divisao)} tiposEscada={seNorma.TIPOS_ESCADA}/>
                  <DimTable>
                    <thead><tr><TH>Pavimento</TH><TH center>Amb.</TH><TH center>Pop.</TH><TH center>Saídas</TH><TH right>Dist. máxima</TH><TH/></tr></thead>
                    <tbody>
                      {dadosDaEstrutura.map(({ pav, pop, nSaidas, dist }) => (
                        <tr key={pav.id} onClick={() => setViewPavId(pav.id)} className="cursor-pointer transition-colors duration-100 hover:bg-surface-2">
                          <TD bold>
                            {pav.nome}
                            {pav.pisoDescarga && <span className="ml-1.5 align-middle text-[9px] py-0.5 px-1.5 rounded bg-amber-dim border border-solid border-amber-border text-amber font-semibold">DESCARGA</span>}
                          </TD>
                          <TD center muted>
                            {pav.ambientes.length} <Obrigatorio id={`${pav.id}.ambientes`}/>
                            
                          </TD>
                          <TD center red bold>{pop}</TD>
                          <TD center red bold>{nSaidas}</TD>
                          <td className="py-2.5 px-3.5 text-right text-[13px] border-b border-solid border-border-2 align-middle">
                            {dist!==null ? <Chip val={fmtUn(dist, 'm')} green/> : <span className="text-xs text-ink-faint">Consultar NT</span>}
                          </td>
                          <td className="py-2.5 px-3.5 text-right border-b border-solid border-border-2 align-middle"><Icon name="right" size={13} color="var(--color-ink-faint)"/></td>
                        </tr>
                      ))}
                    </tbody>
                  </DimTable>
                  <ObservacoesComplementares estrutura={estrutura} medida="saida_emergencia"/>
                </EstruturaSection>
              )
            })}
          </div>
        )}

        {extra}
      </div>

      {viewPav && <AcessosDescargasView pav={viewPav} seNorma={seNorma} ocupacoes={ocupacoes} dispatch={dispatch} onClose={() => setViewPavId(null)}/>}
    </div>
  )
}
