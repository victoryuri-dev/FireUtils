import LinkNorma from '../../components/ui/LinkNorma'
import { useState, useRef, isValidElement } from 'react'
import { useLocation } from 'react-router-dom'
import { useProjeto } from '../../context/ProjetoContext'
import { supabase } from '../../lib/supabase'
import Icon from '../../components/ui/Icon'
import { useToast } from '../../hooks/useToast'
import StepsNav from '../../components/layout/StepsNav'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import FormularioSistema, { TomadasRecalque } from '../../components/hidrantes/FormularioSistema'
import { SelecaoBombas, SucaoBomba } from '../../components/hidrantes/BombaESuccaoForm'
import FormSection from '../../components/ui/FormSection'
import InfoTip from '../../components/ui/InfoTip'
import { calcPotenciaBomba } from '../../data/hidrantes_calc'
import { getHidrantes } from '../../data/normas/index'
import { fmtNum } from '../../utils/numero'

// ── Formatação ────────────────────────────────────────────────────────
// Formato oficial (utils/numero.js); resultados hidráulicos mantêm até 3–4
// casas onde 2 casas perderiam informação.
const f4  = n => fmtNum(n, 4, '0')
const f2  = n => fmtNum(n, 2, '0')
const f3  = n => fmtNum(n, 3, '0')
const fmca = n => `${f4(n)} mca`
const lmin = n => `${f2(n)} L/min`
const ms   = n => `${f3(n)} m/s`

// ── Shared UI ─────────────────────────────────────────────────────────
function Table({ children }) {
  return <div className="border border-solid border-border rounded-md overflow-hidden mb-1"><table className="w-full border-collapse">{children}</table></div>
}
function TH({ children, right, center, w }) {
  return <th style={{width:w}} className={`text-[10px] text-ink-faint uppercase tracking-[.07em] font-medium py-[9px] px-3.5 border-b border-solid border-border bg-surface-2 whitespace-nowrap ${right?'text-right':center?'text-center':'text-left'}`}>{children}</th>
}
function TD({ children, red, green, bold, muted, right, center, mono }) {
  const colorClass = red ? 'text-red' : green ? 'text-green' : muted ? 'text-ink-faint' : 'text-ink'
  return <td className={`py-[9px] px-3.5 text-[13px] ${colorClass} ${bold?'font-bold':'font-normal'} border-b border-solid border-border-2 align-middle ${right?'text-right':center?'text-center':'text-left'} ${mono?'tabular-nums':'font-sans'}`}>{children}</td>
}
// `limite` é o limite normativo de velocidade DESTE trecho (recalque/
// descarga sempre 5,0 m/s; sucção 3,0 ou 2,0 m/s conforme positiva/negativa
// — ver normas/<UF>/hidrantes.js) — nunca um valor fixo pra todos os trechos.
function VelChip({ v, limite }) {
  const ok = v <= limite
  return <span className={`inline-flex items-center gap-1 py-[3px] px-2 rounded tabular-nums font-bold text-xs border border-solid ${ok?'bg-green-dim border-green-border text-green':'bg-red-dim border-red-border text-red'}`}>{ok?'✓':' ✗'} {ms(v)}</span>
}
function AtendeChip({ ok }) {
  return <span className={`inline-block py-[3px] px-2.5 rounded font-bold text-[11px] border border-solid ${ok?'bg-green-dim border-green-border text-green':'bg-red-dim border-red-border text-red'}`}>{ok ? 'ATENDE' : 'NÃO ATENDE'}</span>
}
function Card({ children, className='' }) {
  return <div className={`bg-surface border border-solid border-border rounded-lg overflow-hidden ${className}`}>{children}</div>
}
function CardHeader({ children }) {
  return <div className="py-3 px-[18px] border-b border-solid border-border bg-surface-2 flex items-center gap-2">{children}</div>
}

// Pressão de referência no hidrante (o que se compara contra Pmin): na
// ponta do esguicho quando o método é "Ponta do Esguicho Regulável", na
// válvula quando é "Válvula do Hidrante" — ver hidrantes/calc.py.
function pressaoHidrante(res, hd) {
  if (!res.esguicho) return hd === 'hd01' ? res.P_hd01 : res.P_hd02
  return res.esg[hd].P_esg
}

// ── Resumo Executivo ──────────────────────────────────────────────────
// Só os dois hidrantes mais desfavoráveis — o ponto de operação da bomba
// (Ht/Qt/potência) fica na Etapa 3 (Dimensionamento da Bomba), junto da
// eficiência e da potência adotada.
function ResumoExecutivo({ d }) {
  const { res, dados_sistema } = d
  const pmin = dados_sistema.p_min
  const pmax = 100
  const p01 = pressaoHidrante(res, 'hd01')
  const p02 = pressaoHidrante(res, 'hd02')
  const labelPressao = res.esguicho ? 'Pressão no esguicho' : 'Pressão na válvula'

  const cards = [
    {
      id: 'HID-01', label: '1º MAIS DESFAVORÁVEL', color: 'var(--color-red)',
      rows: [
        { label: labelPressao,        val: fmca(p01) },
        { label:'Vazão real',         val: lmin(res.Q_hd01) },
      ],
      atende: p01 >= pmin && p01 <= pmax,
    },
    {
      id: 'HID-02', label: '2º MAIS DESFAVORÁVEL', color: 'var(--color-amber)',
      rows: [
        { label: labelPressao,        val: fmca(p02) },
        { label:'Vazão real',         val: lmin(res.Q_hd02) },
      ],
      atende: p02 >= pmin && p02 <= pmax,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 mb-8">
      {cards.map(c => (
        <Card key={c.id}>
          <CardHeader>
            <span style={{color:c.color}} className="text-[11px] font-bold py-0.5 px-2 rounded bg-surface border border-solid border-border tabular-nums">{c.id}</span>
            <span className="text-[10px] text-ink-faint font-medium uppercase tracking-[.06em]">{c.label}</span>
          </CardHeader>
          <div className="py-3.5 px-[18px] flex flex-col gap-2.5">
            {c.rows.map((r, i) => (
              <div key={i} className="flex justify-between items-baseline gap-2">
                <span className="text-xs text-ink-faint">{r.label}</span>
                <span className="text-sm font-bold text-ink tabular-nums whitespace-nowrap">{r.val}</span>
              </div>
            ))}
            {c.atende !== null && (
              <div className="mt-1">
                <AtendeChip ok={c.atende}/>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Dados do Sistema (resumo compacto) ─────────────────────────────────
// Só o que o RT precisa pra conferir que os requisitos normativos certos
// foram usados — o detalhamento completo (referência de cada valor,
// mangueira, velocidade máxima por trecho etc.) fica no memorial de
// cálculo impresso (memorial/hidrantesCalculo.js), não duplicado aqui.
function DadosDoSistema({ d }) {
  const { dados_sistema, valor_sistema, metodo, C_HW, res } = d
  const stats = [
    { label: 'Classificação', val: valor_sistema },
    { label: 'Método', val: metodo },
    { label: 'Vazão mínima', val: `${f2(dados_sistema.q_min)} L/min` },
    { label: 'Pressão mín.–máx.', val: `${dados_sistema.p_min}–100 mca` },
    { label: 'Coef. C', val: String(C_HW) },
  ]
  if (res.esguicho) {
    stats.push({ label: 'Mangueira', val: `DN${dados_sistema.mang_dn} · ${f2(dados_sistema.mang_comp)} m` })
  }
  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {stats.map(s => (
        <div key={s.label} className="bg-surface border border-solid border-border rounded-md py-3 px-3.5 text-center">
          <div className="text-[10px] text-ink-faint uppercase tracking-[.05em] mb-1 whitespace-nowrap">{s.label}</div>
          <div className="text-[13px] font-bold text-ink">{s.val}</div>
        </div>
      ))}
    </div>
  )
}

// ── Verificação do Hidrante Mais Desfavorável ────────────────────────────
// "Mapear Trechos" (plugin) calcula, pra TODOS os hidrantes achados na rede
// — não só os 2 escolhidos —, uma perda de carga simplificada (vazão
// nominal de um hidrante só, sem equilíbrio hidráulico, Bomba → Válvula
// direto) somada ao desnível geométrico: isso é só pra RANQUEAR, nunca o
// resultado final. Os dois de maior perda de carga total (mais
// desfavoráveis) são H-01/H-02, que aí sim recebem a marcha de cálculo
// completa (com equilíbrio hidráulico) mostrada no resto da página. Sem
// essa tabela o RT só via o resultado de H-01/H-02 já prontos, sem
// conseguir conferir se são de fato os mais desfavoráveis do projeto.
//
// `ranking` já vem ordenado do mais desfavorável pro mais favorável (mesma
// ordem que "Mapear Trechos" atribui H-01, H-02, H-03...) — a posição no
// array, não só a flag `selecionado`, decide o rótulo de situação. "Hidrante
// Mais Favorável" é único: só o último da lista (o de menor perda de carga
// total) — os demais, entre o 2º desfavorável e esse último, não têm uma
// situação especial pra rotular.
// Cabeçalho de coluna em sigla + InfoTip com o significado — mais compacto
// que o nome por extenso, sem perder a explicação (ela só fica a um hover
// de distância em vez de ocupar espaço fixo no cabeçalho).
function THSigla({ sigla, tip, align = 'center' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${align === 'end' ? 'justify-end' : 'justify-center'}`}>
      {sigla}
      <InfoTip text={tip} align={align}/>
    </span>
  )
}

function situacaoHidrante(indice, total) {
  if (indice === 0) return { texto: '1º Hidrante Mais Desfavorável', classe: 'bg-red-dim border-red-border text-red' }
  if (indice === 1) return { texto: '2º Hidrante Mais Desfavorável', classe: 'bg-amber-dim border-amber-border text-amber' }
  if (indice === total - 1) return { texto: 'Hidrante Mais Favorável', classe: 'bg-surface-2 border-border text-ink-faint' }
  return null
}

// Por padrão só mostra o 1º/2º mais desfavorável e o mais favorável — os
// hidrantes intermediários (sem situação especial) ficam escondidos atrás
// da setinha "Mostrar todos", pra tabela não virar uma lista enorme em
// projetos com muitos hidrantes mapeados.
function VerificacaoHidranteDesfavoravel({ ranking }) {
  const [expandido, setExpandido] = useState(false)
  if (!ranking || ranking.length === 0) return null

  const total = ranking.length
  const temOcultos = total > 3
  const linhas = (expandido || !temOcultos)
    ? ranking.map((h, i) => [h, i])
    : [[ranking[0], 0], [ranking[1], 1], [ranking[total - 1], total - 1]]

  return (
    <div className="mb-8">
      <h4 className="text-xs font-bold text-ink uppercase tracking-[.05em] mb-3">Verificação do Hidrante Mais Desfavorável</h4>
      <Table>
        <thead>
          <tr>
            <TH>Hidrante</TH>
            <TH right>
              <THSigla sigla="J" align="end" tip="Perda de carga do trecho Bomba → Hidrante, por Hazen-Williams, com a vazão nominal de um único hidrante — sem equilíbrio hidráulico. Usada só para ranquear."/>
            </TH>
            <TH right>
              <THSigla sigla="∆Z" align="end" tip="Desnível geométrico entre a bomba e o hidrante."/>
            </TH>
            <TH right>
              <THSigla sigla="J + ∆Z" align="end" tip="Perda de Carga Total = perda de carga (J) + desnível (∆Z) — usada só para ranquear os hidrantes. O 1º e o 2º mais desfavoráveis recebem a marcha de cálculo completa, com equilíbrio hidráulico, no restante desta etapa."/>
            </TH>
            <TH center>Situação</TH>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([h, i]) => {
            const situacao = situacaoHidrante(i, total)
            return (
              <tr key={h.id}>
                <TD bold>{h.id}</TD>
                <TD right mono muted>{fmca(h.J)}</TD>
                <TD right mono muted>{f4(h.dZ)} m</TD>
                <TD right bold mono>{fmca(h.score)}</TD>
                <td className="py-[9px] px-3.5 text-center border-b border-solid border-border-2">
                  {situacao ? (
                    <span className={`inline-block py-[3px] px-2.5 rounded font-bold text-[11px] border border-solid whitespace-nowrap ${situacao.classe}`}>
                      {situacao.texto}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      {temOcultos && (
        <button
          type="button"
          onClick={() => setExpandido(e => !e)}
          className="w-full py-2 mb-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-faint hover:text-ink border border-solid border-border rounded-md cursor-pointer transition-colors"
        >
          {expandido ? 'Mostrar menos' : `Mostrar todos os ${total} hidrantes`}
          <Icon name="chevD" size={12} className={`transition-transform ${expandido ? 'rotate-180' : ''}`}/>
        </button>
      )}
    </div>
  )
}

// ── Ordem da narrativa hidráulica ────────────────────────────────────────
// Os dois ramais até o Ponto A, depois o recalque até a bomba, depois a
// sucção — mesma sequência da marcha de cálculo. Compartilhado pela
// verificação de velocidade e pelas perdas de carga por trecho, abaixo.
const ORDEM_TRECHOS = ['t3', 't4', 't2', 't1']

function limiteVelocidade(trechoId, succao, norma) {
  if (trechoId === 't1') return succao === 'positiva' ? norma.V_MAX_SUCCAO_POSITIVA : norma.V_MAX_SUCCAO_NEGATIVA
  return norma.V_MAX_TUBULACAO
}

// ── Verificação de Velocidade ────────────────────────────────────────────
// Seção própria, separada das perdas de carga: aqui o que importa é só
// atende/não atende o limite normativo — não o quanto se perdeu de carga.
function VerificacaoVelocidade({ d, norma }) {
  const trechos = ORDEM_TRECHOS.map(id => [id, d.res.j[id]])
  return (
    <Table>
      <thead><tr><TH>Trecho</TH><TH>DN</TH><TH right>Limite Normativo</TH><TH>Velocidade</TH></tr></thead>
      <tbody>
        {trechos.flatMap(([id, t]) => {
          const vLimite = limiteVelocidade(id, d.succao, norma)
          return t.segmentos.map((seg, i) => (
            <tr key={`${id}-${i}`}>
              <TD bold>{t.label}</TD>
              <TD mono muted>DN{Number(seg.d_mm).toFixed(0)}</TD>
              <TD right mono muted>{ms(vLimite)}</TD>
              <td className="py-[9px] px-3.5 border-b border-solid border-border-2">
                <VelChip v={seg.V} limite={vLimite}/>
              </td>
            </tr>
          ))
        })}
      </tbody>
    </Table>
  )
}

// ── Perdas de Carga por Trecho ───────────────────────────────────────────
// Mostra o RESULTADO por trecho/diâmetro (comprimento real, equivalente,
// perda de carga) e os componentes (conexões/acessórios) que geram perda
// localizada — sem o passo a passo de como cada valor foi calculado (Jun,
// fórmula de Hazen-Williams etc.), que fica só no memorial de cálculo
// impresso (memorial/hidrantesCalculo.js). Velocidade tem seção própria,
// acima (VerificacaoVelocidade) — aqui é só magnitude da perda.

// Mesma caixa (fundo + borda) pras três — sem escurecer/clarear a esmo
// entre elas, senão parece bagunça em vez de hierarquia. A hierarquia real
// vem só da tipografia do valor: Leq é apoio/intermediário (apagado e
// pequeno), Ltotal já é um resultado (peso normal), e a Perda de Carga (J)
// é O resultado do trecho — maior, em negrito e na cor de acento (mesma
// usada nos números-chave da página, como Ht/Qt), só o texto, não a caixa.
function MiniStat({ label, nivel = 'secundario', val }) {
  const valClass = nivel === 'primario'
    ? 'text-base font-bold text-red'
    : nivel === 'secundario'
      ? 'text-[13px] font-semibold text-ink'
      : 'text-[12px] font-normal text-ink-faint'
  return (
    <div className="bg-surface border border-solid border-border rounded-md py-2 px-3">
      <div className="text-[10px] text-ink-faint uppercase tracking-[.05em] mb-1 whitespace-nowrap">{label}</div>
      <div className={`tabular-nums ${valClass}`}>{val}</div>
    </div>
  )
}

// Por diâmetro: 1) a tubulação reta em si (DN + comprimento real — o que
// foi de fato medido no modelo), 2) a tabela de conexões/acessórios que
// geram a perda localizada (quantidade + Leq unitário + Leq total de CADA
// componente — nunca só o total somado, senão não dá pra saber o que foi
// contabilizado) e 3) o resultado final do segmento (Leq, Ltotal, J).
function SegmentoTrecho({ seg }) {
  return (
    <div className="bg-surface-2 border border-solid border-border rounded-md p-3.5">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[12px] font-bold text-ink tabular-nums bg-bg border border-solid border-border rounded px-2 py-0.5">
          DN{Number(seg.d_mm).toFixed(0)}
        </span>
        <span className="text-xs text-ink-faint">
          Tubo reto: <strong className="text-ink tabular-nums">{f4(seg.L)} m</strong>
        </span>
      </div>

      {seg.acessorios.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-ink-faint uppercase tracking-[.05em] mb-1.5">Conexões e Acessórios (perda localizada)</div>
          <Table>
            <thead><tr><TH>Componente</TH><TH center w={52}>Qtd</TH><TH right>Leq unit.</TH><TH right>Leq total</TH></tr></thead>
            <tbody>
              {seg.acessorios.map((a, i) => (
                <tr key={i}>
                  <TD>{a.nome}</TD>
                  <TD center bold>{a.qtd}</TD>
                  <TD right mono muted>{f2(a.leq_unit)} m</TD>
                  <TD right mono bold>{f2(a.leq_tot)} m</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat label="Comp. Equivalente (Leq)" nivel="terciario" val={`${f4(seg.Leq)} m`}/>
        <MiniStat label="Comp. Total (Ltotal)" nivel="secundario" val={`${f4(seg.Ltotal)} m`}/>
        <MiniStat label="Perda de Carga do Trecho (J)" nivel="primario" val={fmca(seg.J)}/>
      </div>
    </div>
  )
}

function TrechoDetalhe({ id, t }) {
  return (
    <Card className="mb-3">
      <CardHeader>
        <span className="text-[11px] font-bold py-0.5 px-2 rounded bg-surface border border-solid border-border text-ink-faint tabular-nums">{id.toUpperCase()}</span>
        <span className="text-[13px] font-semibold text-ink">{t.label}</span>
        <span className="text-[11px] text-ink-faint ml-auto">Q = {lmin(t.Q_lmin)} · J total = {fmca(t.J)}</span>
      </CardHeader>
      <div className="py-3.5 px-[18px] flex flex-col gap-3">
        {t.segmentos.map((seg, i) => <SegmentoTrecho key={i} seg={seg}/>)}
      </div>
    </Card>
  )
}

function PerdasPorTrecho({ d }) {
  const trechos = ORDEM_TRECHOS.map(id => [id, d.res.j[id]])
  return (
    <div>
      {trechos.map(([id, t]) => <TrechoDetalhe key={id} id={id} t={t}/>)}
    </div>
  )
}

// ── Resultado Hidráulico ─────────────────────────────────────────────────
// Ht/Qt já convergidos — o passo a passo de como Ht foi montado (Ponto A →
// saída da bomba → RTI) fica só no memorial de cálculo impresso. São os
// dois números mais importantes da página (alimentam a bomba na Etapa 3),
// por isso ganham a cor de destaque; o terceiro card é o número de tomadas
// d'água do recalque (simples/duplo), em tom neutro.
function ResultadoHidraulico({ d }) {
  const { res } = d
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div className="bg-surface border border-solid border-border rounded-lg py-4 px-5">
        <div className="text-[11px] text-ink-faint uppercase tracking-[.06em] mb-1">Altura Manométrica Total (Ht)</div>
        <div className="text-xl font-bold text-red tabular-nums">{fmca(res.P_RTI)}</div>
      </div>
      <div className="bg-surface border border-solid border-border rounded-lg py-4 px-5">
        <div className="text-[11px] text-ink-faint uppercase tracking-[.06em] mb-1">Vazão Total (Qt)</div>
        <div className="text-xl font-bold text-red tabular-nums">{lmin(res.Qt)}</div>
      </div>
      <TomadasRecalque/>
    </div>
  )
}

function ValorOperacao({ rotulo, valor, unidade, conversao, tom }) {
  return (
    <div className="py-4 px-5">
      <div className="text-[10px] text-ink-faint uppercase tracking-[.08em] mb-1.5">{rotulo}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`tabular-nums text-xl font-bold ${tom}`}>{valor}</span>
        <span className="text-[11px] text-ink-faint">{unidade}</span>
        {conversao && <span className="text-[11px] text-ink-faint">· {conversao}</span>}
      </div>
    </div>
  )
}

// ── Ponto de Operação para Seleção da Bomba ────────────────────────────
// Só os valores que o RT leva pro catálogo do fabricante (sem mostrar o
// cálculo). Qt/Ht já foram mostrados na Etapa 2 (ResultadoHidraulico).
function Bomba({ d }) {
  const { res } = d
  const Qt_m3h = res.Qt / 1000 * 60
  return (
    <FormSection title="Ponto de Operação do Sistema" description="Vazão e altura manométrica que a bomba deve atender.">
      <div className="grid grid-cols-2 border border-solid border-border rounded-md divide-x divide-solid divide-border">
        <ValorOperacao rotulo="Vazão (Q)" valor={f2(Qt_m3h)} unidade="m³/h" conversao={`${f2(res.Qt)} L/min`} tom="text-red"/>
        <ValorOperacao rotulo="Altura manométrica (Hm)" valor={f2(res.P_RTI)} unidade="mca" conversao={`${fmtNum(res.P_RTI * 9.80665, 1)} kPa`} tom="text-red"/>
      </div>
    </FormSection>
  )
}

// ── Etapas ────────────────────────────────────────────────────────────
// Mesmo componente de menu lateral do wizard de configuração inicial do
// projeto (StepsNav.jsx, ver ConfiguracaoPage.jsx) — aqui sem trava entre
// etapas (isUnlocked sempre true, o RT pode ir e voltar livremente), só
// com um indicativo de "concluído"/"pendente" por etapa.
const ETAPAS_HIDRANTES = [
  { label: 'Classificação do Sistema',          sub: 'Tipo, RTI e sistema aplicado' },
  { label: 'Dimensionamento do Sistema',         sub: 'Perdas de carga, cotas e pressão' },
  { label: 'Dimensionamento da Bomba de Incêndio', sub: 'Eficiência e potência' },
]

// ── Page Principal ────────────────────────────────────────────────────
// `extra`: conteúdo do estado no fim da página — um elemento (em todas as
// etapas) ou { [etapa]: elemento } (ex.: PB, campos do item 17 do formulário
// do CBMPB por etapa — ver estados/PB/paginas.jsx).
export default function HidrantesPage({ extra = null }) {
  const { state, dispatch } = useProjeto()
  // Persistido em state.hidrantes.dimensionamento (não mais useState local)
  // pra sobreviver navegação/reload e alimentar também o memorial de
  // cálculo (memorial/hidrantesCalculo.js, sempre a última folha do
  // memorial) — mesmo payload sincronizado pelo plugin, sem transformação.
  const dados = state.hidrantes.dimensionamento
  const norma = getHidrantes(state.uf)
  const toast = useToast()
  const [buscando,   setBuscando]   = useState(false)
  const { search } = useLocation()
  const [etapa, setEtapa] = useState(() => Number(new URLSearchParams(search).get('etapa')) === 3 ? 3 : 1)
  const fileInputRef = useRef(null)

  const aplicarHidrantes = payload => {
    dispatch({ type: 'SET_HIDRANTES', changes: { dimensionamento: payload } })
    if (payload?._timestamp) toast.success(`Dados importados do Revit — exportação: ${payload._timestamp}${payload.metodo ? ` · Método: ${payload.metodo}` : ''}`)
  }

  const eta = state.hidrantes.bombaEficiencia
  const potenciaAdotada = state.hidrantes.bombaPotenciaAdotada
  const { potCv } = dados ? calcPotenciaBomba(dados.res.Qt, dados.res.P_RTI, eta) : { potCv: null }

  const handleImport = e => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result)
        if (!json.hidrantes) throw new Error('Chave "hidrantes" não encontrada no arquivo.')
        aplicarHidrantes(json.hidrantes)
      } catch (err) {
        toast.error(`Erro ao importar: ${err.message || 'Arquivo inválido.'}`)
        dispatch({ type: 'SET_HIDRANTES', changes: { dimensionamento: null } })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  // Hidrantes é a única medida que fica geral (compartilhada entre todas
  // as estruturas do projeto, sem escopo) — se mais de um arquivo Revit
  // sincronizar hidrantes, o último a enviar substitui o anterior sem
  // aviso. Por isso confirma antes de puxar, já que é sempre uma troca
  // completa do dimensionamento atual.
  const handleBuscarRevit = async () => {
    if (dados && !window.confirm('Isso substitui o dimensionamento de hidrantes atual pelo mais recente sincronizado do Revit. Continuar?')) return
    setBuscando(true)
    const { data, error } = await supabase
      .from('revit_syncs_latest').select('payload').eq('projeto_id', state.id).eq('medida', 'hidrantes').maybeSingle()
    setBuscando(false)
    if (error || !data) {
      toast.error('Erro ao importar: Nenhum dado de hidrantes sincronizado do Revit ainda para este projeto.')
      dispatch({ type: 'SET_HIDRANTES', changes: { dimensionamento: null } })
      return
    }
    aplicarHidrantes(data.payload)
  }

  // Status por etapa pro menu lateral (mesmo esquema visual de
  // useStepStatus.js: 'done' = concluída, 'partial' = com algo pendente,
  // undefined = ainda não iniciada) — aqui calculado direto, sem hook
  // próprio, já que são só 3 etapas com critério simples.
  const getStatus = n => {
    if (n === 1) return state.hidrantes.tipo ? 'done' : undefined
    if (n === 2) return dados ? 'done' : undefined
    if (n === 3) return eta && potenciaAdotada ? 'done' : dados ? 'partial' : undefined
    return undefined
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <StepsNav
        steps={ETAPAS_HIDRANTES}
        current={etapa}
        isUnlocked={() => true}
        getStatus={getStatus}
        onGo={setEtapa}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-7">
          <div>
            <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
            <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
              <Icon name={SISTEMA_ICON.hidrantes} size={20} color="var(--color-red)" className="shrink-0"/>
              Hidrantes / Mangotinho
            <LinkNorma sistema="hidrantes"/>
            <InfoTip side="bottom" align="start" text={<>Classificação conforme {norma.NORMA.nome} / NBR 13714 — o dimensionamento hidráulico é calculado pelo plugin Revit a partir dela.</>}/>
          </h2>
          </div>
        </div>

        {etapa === 1 && (
          <FormularioSistema/>
        )}

        {etapa === 2 && (
          <>
            <div className="flex items-center justify-end gap-4 mb-7">
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

            {!dados && (
              <div className="py-[60px] px-10 text-center border border-dashed border-border rounded-lg text-ink-faint">
                <Icon name="upload" size={32} color="var(--color-border)"/>
                <div className="mt-3 text-[13px]">Importe o <strong>firedata.json</strong> gerado pelo plugin Revit para visualizar o dimensionamento.</div>
              </div>
            )}

            {dados && (
              <>
                <DadosDoSistema d={dados}/>

                <VerificacaoHidranteDesfavoravel ranking={dados.ranking_hidrantes}/>

                <ResumoExecutivo d={dados}/>

                <ResultadoHidraulico d={dados}/>

                <div className="mb-8">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-[.05em] mb-3">Verificação de Velocidade</h4>
                  <VerificacaoVelocidade d={dados} norma={norma}/>
                </div>

                <div className="mb-8">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-[.05em] mb-3">Perdas de Carga por Trecho</h4>
                  <PerdasPorTrecho d={dados}/>
                </div>
              </>
            )}
          </>
        )}

        {etapa === 3 && (
          <>
            {!dados ? (
              <div className="ibox amber mb-6">
                <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
                <span className="text-xs">Calcule o dimensionamento na Etapa 2 (Dimensionamento do Sistema) antes de dimensionar a bomba.</span>
              </div>
            ) : (
              <>
                <Bomba d={dados}/>
                <SelecaoBombas
                  vazaoM3h={dados.res.Qt / 1000 * 60}
                  pressaoMca={dados.res.P_RTI}
                  eta={eta}
                  onChangeEta={v => dispatch({ type: 'SET_HIDRANTES', changes: { bombaEficiencia: v } })}
                  potenciaAdotada={potenciaAdotada}
                  onChangePotenciaAdotada={v => dispatch({ type: 'SET_HIDRANTES', changes: { bombaPotenciaAdotada: v } })}
                  potCv={potCv}
                />
                <SucaoBomba/>
              </>
            )}
          </>
        )}
        {/* `extra` do estado: um elemento (todas as etapas) ou { [etapa]: elemento }. */}
        {extra && !isValidElement(extra) ? extra[etapa] : extra}
        </div>
      </div>
    </div>
  )
}
