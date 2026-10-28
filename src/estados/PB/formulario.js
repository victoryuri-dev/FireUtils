// estados/PB/formulario.js — preenche o formulário "Memorial Descritivo do
// Projeto de Segurança Contra Incêndio" do CBMPB a partir do projeto.
//
// Diferente do memorial do MA (memorial/registry.js, texto corrido por
// medida), a Paraíba exige o próprio formulário do CBMPB: seções fixas, de
// marcar X e preencher campos curtos, com "Exigível / Não exigível" em cada
// medida. Este módulo só monta os DADOS do formulário — uma lista de seções,
// cada uma com uma lista de linhas tipadas — e quem desenha a folha é
// MemorialPBPage.jsx. Assim o layout do documento e a lógica de "o que
// marcar" ficam separados, e esta parte é testável fora do React.
//
// Toda informação sai de uma das três fontes, nunca de suposição:
//   1. o que o projeto já tem (classificação, dimensionamentos, medidas —
//      os MESMOS cálculos das telas: se_calc, brigada_calc, trrf_calc...);
//   2. os parâmetros do formulário (normas/PB/memorial_formulario.js);
//   3. os complementos que só este formulário pede (state.memorialPB).
// Seções ainda não ligadas ao projeto (ver docs/memorial-pb.md) saem com o
// texto do formulário e os campos em branco, mas com Exigível/Não exigível
// marcado — o documento sai completo para impressão desde já.
//
// Tipos de linha (renderizados em MemorialPBPage.jsx):
//   sub       { titulo, nota }                        — faixa laranja (subseção)
//   faixa     { titulo }                              — faixa cinza (título de bloco)
//   exigivel  { exigivel: true|false|null, rotuloExigivel?, rotuloNao? }
//   campos    { celulas: [{ label, valor, peso? }] }  — campos lado a lado
//   checks    { itens: [{ x, label, valor?, peso?, detalhe? }] } — caixas lado a lado
//   grupo     { titulo, itens: [{ x, label }] }       — 3.1 (grupo com rowspan)
//   checkValor{ x, label, valor }                     — caixa + rótulo + coluna de valor
//   texto     { texto, negrito?, centro?, valor? }
//   obs       { label, valor }                        — campo de texto livre (alto)

import {
  getMemorialFormulario, getMedidas, getOcupacoes, getTRRF, getCompartimentacao,
  getBrigada, getExtintores, getCNAEsDivisao, getHidrantes,
} from '../../data/normas/index'
import { riscosEspeciaisDoEstado } from '../../utils/anexoB'
import { fmtNum } from '../../utils/numero'
import { alturaEdificacaoBase, edificacaoEhTerrea, calcularTRRF } from '../../data/trrf_calc'
import { calcularAreaMaximaCompartimentacao, caracteristicaElementoCompart } from '../../data/compart_calc'
import { trrfDaEstrutura } from '../../utils/trrfCompart'
import { resumoSaidasPB } from './saidas'
import { decidirAcessoViaturaPB } from './acessoViatura'
import { riscoValidadePB } from './validade'
import { cmarPorEstrutura, ELEMENTOS_CMAR } from './cmar'
import { riscoDoPavimentoRobusto, calcularBrigadaPavimento, NIVEL_LABEL, maiorRisco, maiorNivel } from '../../data/brigada_calc'
import { observacoesDoProjeto, ROTULO_OBSERVACOES } from '../../utils/observacoes'
import { textoMemorialBrigadaIncendio } from '../../data/memorial/brigada_incendio'
import { enquadrarTipoProjeto } from '../../data/tipoProjeto'
import { opcoesPublicoBrigada } from '../../utils/brigadaPublico'
import { opcaoCapacidade } from '../../data/extintores_calc'
import { LANCES_INTERNOS, LANCES_EXTERNOS, TIPOS_MANGUEIRA, tipoMangueiraValido } from '../../data/hidrantesMangueiras'
import { registroComConselho } from '../../utils/conselho'

const vazio = v => v === '' || v === null || v === undefined
// Valor preenchido no meio de um texto do formulário: sai em negrito no
// documento (SecaoFormulario.jsx, `comDestaque`). Campos com `valor` próprio
// já saem em negrito.
export const DESTAQUE = /\uE000([\s\S]*?)\uE001/g
const V = v => `\uE000${v}\uE001`
export const semDestaque = t => String(t ?? '').replace(DESTAQUE, '$1')

const fmtM  = v => `${fmtNum(v, 2, String(v))} m`
const fmtM2 = v => `${fmtNum(v, 2, String(v))} m²`
const unicos = lista => [...new Set(lista.filter(v => !vazio(v)))]
const juntar = lista => unicos(lista).join('; ')
const texto = (...partes) => partes.map(p => (p || '').trim()).filter(Boolean).join('\n')

// Linhas de checkbox do texto do formulário que ainda não são ligadas a
// nenhum dado do projeto — saem sempre desmarcadas.
const c  = (label, extra = {}) => ({ x: false, label, ...extra })
const ck = (...itens) => ({ tipo: 'checks', itens })
const linhasCheck = labels => labels.map(l => ck(c(l)))
const sub = (titulo, nota) => ({ tipo: 'sub', titulo, nota })
const obs = (label, valor = '') => ({ tipo: 'obs', label, valor })
const campos = (...celulas) => ({ tipo: 'campos', celulas })
const campo = (label, valor = '') => campos({ label, valor })

const RISCO_LABEL = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

// 3.6 — opções de edificação existente ("as built") e as que pedem a
// descrição das adaptações; usadas também pelo box Situação
// (components/pb/CamposPB.jsx:EstagioExistentePB).
export const ESTAGIOS_EXISTENTE = ['existente_nt16', 'existente_atual', 'existente_rt']
export const ESTAGIOS_COM_ADAPTACOES = ['existente_nt16', 'existente_rt']

// Campo de observações de uma seção = as "Observações complementares" que o
// RT escreveu na página da medida, de todas as estruturas (o formulário tem
// um campo só; com mais de uma estrutura, cada linha leva o nome dela).
const obsDe = (state, medida) => observacoesDoProjeto(state.estruturas, medida)

// ── Dados derivados do projeto (uma vez por documento) ─────────────────────

// Carga de incêndio de uma ocupação (divisão + CNAE) — mesma regra do
// memorial do MA (MemorialDescritivoPage.jsx:cargaDaOcupacao): levantamento
// manual vence; senão o catálogo de CNAEs da divisão; senão o valor salvo.
function cargaDaOcupacao(state, estruturaId, divisao, cnae) {
  const c = state.cargaState?.[estruturaId]?.[divisao]
  if (c?.metodo === 'levantamento') return parseFloat(c.valorManual) || 0
  const daCatalogo = cnae ? getCNAEsDivisao(state.uf, divisao)[cnae]?.cargaIncendio : null
  return daCatalogo || c?.cargaIncendio || 0
}

function cargaMaximaDoProjeto(state) {
  return (state.pavimentos || []).reduce((mx, p) => {
    const ocup = [{ divisao: p.divisao, cnae: p.cnae }, ...(p.acess || []).map(a => ({ divisao: a.divisao, cnae: a.cnae }))]
    return ocup.filter(o => o.divisao).reduce((m, o) => Math.max(m, cargaDaOcupacao(state, p.estruturaId, o.divisao, o.cnae)), mx)
  }, 0)
}

// Primeira faixa cujo `max` comporta o valor (max null = sem teto).
const faixaDe = (faixas, v) => faixas.find(f => f.max == null || v <= f.max) || null

/** "Exigível" no sentido do formulário: a norma exige a medida (ou o RT a
 * adotou mesmo sem exigência). `null` = não dá pra afirmar nenhum dos dois —
 * projeto ainda sem ocupação classificada, ou o estado sem a tabela de
 * exigências cadastrada (aí o motor só aplica o mínimo de referência, ver
 * useMedidasObrigatorias:BASELINE_QUANDO_FALTA_DADO, e "não exigível" seria
 * uma afirmação sem base). `ativo` já segue o toggle manual do RT. */
function exigibilidade(ctx, key) {
  const s = ctx.sistemas?.[key]
  if (s?.ativo) return true
  // Exigida pela norma mas desativada pelo RT (isenção): sai do formulário.
  if (s?.obrigatorio) return false
  if (!ctx.temClassificacao || !ctx.temTabelaExigencias) return null
  return false
}

// ── Seções ─────────────────────────────────────────────────────────────────

function secaoIdentificacao(state) {
  const endereco = [[state.endereco, state.numero].filter(Boolean).join(', '), state.complemento].filter(Boolean).join(' — ')
  return {
    titulo: '1. IDENTIFICAÇÃO DA EDIFICAÇÃO',
    linhas: [
      campo('Obra/Razão Social:', state.respRazaoSocial || state.nome || ''),
      campo('Endereço da edificação:', endereco),
      campos({ label: 'Bairro:', valor: state.bairro || '', peso: 3 }, { label: 'Município:', valor: state.cidade || '', peso: 2 }),
      campo('Responsável técnico:', state.rtNome || ''),
      campos({ label: 'CREA/CAU nº:', valor: registroComConselho(state), peso: 3 }, { label: 'ART/RRT nº:', valor: state.artNumero || '', peso: 2 }),
    ],
  }
}

// A ferramenta só gera projeto técnico ou simplificado (data/tipoProjeto.js):
// os dois são PCI — PTIOT/PTOTEP (ocupação temporária) ficam desmarcados.
// Sem área/altura para enquadrar, nada é marcado. Os rótulos são os do
// formulário padrão do CBMPB, sem acréscimos.
function secaoFormaApresentacao(state, F) {
  const { tipo } = enquadrarTipoProjeto(state.uf, state.estruturas)
  return {
    titulo: '2. FORMA DE APRESENTAÇÃO', nota: '(Marcar com X a que se refere o PCI)',
    linhas: F.FORMAS_APRESENTACAO.map(f => ck({
      x: f.key === 'pci' && !!tipo,
      label: f.label,
    })),
  }
}

function secaoParametros(state, F, ctx) {
  const m = state.memorialPB || {}
  const linhas = []

  // 3.1 Natureza da ocupação — todas as divisões de todas as estruturas.
  const ocupacoes = getOcupacoes(state.uf)
  const fora = new Set(F.DIVISOES_FORA_DO_FORMULARIO || [])
  linhas.push(sub('3.1 Natureza da Ocupação'))
  Object.entries(ocupacoes).forEach(([letra, g]) => {
    const itens = Object.entries(g.divisoes || {})
      .filter(([cod]) => !fora.has(cod))
      .map(([cod, nome]) => ({ x: ctx.divisoes.has(cod), label: `${cod} - ${nome}` }))
    // Como no modelo do CBMPB: a 1ª folha vai até o grupo F e a tabela
    // continua na folha seguinte, a partir do G, com a faixa de continuação.
    if (letra === 'G') linhas.push({ tipo: 'continuacao', titulo: 'Continuação: natureza de ocupação' })
    if (itens.length) linhas.push({ tipo: 'grupo', titulo: g.descricao, itens })
  })
  const naoListadas = [...ctx.divisoes].filter(d => fora.has(d)).sort()
  linhas.push({ tipo: 'texto', negrito: true, texto: 'O responsável Técnico deverá consultar a Norma Técnica (NT) 04/2023 para realizar o enquadramento da edificação' })
  linhas.push(obs('Observação Livre:', texto(
    naoListadas.length ? `Divisão(ões) também presente(s) na edificação, sem linha no formulário: ${V(naoListadas.join(', '))}.` : '',
    m.obsNatureza,
  )))

  // 3.2 Altura — a maior entre as estruturas (o formulário é um só).
  const maisAlta = (state.estruturas || []).reduce((mx, e) => (!mx || alturaEdificacaoBase(e) > alturaEdificacaoBase(mx) ? e : mx), null)
  const h = maisAlta ? alturaEdificacaoBase(maisAlta) : null
  const informada = maisAlta && (edificacaoEhTerrea(maisAlta) || h > 0)
  const classeAltura = !informada ? null
    : edificacaoEhTerrea(maisAlta) ? F.CLASSES_ALTURA[0]
    : F.CLASSES_ALTURA.slice(1).find(cl => h <= cl.max) || null
  linhas.push(sub('3.2 Altura entre o nível de descarga e o piso do último pavimento habitável', '(Marcar com X na altura correspondente e informar o valor conforme item 4.1. da NT CBMPB 04)'))
  F.CLASSES_ALTURA.forEach((cl, i) => {
    const x = classeAltura?.classe === cl.classe
    const itens = [{ x, label: `Tipo ${cl.classe}`, peso: 1 }, { label: cl.nome, peso: 4, semCaixa: true }]
    if (i > 0) itens.push({ label: 'Altura exata em m:', valor: x ? fmtM(h) : '', peso: 2, semCaixa: true })
    linhas.push(ck(...itens))
  })
  if (informada && !classeAltura) {
    linhas.push({ tipo: 'texto', texto: `Altura da edificação: ${V(fmtM(h))} — acima da faixa coberta pelo formulário (Tipo V, até 30 m).` })
  }

  // 3.3 Área construída.
  const estruturas = state.estruturas || []
  linhas.push(sub('3.3 Área construída em m² (Conforme item 4.5 ou 4.7 da NT CBMPB 04/2023)'))
  linhas.push(campos(
    { label: 'Área total construída em edificação única:', peso: 3 },
    { label: 'Área:', valor: estruturas.length <= 1 && state.areaConstruidaTotal ? fmtM2(state.areaConstruidaTotal) : '', peso: 2 },
  ))
  linhas.push({ tipo: 'texto', centro: true, texto: 'Área de cada edificação em caso de múltiplas edificações:' })
  const multiplas = estruturas.length > 1 ? estruturas : []
  for (let i = 0; i < Math.max(4, multiplas.length); i++) {
    const e = multiplas[i]
    linhas.push(campos({ label: 'Descrição:', valor: e?.nome || '', peso: 3 }, { label: 'Área:', valor: e?.areaTotal ? fmtM2(e.areaTotal) : '', peso: 2 }))
  }

  // 3.4 Risco e validade — Anexo B da NT 02/2023 (maior risco entre as
  // divisões); 3.5 Nível — da maior carga de incêndio do projeto.
  const q = ctx.cargaMaxima
  const risco = riscoValidadePB(state.uf, [...ctx.divisoes].sort(), !!m.f3EstadioFutebol)
  const nivel = q > 0 ? faixaDe(F.NIVEIS_CARGA, q) : null
  linhas.push(sub('3.4 Risco da edificação e Validade de inspeção', '(Marcar com X no risco correspondente, conforme Anexo B da NT CBMPB 02/2023)'))
  F.RISCOS_VALIDADE.forEach(r => linhas.push(ck({ x: risco?.risco === r.risco, label: r.label, peso: 1 }, { label: r.validade, peso: 4, semCaixa: true })))
  linhas.push({ tipo: 'texto', texto: 'OBSERVAÇÃO: O proprietário deve consultar a Lei 9.625/2011 para compreender os critérios relativos à renovação anual da certificação de sua edificação e, se necessário, entrar em contato com a DAT para esclarecer quaisquer dúvidas durante o processo de renovação.', rotulo: 'OBSERVAÇÃO:' })

  // 3.4.1 GLP — só com o risco especial GLP marcado e a classe informada.
  const glp = ctx.riscos.has('glp') ? F.CLASSES_GLP.find(g => g.key === m.glpClasse) : null
  linhas.push(sub('3.4.1 Classes de risco para revenda de GLP', '(Marcar com X no risco correspondente, conforme tabela 1 da NBR ABNT 15514)'))
  linhas.push(ck({ x: glp?.coluna === 'exigivel', label: 'EXIGÍVEL', negrito: true }, { x: glp?.coluna === 'nao_exigivel', label: 'NÃO EXIGÍVEL', negrito: true }))
  const esq = F.CLASSES_GLP.filter(g => g.coluna === 'exigivel')
  const dir = F.CLASSES_GLP.filter(g => g.coluna === 'nao_exigivel')
  for (let i = 0; i < Math.max(esq.length, dir.length); i++) {
    linhas.push(ck(
      { x: glp?.key === esq[i]?.key, label: esq[i]?.label || '' },
      { x: glp?.key === dir[i]?.key, label: dir[i]?.label || '' },
    ))
  }

  linhas.push(sub('3.5 Carga incêndio da edificação', '(Conforme dimensionamento descrito no anexo A e C da NT CBMPB nº 02/2023)'))
  F.NIVEIS_CARGA.forEach(n => linhas.push(ck({ x: nivel?.nivel === n.nivel, label: `Nível ${n.nivel}`, peso: 1 }, { label: n.label, peso: 4, semCaixa: true })))

  // 3.6 Estágio — sai da Situação (Etapa 2): edificação nova = "ainda será
  // construída"; existente = a opção "as built" escolhida no box Situação
  // (só as três de existente valem — uma escolha feita antes de trocar para
  // "nova" não fica marcada). Adaptações só com NT 16 / Resoluções Técnicas.
  const estagio = state.situacao === 'nova' ? 'a_construir'
    : state.situacao === 'existente' && ESTAGIOS_EXISTENTE.includes(m.estagioConstrucao) ? m.estagioConstrucao
    : ''
  linhas.push(sub('3.6 Estágio de construção da edificação'))
  F.ESTAGIOS_CONSTRUCAO.forEach(e => linhas.push(ck({ x: estagio === e.key, label: e.label })))
  linhas.push(obs('O responsável Técnico deverá indicar quais serão as adaptações da NT 16 e/ou Resoluções Técnicas utilizada na edificação:',
    ESTAGIOS_COM_ADAPTACOES.includes(estagio) ? m.adaptacoes || '' : ''))

  return { titulo: '3. PARÂMETROS DE DIMENSIONAMENTO', linhas }
}

// 4. Ordem do formulário, em duas colunas. key null = medida que o app ainda
// não rastreia (sai sempre em branco).
const MEDIDAS_COL1 = [
  ['acesso_viatura', 'Acesso de Viatura na Edificação'],
  ['seg_estrutural', 'Segurança Estrutural contra Incêndio e Pânico'],
  ['compart_horizontal', 'Compartimentação Horizontal'],
  ['compart_vertical', 'Compartimentação Vertical'],
  ['controle_acabamento', 'Controle de Materiais de Acabamento - CMAR'],
  ['saida_emergencia', 'Saídas de Emergência'],
  ['gerenciamento_risco', 'Gerenciamento de risco de incêndio'],
  ['brigada', 'Brigada de Incêndio'],
  ['iluminacao', 'Iluminação de Emergência'],
]
const MEDIDAS_COL2 = [
  ['deteccao', 'Detecção de Incêndio'],
  ['alarme', 'Alarme de Incêndio'],
  ['sinalizacao', 'Sinalização de Emergência'],
  ['extintores', 'Extintores de Incêndio'],
  ['hidrantes', 'Hidrantes ou mangotinhos'],
  ['sprinklers', 'Chuveiros Automáticos – SPK'],
  ['controle_fumaca', 'Controle de fumaça'],
  [null, 'Sistema de espuma'],
  [null, 'Sistema de resfriamento'],
]

function secaoMedidas(ctx) {
  const item = ([key, label]) => ({ x: !!(key && ctx.sistemas?.[key]?.ativo), label })
  return {
    titulo: '4. MEDIDAS DE PROTEÇÃO DA EDIFICAÇÃO', nota: '(Marcar X nos preventivos exigidos para edificação, conforme tabelas 5A até 5M.5 e 6 da NT CBMPB 04)',
    linhas: MEDIDAS_COL1.map((m, i) => ck(item(m), item(MEDIDAS_COL2[i]))),
  }
}

// 5. Ordem do formulário (duas colunas).
const RISCOS_COL1 = ['liquidos_inflamaveis', 'produtos_perigosos', 'glp', 'tendas_inflamaveis', 'estrutura_montada']
const RISCOS_COL2 = ['fogos_artificio', 'vasos_pressao', 'outros', 'geradores_eletricos', 'sistemas_eletricos_montados']

function secaoRiscos(state, ctx) {
  const lista = Object.fromEntries(riscosEspeciaisDoEstado(state.uf).map(r => [r.key, r.label]))
  const outrosDesc = juntar(Object.values(state.riscosOutrosDescPorEstrutura || {}))
  const item = key => ({
    x: ctx.riscos.has(key),
    label: lista[key] || key,
    valor: key === 'outros' && ctx.riscos.has('outros') ? outrosDesc : undefined,
  })
  return {
    titulo: '5. RISCOS ESPECIAIS QUE A EDIFICAÇÃO POSSUI',
    linhas: RISCOS_COL1.map((k, i) => ck(item(k), item(RISCOS_COL2[i]))),
  }
}

function secaoAcessoViatura(state, F, ctx) {
  const ativo = !!ctx.sistemas?.acesso_viatura?.ativo
  // Hidrante de recalque: sistema de hidrantes exigido no projeto.
  const temRecalqueProjeto = !!ctx.sistemas?.hidrantes?.ativo
  const r = ativo ? decidirAcessoViaturaPB(state.memorialPB?.acessoViatura, temRecalqueProjeto, F.ACESSO_VIATURA) : null
  // Distâncias nas lacunas "______" das linhas, só na linha marcada.
  const d = v => (v == null ? '______' : V(fmtM(v)))
  const preencher = (texto, ...valores) => valores.reduce((t, v) => t.replace('______', d(v)), texto)
  const linha = (n, texto, ...valores) => ck({ x: r?.caso === n, label: r?.caso === n ? preencher(texto, ...valores) : texto })
  return {
    faixa: 'ESPECIFICAÇÃO DOS PREVENTIVOS DA EDIFICAÇÃO',
    titulo: '6. ACESSO DE VIATURA', nota: '(Conforme NT CBMPB nº14/2023)',
    linhas: [
      { tipo: 'exigivel', exigivel: exigibilidade(ctx, 'acesso_viatura') },
      linha(1, 'Locais sem hidrante de recalque e que possuam todas edificações com distância INFERIOR a 20 m em relação a entrada da circulação comum e a via pública, a contar do meio fio (Não se faz necessário ter o acesso de viatura, tornando-se um item facultativo). Distância: ______', r?.edificacao),
      linha(2, 'O hidrante de recalque tem caminhamento INFERIOR ou igual a 20 m entre o registro de qualquer hidrante de recalque e a via pública, a contar do meio fio. Distância exata: ______\nA edificação tem caminhamento INFERIOR ou igual a 50 m medidos entre a entrada da circulação comum e a via pública, a contar do meio fio. Distância exata: ______\n(Não se faz necessário ter o acesso de viatura, tornando-se um item facultativo).', r?.recalque, r?.edificacao),
      linha(3, 'Locais sem hidrante de recalque e que possuam qualquer edificação com distância SUPERIOR a 20 m em relação a entrada da circulação comum e a via pública, a contar do meio fio. (O acesso de viatura é obrigatório).'),
      linha(4, 'O hidrante de recalque não tem distância SUPERIOR a 20 m entre o registro de qualquer hidrante de recalque e a via pública, a contar do meio fio. Distância exata: ______\nA edificação tem caminhamento SUPERIOR a 50 m medidos entre a entrada da circulação comum e a via pública, a contar do meio fio. Distância exata: ______\n(O acesso de viatura é obrigatório)', r?.recalque, r?.edificacao),
      linha(5, 'O hidrante de recalque tem distância SUPERIOR a 20 m entre o registro de qualquer hidrante de recalque e a via pública, a contar do meio fio. Distância exata: ______\nA edificação tem caminhamento SUPERIOR a 50 m medidos entre a entrada da circulação comum e a via pública, a contar do meio fio. Distância exata: ______\n(O acesso de viatura é obrigatório)', r?.recalque, r?.edificacao),
      ck({ x: !!r?.via.atende, label: 'Vias de acesso para viaturas\na) largura mínima de 6,0m;\nb) suportar viaturas com peso de 25.000kgf em toda sua extensão;\nc) desobstrução em toda a largura;\nd) altura livre mínima de 4,5m;\ne) a via de acesso (interna ao imóvel) deve distar, no máximo, 20 metros da edificação quando não houver previsão de sistema de hidrantes, ou 10 m do hidrante de recalque quando houver previsão de sistema hidráulico preventivo;\nf) o portão de acesso (quando houver) deve ter as dimensões mínimas de 4m de largura e 4,5m de altura;' }),
      ck({ x: !!r?.via.reduzida, label: 'Locais com via de acesso com largura inferior a 6,00 m, até o limite mínimo de 5,00 m' }),
      ck({ x: !!r?.faixa, label: 'Faixas de estacionamento\na) largura mínima de 6,00 m;\nb) comprimento mínimo de 15,00 m;\nc) suportar viaturas com peso de 25.000kgf (245.166,25N) em toda sua extensão;\nd) o desnível máximo da faixa de estacionamento não poderá ultrapassar o valor de 5%, tanto longitudinal quanto transversal;\ne) ser paralela a uma das faces da edificação que possua aberturas (portas e ou janelas);\nf) distância máxima da faixa de estacionamento até a face da edificação deve ser de 8 m, medidas a partir de sua borda mais próxima do edifício;\ng) a faixa de estacionamento deve estar livre de postes, painéis, árvores ou qualquer outro elemento que possa obstruir a operação das viaturas;\nh) a faixa de estacionamento deve ser adequadamente sinalizada, com placas de "PROIBIDO PARAR E ESTACIONAR"' }),
      ck({ x: r?.obrigatorio === true && !!r?.via.exigeRetorno, label: 'Áreas para retorno que garantam a entrada e saída de viaturas para as vias com largura inferior a 6,00 m e que tenham mais de 30 m de comprimento em relação à via pública' }),
      ck({ x: r?.obrigatorio === true && !!r?.portaoOk, label: 'O portão de acesso (quando houver) deve ter as dimensões mínimas de 4m de largura e 4,5m de altura' }),
    ],
  }
}

function secaoSegEstrutural(state, ctx) {
  const exigivel = exigibilidade(ctx, 'seg_estrutural')
  let grupo = '', divisao = '', classe = '', trrf = ''
  if (exigivel) {
    const { TABELA_TRRF, CLASSES_ALTURA, CLASSES_SUBSOLO, DIVISOES_SEM_OCUPACAO_SUBSOLO } = getTRRF(state.uf) || {}
    const resultados = !TABELA_TRRF ? [] : (state.estruturas || []).map(est => {
      const pavs = (state.pavimentos || []).filter(p => p.estruturaId === est.id)
      return calcularTRRF(pavs, est, TABELA_TRRF, CLASSES_ALTURA, CLASSES_SUBSOLO, DIVISOES_SEM_OCUPACAO_SUBSOLO)
    })
    const divs = [...ctx.divisoes].sort()
    grupo = unicos(divs.map(d => d.charAt(0))).join(', ')
    divisao = divs.join(', ')
    classe = juntar(resultados.flatMap(r => [r.classeSubsolo, r.classeAltura]))
    trrf = juntar(resultados.flatMap(r => [...r.resumoSubsolo, ...r.resumoAcimaSolo]).map(t => `${t.valor} min (${t.divisao})`))
  }
  return {
    titulo: '7. SEGURANÇA ESTRUTURAL CONTRA INCÊNDIO', nota: '(Informar as características da edificação, conforme tabela B da NT CBMPB Nº 08)',
    linhas: [
      { tipo: 'exigivel', exigivel },
      campo('GRUPO (A, B, C, D, E, F, G, H, I, J ou K):', grupo),
      campo('DIVISÃO:', divisao),
      campo('CLASSE (S2, S1, P1 até P8):', classe),
      campo('TRRF (em minutos):', trrf),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'seg_estrutural')),
      { tipo: 'texto', negrito: true, texto: 'ORIENTAÇÃO (VERIFICAR AS NOTAS ESPECIFICAS NAS NTS):' },
    ],
  }
}

// 8. Linhas do formulário → chave do elemento no catálogo de
// compartimentação (ELEMENTOS_COMPART_HORIZONTAL/VERTICAL). A "cortina
// corta-fogo" do formulário é o dispositivo automatizado de enrolar.
const COMPART_H = [
  ['parede_corta_fogo', 'Paredes corta-fogo'],
  ['porta_corta_fogo', 'Portas corta-fogo'],
  ['vedador_corta_fogo', 'Vedadores corta-fogo'],
  ['registro_corta_fogo', 'Registros corta-fogo (dampers)'],
  ['selo_corta_fogo', 'Selos corta-fogo'],
  ['dispositivo_enrolar', 'Cortina corta-fogo'],
  ['afastamento_horizontal', 'Afastamento horizontal entre aberturas'],
]
const COMPART_V = [
  ['entrepiso_corta_fogo', 'Entrepisos corta-fogo'],
  ['enclausuramento_escada', 'Enclausuramento de escadas por meio de parede de compartimentação'],
  ['enclausuramento_elevador', 'Enclausuramento de poços de elevador e de montacarga por meio de parede de compartimentação'],
  ['registro_corta_fogo', 'Registros corta-fogo (dampers)'],
  ['selo_corta_fogo', 'Selos corta-fogo'],
  ['dispositivo_enrolar', 'Cortina corta-fogo'],
  ['vedador_corta_fogo', 'Vedadores corta-fogo'],
  ['separacao_fachada', 'Elementos construtivos corta-fogo de separação vertical entre pavimentos consecutivos'],
  ['selagem_perimetral', 'Selagem perimetral corta-fogo'],
]

function secaoCompartimentacao(state, ctx) {
  const exigH = exigibilidade(ctx, 'compart_horizontal')
  const exigV = exigibilidade(ctx, 'compart_vertical')
  const exigivel = exigH || exigV ? true : (exigH === false && exigV === false ? false : null)
  // Elementos adotados e suas características: os das páginas de
  // Compartimentação (comuns aos estados), somando as estruturas.
  const estruturas = state.estruturas || []
  const marcadosH = new Set(exigH ? estruturas.flatMap(e => e.elementosCompartHorizontal || []) : [])
  const marcadosV = new Set(exigV ? estruturas.flatMap(e => e.elementosCompartVertical || []) : [])
  // Característica do elemento em cada estrutura (a informada ou o TRRF
  // automático), com o nome da estrutura quando há mais de uma.
  const caracteristica = (prefixo, key) => {
    const campo = prefixo === 'h' ? 'elementosCompartHorizontal' : 'elementosCompartVertical'
    const com = estruturas
      .filter(e => (e[campo] || []).includes(key))
      .map(e => [e.nome, caracteristicaElementoCompart(e, prefixo, key, trrfDaEstrutura(state, e), getCompartimentacao(state.uf))])
      .filter(([, t]) => t)
    return com.length === 1 || estruturas.length === 1 ? com.map(([, t]) => t).join('; ') : com.map(([n, t]) => `${n}: ${t}`).join('; ')
  }

  // Área máxima a compartimentar: a mais restritiva entre os pavimentos das
  // estruturas em que a horizontal é exigida (mesmo cálculo da tela).
  let areaMax = null, comissao = false
  if (exigH) {
    const { TABELA_AREA_MAXIMA, CLASSES_TIPO_EDIFICACAO } = getCompartimentacao(state.uf) || {}
    ;(TABELA_AREA_MAXIMA ? ctx.porEstrutura || [] : []).filter(pe => pe.sistemas?.compart_horizontal?.ativo).forEach(pe => {
      const pavs = (state.pavimentos || []).filter(p => p.estruturaId === pe.estrutura.id)
      calcularAreaMaximaCompartimentacao(pavs, pe.estrutura, TABELA_AREA_MAXIMA, CLASSES_TIPO_EDIFICACAO, state.areaCompartimentacaoHorizontal)
        .linhas.forEach(l => {
          if (typeof l.valor === 'number') areaMax = areaMax == null ? l.valor : Math.min(areaMax, l.valor)
          else if (l.valor === 'CTD') comissao = true
        })
    })
  }
  // Só 'CTD' (Comissão Técnica) e nenhum limite numérico: a área fica para a
  // Comissão; com limite numérico, vale o mais restritivo.
  const area = areaMax != null ? fmtNum(areaMax, 0, String(areaMax)) : comissao ? '(a definir pela Comissão Técnica)' : '______'
  const linhaElemento = (prefixo, marcados) => ([key, label]) => ({
    tipo: 'checkValor', x: marcados.has(key), label, valor: marcados.has(key) ? caracteristica(prefixo, key) : '',
  })

  return {
    titulo: '8. COMPARTIMENTAÇÃO VERTICAL E HORIZONTAL', nota: '(Informar na área sublinhada a característica da edificação, conforme NT CBMPB Nº 36)',
    linhas: [
      { tipo: 'exigivel', exigivel, rotuloExigivel: 'EXIGÍVEL E ATESTO AS INFORMAÇÕES ABAIXO' },
      { tipo: 'texto', justificado: true, texto: `Atesto que as compartimentações foram/serão realizadas de acordo com as normas construtivas em vigor e NT 36, de acordo com as características da construção. Os compartimentos independentes de sua natureza de ocupação, possuem dimensões adequadas à sua atividade e que para esta edificação possuirá área máxima a ser compartimentada horizontalmente de ${V(`${area} m²`)}. Os materiais de construção (estruturas, VEDAÇÕES, acabamento etc.) empregados, mediante aplicação adequada, atendem aos requisitos técnicos quanto à estabilidade, ventilação, higiene, segurança, salubridade, conforto técnico e acústico, atendendo às posturas municipais e às normas do Corpo de Bombeiros do Estado da Paraíba. Que as instalações hidráulicas e elétricas obedecem aos requisitos normativos da ABNT e das respectivas concessionárias. Que os elementos envidraçados atendem aos critérios de segurança previstos nas normas da ABNT.` },
      { tipo: 'texto', texto: 'Indicar os elementos da compartimentação HORIZONTAL e especifica as características:' },
      ...COMPART_H.map(linhaElemento('h', marcadosH)),
      { tipo: 'texto', texto: 'Indicar os elementos da compartimentação VERTICAL e especifica as características:' },
      ...COMPART_V.map(linhaElemento('v', marcadosV)),
    ],
  }
}

function secaoCmar(state, F, ctx) {
  const exigivel = exigibilidade(ctx, 'controle_acabamento')
  const resultado = exigivel ? cmarPorEstrutura(state, ctx.porEstrutura, F.CMAR_LINHAS) : []
  const marcadas = new Set(resultado.map(r => r.linha?.key).filter(Boolean))
  // Classes aceitas por estrutura (só com mais de uma — com uma, a linha
  // marcada já diz tudo).
  const porEstrutura = resultado.length > 1
    ? resultado.filter(r => r.linha).map(r => ({ tipo: 'texto', texto: `${r.estrutura.nome}: ${ELEMENTOS_CMAR.map(([k, rot]) => `${rot} ${V(`Classe ${r.linha.classes?.[k] || '—'}`)}`).join('; ')}` }))
    : []
  return {
    titulo: '9. CMAR', nota: '(Conforme tabela B.1 da NT CBMPB nº 09/2024)',
    linhas: [
      { tipo: 'exigivel', exigivel },
      ...F.CMAR_LINHAS.map(l => ck({ x: marcadas.has(l.key), label: l.texto })),
      ...porEstrutura,
      obs('Observação:', obsDe(state, 'controle_acabamento')),
    ],
  }
}

// Atestos que já nascem marcados (o RT desmarca se não valer).
export const ATESTOS_PADRAO_MARCADOS = new Set([
  'se_escadas_5_7', 'se_guardas_5_8',
  // Iluminação de emergência (13) — requisitos que o sistema sempre tem de
  // atender; o RT ainda pode desmarcar.
  'ilu_autonomia_2h', 'ilu_planos_3lux', 'ilu_desnivel_5lux', 'ilu_planos_aberta_1lux', 'ilu_desnivel_aberta_3lux',
  'ilu_balizamento_f', 'ilu_tarefa_alto_risco', 'ilu_fumaca_15lux',
  'ilu_lum_30vcc', 'ilu_lum_fluxo', 'ilu_lum_70c',
  // Alarme (14.1) — requisitos da norma, todos marcados.
  'alarme_acionador_30m', 'alarme_autonomia_24h', 'alarme_autonomia_15min', 'alarme_altura_acionadores', 'alarme_altura_avisadores',
  // Sinalização (15) — menos as placas M-1/M-2 e a sinalização complementar
  // da NT 16, que dependem do projeto.
  'sin_fotoluminescentes', 'sin_rotas', 'sin_mudancas_direcao', 'sin_equipamentos', 'sin_pavimentos', 'sin_tamanho_a1',
  'sin_mensagens', 'sin_locais_risco',
  // Hidrantes (17) — menos os anéis vermelhos (alternativa à tubulação
  // vermelha); o recalque é automático (RECALQUE_DO_TIPO).
  'hid_desligamento_manual', 'hid_acionador_manual', 'hid_acionamento_auto', 'hid_independencia',
  'hid_dreno_c2', 'hid_drenos_ensaios', 'hid_tubulacao_vermelha', 'hid_manometro',
])
/** Atesto marcado: o que o RT escolheu, ou o padrão quando ainda não mexeu. */
export const atestoMarcado = (atestos, key) => (key in (atestos || {}) ? !!atestos[key] : ATESTOS_PADRAO_MARCADOS.has(key))

const ATESTOS_SAIDAS = [
  ['se_escadas_5_7', 'As escadas atendem aos requisitos do item 5.7 da NT 12, conforme o tipo de escada informado'],
  ['se_guardas_5_8', 'As guardas e corrimãos atendem aos requisitos do item 5.8 da NT 12'],
  ['se_elevadores_5_9', 'Os elevadores de emergência (quando exigido) atendem aos requisitos do item 5.9 da NT 12'],
  ['se_refugio_5_10', 'As áreas de refúgio (quando exigido) atendem aos requisitos do item 5.10 da NT 12'],
]

function secaoSaidas(state, ctx) {
  const m = state.memorialPB || {}
  const at = m.atestos || {}
  const exigivel = exigibilidade(ctx, 'saida_emergencia')
  const r = exigivel ? resumoSaidasPB(state, ctx.porEstrutura) : null
  const val = v => (r && v > 0 ? String(v) : '')
  const lar = v => (r && v > 0 ? fmtM(v) : '')
  const dist = lista => juntar((lista || []).map(d => `${fmtM(d.valor)} (${d.divisao})`))
  const escadas = new Set(r?.escadas || [])
  return {
    titulo: '10. SAÍDA DE EMERGÊNCIA', nota: '(Informar as características das saídas de emergência, conforme tabela B da NT CBMPB 12/2015)',
    linhas: [
      campo('Capacidade de público (pessoas) do pavimento mais habitado:', val(r?.popMax)),
      campo('Capacidade de público (pessoas) total da edificação:', val(r?.popTotal)),
      campo('Largura (metros) dos acessos e descargas:', lar(r?.larAD)),
      campo('Largura (metros) das escadas e rampas:', r ? (r.larER > 0 ? fmtM(r.larER) : 'N/A') : ''),
      campo('Largura (metros) das Portas:', lar(r?.larPT)),
      campo('Distanciamento (metros) máximo a ser percorrido no piso de descarga:', r ? dist(r.distDescarga) : ''),
      campo('Distanciamento (metros) máximo a ser percorrido nos demais andares:', r ? (r.temDemaisAndares ? dist(r.distDemais) : 'N/A') : ''),
      sub('10.1 Características das escadas', '(Marcar X nas características da escada, conforme NT CBMPB 12/2015)'),
      // Escadas: exigíveis só com mais de um pavimento; o tipo sai da Tabela 3.
      { tipo: 'exigivel', exigivel: exigivel && r ? r.temEscada : exigivel },
      { tipo: 'texto', centro: true, negrito: true, texto: 'Tipo de escada (marcar X na(s) escada(s) usada(s) na edificação)' },
      ck(
        { x: !!exigivel && !!r?.temEscada && escadas.has('NE'), label: 'Não Enclausurada - NE' },
        { x: !!exigivel && !!r?.temEscada && escadas.has('EP'), label: 'Enclausurada Protegida - EP' },
        { x: !!exigivel && !!r?.temEscada && escadas.has('PF'), label: 'A prova de fumaça - PF' },
      ),
      // Declarações das escadas/guardas/elevadores/refúgio: só com mais de um pavimento.
      ...ATESTOS_SAIDAS.map(([key, label]) => ck({ x: !!r?.temEscada && atestoMarcado(at, key), label })),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'saida_emergencia')),
    ],
  }
}

function secaoGerenciamento(state, F, ctx) {
  const m = state.memorialPB || {}
  const exigivel = exigibilidade(ctx, 'gerenciamento_risco')
  return {
    titulo: '11 GERENCIAMENTO DE RISCO DE INCÊNDIO (Norma Técnica (NT) 13/2023)',
    linhas: [
      sub('11.1 PLANO DE EMERGÊNCIA', '(Marcar X nas características do plano, conforme NT CBMPB 13/2023)'),
      { tipo: 'exigivel', exigivel },
      ...F.MODELOS_PLANO.map(p => ck({ x: !!exigivel && m.planoModelo === p.key, label: p.label })),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'gerenciamento_risco')),
    ],
  }
}

const ATESTOS_BRIGADA = [
  ['brigada_anexo_d', 'A brigada da edificação segue o previsto no Anexo D'],
  ['brigada_a_construir', 'Edificações, a construir, sem brigada definida, deverá solicitar o recarimbo após brigada definida'],
]

export const INTERVALO_SIMULADOS_PADRAO = '12 meses'
/** Tempo entre simulados: o informado, ou o padrão de 12 meses. */
export const intervaloSimuladosPB = m => (m?.brigadaIntervaloSimulados || '').trim() || INTERVALO_SIMULADOS_PADRAO

/** Resumo da brigada (item 12) — exportado para a página da PB mostrar o
 *  nível e a carga horária (Tabela B.2) de onde vem o valor do formulário. */
export function resumoBrigadaPB(state, sistemas, porEstrutura) {
  return resumoBrigada(state, { sistemas, porEstrutura })
}

// Dimensionamento (campo do formulário): os mesmos blocos do memorial do MA
// (Tabela A.1 + resultado por pavimento), só das estruturas em que a brigada
// é exigida e sem as observações (já vão na "Observação livre" do item 12).
function dimensionamentoBrigada(state, ctx, comBrigada) {
  if (comBrigada.length === 0) return []
  const ids = new Set(comBrigada.map(pe => pe.estrutura.id))
  const estado = { ...state, estruturas: (state.estruturas || []).filter(e => ids.has(e.id)) }
  return textoMemorialBrigadaIncendio(estado, ctx.sistemas, ctx.porEstrutura, { soDimensionamento: true }).blocos
    .filter(b => !(b.tipo === 'campo' && b.label === ROTULO_OBSERVACOES))
}

function resumoBrigada(state, ctx) {
  const brig = getBrigada(state.uf)
  const ext = getExtintores(state.uf)
  if (!brig || !ext) return null
  const { TABELA_A1 } = brig
  const { LIMIARES_RISCO } = ext
  const cnaesDiv = divisao => getCNAEsDivisao(state.uf, divisao)
  let total = 0, temTotal = false
  const divisoes = [], riscos = [], niveis = []
  const comBrigada = (ctx.porEstrutura || []).filter(pe => pe.sistemas?.brigada?.ativo)
  comBrigada.forEach(({ estrutura: est }) => {
    const pavs = (state.pavimentos || []).filter(p => p.estruturaId === est.id)
    const opcoes = opcoesPublicoBrigada(state.uf, pavs)
    pavs.forEach(pav => {
      const risco = riscoDoPavimentoRobusto(pav, state.cargaState?.[est.id] || {}, cnaesDiv, LIMIARES_RISCO)
      const { linha, resultado, nivelTreinamento } = calcularBrigadaPavimento(pav.divisao, risco, pav.populacaoFixa, est.altura, TABELA_A1, est.areaTotal, opcoes)
      if (!linha || linha.isento) return
      divisoes.push(pav.divisao)
      riscos.push(risco)
      niveis.push(nivelTreinamento)
      if (resultado?.brigadistas != null) { total += resultado.brigadistas; temTotal = true }
    })
  })
  // Grau de risco e nível de treinamento: os maiores entre os pavimentos (a
  // carga horária da Tabela B.2 sai desse nível; o misto conta como
  // intermediário).
  const risco = maiorRisco(riscos)
  const nivel = maiorNivel(niveis)
  const nivelMax = nivel?.nivel ? (nivel.nivel === 'misto' ? 'intermediario' : nivel.nivel) : null
  const carga = nivelMax ? brig.CARGA_HORARIA_TREINAMENTO?.[nivelMax] : null
  return {
    total: temTotal ? String(total) : '', divisoes: juntar(divisoes), riscos: risco ? RISCO_LABEL[risco] : '',
    niveis: nivel ? (NIVEL_LABEL[nivel.nivel] || nivel.label) : '',
    dimensionamento: dimensionamentoBrigada(state, ctx, comBrigada), nivelMax, cargaHoraria: carga?.total ?? null, cargaHorariaPartes: carga?.partes || [],
  }
}

function secaoBrigada(state, ctx) {
  const m = state.memorialPB || {}
  const at = m.atestos || {}
  const exigivel = exigibilidade(ctx, 'brigada')
  const r = exigivel ? resumoBrigada(state, ctx) : null
  return {
    titulo: '12. BRIGADA DE INCÊNDIO', nota: '(Informar as características da brigada, conforme NT 17/2024)',
    linhas: [
      { tipo: 'exigivel', exigivel },
      campo('Quantidade mínima de brigadistas:', r?.total || ''),
      campo('Divisão da edificação:', r?.divisoes || ''),
      campo('Grau de risco:', r?.riscos || ''),
      campo('Nível de treinamento:', r?.niveis || ''),
      campo('Carga horária mínima do treinamento (conforme nível de treinamento):', r?.cargaHoraria != null ? `${r.cargaHoraria} horas` : ''),
      campo('Tempo entre simulados na edificação (máximo a cada 12 meses):', exigivel ? intervaloSimuladosPB(m) : ''),
      ...ATESTOS_BRIGADA.map(([key, label]) => ck({ x: atestoMarcado(at, key), label })),
      { tipo: 'obs', label: 'DIMENSIONAMENTO:', blocos: r?.dimensionamento || [] },
      obs('Observação livre:', obsDe(state, 'brigada')),
    ],
  }
}

// Tipo de sistema de iluminação (13) ← iluminacaoSistema.tipo do projeto
// (chaves de TIPOS_SISTEMA da norma do estado; a PB inclui a UPS).
const TIPO_ILUMINACAO = { bloco_autonomo: 'blocos', central: 'central_bateria', ups: 'ups', motogerador: 'gerador' }

// Atestos do item 13, por grupo — marcados pelo RT no box da PB da página de
// Iluminação da PB. Cada grupo de sistema (13.1–13.4) só
// aparece no box quando o tipo correspondente é o adotado no projeto.
const ATESTOS_ILUMINACAO = {
  geral: [
    ['ilu_autonomia_2h', 'Tempo de autonomia do sistema de 2 horas'],
    ['ilu_planos_3lux', 'Iluminamento nos locais planos a partir de 03 lux'],
    ['ilu_desnivel_5lux', 'Iluminamento nos locais com desnível a partir de 05 lux'],
    ['ilu_planos_aberta_1lux', 'Iluminamento nos locais planos em áreas de circulação aberta a partir de 01 lux'],
    ['ilu_desnivel_aberta_3lux', 'Iluminamento nos locais com desnível em áreas de circulação aberta a partir de 03 lux'],
    ['ilu_balizamento_f', 'Iluminação de balizamento em ambientes fechados com lotação superior a 100 pessoas (F-3, F-5, F-6, F-7, F-10 e F-11)'],
    ['ilu_tarefa_alto_risco', 'Iluminamento no plano de referência em áreas de tarefa de alto risco de no mínimo 10% do previsto em ABNT NBR ISSO/CIE 8995-1 e não inferior a 15 lux'],
    ['ilu_abaixo_teto', 'Luminárias estão instaladas 0,5 m abaixo do teto, ou abaixo dos pontos de exaustão da fumaça'],
    ['ilu_fumaca_15lux', 'Luminárias instaladas em áreas com possível acúmulo de fumaça possuem iluminância ≥ 15 lux'],
    ['ilu_central_protegida', 'Sistemas centralizados por baterias ou UPS, que possuem baterias ≥ 50 Ah, instalados em locais protegidos e ventilados com paredes com TRRF de 120 min e PCF P-90'],
    ['ilu_gmg_protegido', 'GMG em locais confinados protegido e ventilado com paredes com TRRF de 120 min e PCF P-90 sem risco de captação de fumaça oriunda de um incêndio'],
  ],
  circuitoBaterias: [
    ['ilu_cb_220v', 'O circuito de alimentação das baterias possui tensão nominal de 220V'],
    ['ilu_cb_quadro_geral', 'Circuitos de alimentação das baterias ligados diretamente ao quadro geral e protegidos por disjuntores termomagnéticos e DPS'],
    ['ilu_cb_aparente', 'Instalação aparente (caso exista) em metal fechado ou PVC rígido antichama, conforme ABNT NBR 15465'],
  ],
  circuitoLuminarias: [
    ['ilu_cl_30vcc', 'O circuito de alimentação das luminárias possui tensão nominal de 30Vcc'],
    ['ilu_cl_secao', 'Condutores com seções não inferiores a 1,5 mm²'],
    ['ilu_cl_paralelo', 'Todas as ligações são em paralelo (não são permitidas ligações em série)'],
    ['ilu_cl_antichama', 'Condutores e suas derivações são antichamas, suportando 70º C ou 100º C em áreas com material inflamável, conforme NBR 5410'],
    ['ilu_cl_aparente', 'Instalação aparente (caso exista) em metal fechado ou PVC rígido antichama, conforme ABNT NBR 15465'],
    ['ilu_cl_eletrodutos', 'Os eletrodutos dos condutores de 30 Vcc são de uso exclusivo da iluminação de emergência'],
    ['ilu_cl_corrente', 'Corrente elétrica de cada circuito ≤ 12 A e não alimenta mais que 20 luminárias'],
    ['ilu_cl_resistencia', 'O circuito primário resiste ao fogo por 3 horas e os secundários por 30 minutos'],
  ],
  luminarias: [
    ['ilu_lum_30vcc', 'Tensão de até 30Vcc'],
    ['ilu_lum_fluxo', 'Fluxo luminoso ≥ 300 lm e atende ao Anexo A e Tabela 1 da NBR'],
    ['ilu_lum_interruptor', 'Não contém interruptores manuais (só é permitido botão autorrearmável de teste)'],
    ['ilu_lum_70c', 'Material resiste a 70º C durante 1 hora de funcionamento e é anticorrosão'],
  ],
  blocos: [
    ['ilu_bl_comutacao', 'Tempo de comutação em bloco autônomo de, no máximo, 2 segundos'],
    ['ilu_bl_recarga', 'Recarga automática das baterias de chumbo-ácido ou níquel-cádmio em, no máximo, 24 horas'],
  ],
  central_bateria: [
    ['ilu_cen_comando', 'Possui central de comando, sistema de supervisão, carregados e baterias recarregáveis'],
    ['ilu_cen_comutacao', 'Tempo de comutação de, no máximo, 2 segundos'],
    ['ilu_cen_recarga', 'Recarga automática das baterias em, no máximo, 24 horas'],
    ['ilu_cen_local', 'Central instalada em local separado quando da utilização de baterias estacionárias'],
    ['ilu_cen_vida', 'Vida útil das baterias de, no mínimo, 4 horas'],
    ['ilu_cen_exaustao', 'Se instalada em ambiente fechado possui exaustão mecânica'],
    ['ilu_cen_aterramento', 'Estruturas metálicas aterradas, conforme NBR 5410'],
  ],
  ups: [
    ['ilu_ups_exclusiva', 'UPS exclusiva para a iluminação de emergência'],
    ['ilu_ups_transformador', 'Possui transformador isolador e aterramento conforme NBR 5410'],
  ],
  gerador: [
    ['ilu_gmg_exclusivo', 'GMG de uso exclusivo para iluminação de emergência ou para medidas de segurança contra incêndio'],
    ['ilu_gmg_arranque', 'Possui arranque automático ou, no máximo, 5 segundos após a queda de energia'],
    ['ilu_gmg_acesso', 'Possui acesso livre de obstáculos desde a área externa da edificação e sem a passagem por áreas onde exista material combustível'],
    ['ilu_gmg_paineis', 'Possui painéis de controle com indicador de quantidade de combustível, botão de arranque manual, supervisão de temperatura da água de resfriamento do motor, dispositivos de proteção contra sobrecarga elétrica'],
    ['ilu_gmg_compartimentados', 'Painéis de controle, baterias de arranque e instalações de armazenamento de combustível compartimentados entre si'],
    ['ilu_gmg_gases', 'Os gases de combustão são liberados para a área externa da edificação'],
    ['ilu_gmg_base', 'O Motogerador está apoiado em base com isoladores contra vibrações e conter dreno com filtro para absorver perda de óleo combustível ou líquidos lubrificantes'],
    ['ilu_gmg_tanques', 'Tanques de armazenamento de combustível com volume ≥ 200 litros estão montados dentro de bacias de contenção com dreno e filtro'],
    ['ilu_gmg_duto', 'No caso de tomada de ar por meio de duto, este possui TRRF de 120 min'],
    ['ilu_gmg_circuitos', 'Circuitos elétricos em conformidade com a NT 23 e NBR 5410'],
  ],
}

/** Tipos de sistema de iluminação adotados (chaves do formulário: blocos /
 *  central_bateria / ups / gerador) — a escolha da página (a mesma do MA):
 *  o sistema do projeto, ou o de cada estrutura quando não é o mesmo. */
export function tiposIluminacaoPB(state) {
  const tipos = state.iluminacaoMesmoSistema !== false
    ? [state.iluminacaoSistema?.tipo]
    : (state.estruturas || []).map(e => state.iluminacaoSistemaPorEstrutura?.[e.id]?.tipo)
  return new Set(tipos.map(t => TIPO_ILUMINACAO[t]).filter(Boolean))
}

// Para que tipo(s) de sistema cada parte do item 13 vale — sem isso, vale
// para todos. Os atestos gerais de local protegido da fonte também dependem
// do sistema (central/UPS ou GMG).
const ILUMINACAO_POR_TIPO = {
  ilu_central_protegida: ['central_bateria', 'ups'],
  ilu_gmg_protegido: ['gerador'],
  circuitoBaterias: ['blocos', 'central_bateria', 'ups'],
  circuitoLuminarias: ['central_bateria', 'ups', 'gerador'],
  blocos: ['blocos'],
  central_bateria: ['central_bateria'],
  ups: ['ups'],
  gerador: ['gerador'],
}
const valeParaTipos = (chave, tipos) => !ILUMINACAO_POR_TIPO[chave] || ILUMINACAO_POR_TIPO[chave].some(t => tipos.has(t))

/** Partes do item 13 que se aplicam aos tipos de sistema adotados (ver
 *  tiposIluminacaoPB), cada uma com só os atestos que valem para eles — a
 *  página da PB mostra uma caixa por parte. */
export function secoesIluminacaoPB(tipos) {
  const G = ATESTOS_ILUMINACAO
  return [
    ['geral', 'Gerais'],
    ['circuitoBaterias', 'Circuitos de alimentação das baterias'],
    ['circuitoLuminarias', 'Circuitos de alimentação das luminárias'],
    ['luminarias', 'Luminárias'],
    ['blocos', 'Conjunto de blocos autônomos'],
    ['central_bateria', 'Sistema centralizado por baterias recarregáveis'],
    ['ups', 'Sistema centralizado por UPS'],
    ['gerador', 'Sistema centralizado por grupo motogerador'],
  ]
    .filter(([chave]) => valeParaTipos(chave, tipos))
    .map(([chave, titulo]) => ({ chave, titulo, lista: G[chave].filter(([key]) => valeParaTipos(key, tipos)) }))
}

// Distância máxima entre pontos de luz: 4 × a altura de instalação (Anexo A
// da NBR 10898, como o próprio formulário indica).
export const distanciaMaximaPontosPB = altura => {
  const h = parseFloat(String(altura ?? '').replace(',', '.'))
  return h > 0 ? 4 * h : null
}

function secaoIluminacao(state, ctx) {
  const m = state.memorialPB || {}
  const at = m.atestos || {}
  const tipos = tiposIluminacaoPB(state)
  const ativo = !!ctx.sistemas?.iluminacao?.ativo
  // Só marca o que vale para o sistema adotado (o resto do modelo do CBMPB
  // continua impresso, em branco).
  const atestos = (lista, parte) => lista.map(([key, label]) =>
    ck({ x: ativo && valeParaTipos(parte, tipos) && valeParaTipos(key, tipos) && atestoMarcado(at, key), label }))
  const h = parseFloat(String(m.iluAlturaInstalacao ?? '').replace(',', '.'))
  const dist = distanciaMaximaPontosPB(m.iluAlturaInstalacao)
  // Fluxo exato: o informado pelo RT na página de Iluminação da PB.
  const fluxos = vazio(m.iluFluxo) ? '' : String(m.iluFluxo)
  const G = ATESTOS_ILUMINACAO
  const [fluxoKey, fluxoLabel] = G.luminarias[1]
  return {
    titulo: '13. ILUMINAÇÃO DE EMERGÊNCIA', nota: '(Informe ou Marque X nas características da iluminação, conforme NT 18/2024 e NBR ABNT 10898/2023)',
    linhas: [
      campo('Altura de instalação do ponto de luz em relação ao piso (metros):', ativo && h > 0 ? fmtM(h) : ''),
      campo('Distância máxima entre pontos de luz conforme Anexo A da NBR (4x altura de instalação):', ativo && dist ? fmtM(dist) : ''),
      ...atestos(G.geral),
      sub('Características dos circuitos de alimentação das baterias (Blocos autônomos, Central à bateria ou UPS):'),
      ...atestos(G.circuitoBaterias, 'circuitoBaterias'),
      sub('Características dos circuitos de alimentação das luminárias (Central à bateria, UPS ou GMG):'),
      ...atestos(G.circuitoLuminarias, 'circuitoLuminarias'),
      sub('Características das luminárias:'),
      ...atestos([G.luminarias[0]]),
      ck({ x: ativo && atestoMarcado(at, fluxoKey), label: `${fluxoLabel} (Fluxo exato: ${ativo && fluxos ? V(`${fluxos} lm`) : '______ lm'})` }),
      ...atestos(G.luminarias.slice(2)),
      sub('Tipo de sistema:'),
      ck(
        { x: ativo && tipos.has('blocos'), label: 'Blocos autônomos' },
        { x: ativo && tipos.has('central_bateria'), label: 'Central à bateria' },
        { x: ativo && tipos.has('ups'), label: 'Central por UPS' },
        { x: ativo && tipos.has('gerador'), label: 'Central por gerador' },
      ),
      sub('13.1 Conjunto de blocos autônomos', '(Informe as características do sistema, conforme NBR 10898/2023)'),
      ...atestos(G.blocos, 'blocos'),
      sub('13.2 Sistema centralizado por baterias recarregáveis', '(Informe as características do sistema, conforme NBR 10898/2023)'),
      ...atestos(G.central_bateria, 'central_bateria'),
      sub('13.3 Sistema centralizado por UPS (Uninterruptible Power Supply)', '(Informe as características do sistema, conforme NBR 10898/2023)'),
      ...atestos(G.ups, 'ups'),
      sub('13.4 Sistema centralizado por Grupo Motogerador', '(Informe as características do sistema, conforme NBR 10898/2023)'),
      ...atestos(G.gerador, 'gerador'),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'iluminacao')),
    ],
  }
}

const ATESTOS_ALARME = [
  ['alarme_acionador_30m', 'Distância máxima a percorrer até um acionador manual até 30m'],
  ['alarme_autonomia_24h', 'Autonomia sem alarme a partir de 24h'],
  ['alarme_autonomia_15min', 'Autonomia com todo sistema operando alarme a partir de 15min'],
  ['alarme_altura_acionadores', 'Altura de instalação dos acionadores entre 0,9m e 1,35m'],
  ['alarme_altura_avisadores', 'Altura de instalação dos avisadores áudio e visuais entre 2,2m e 3,5m'],
]

// 14.2 — tipos de detector do formulário e os campos de cada um, com o
// máximo impresso no próprio formulário do CBMPB. O RT informa o valor de
// projeto na página da Detecção (memorialPB.deteccao[tipo][campo]); sem
// valor, vale o máximo.
export const DETECTORES_PB = [
  { key: 'fumaca_pontual', label: 'Fumaça pontual', campos: [
    { key: 'raio', label: 'Raio de atuação', maximo: 6.3 },
    { key: 'altura', label: 'Altura de instalação', maximo: 8 },
  ] },
  { key: 'temperatura_pontual', label: 'Temperatura pontual', campos: [
    { key: 'raio', label: 'Raio de atuação', maximo: 4.2 },
    { key: 'altura', label: 'Altura de instalação', maximo: 5 },
  ] },
  { key: 'fumaca_linear', label: 'Fumaça linear', campos: [
    { key: 'distancia', label: 'Distanciamento entre detectores', maximo: 15 },
  ] },
]

/** Valor de projeto de um campo de detector: o informado (limitado ao
 *  máximo do formulário) ou o próprio máximo. */
export function valorDetectorPB(m, tipo, campoKey) {
  const def = DETECTORES_PB.find(d => d.key === tipo)?.campos.find(c => c.key === campoKey)
  if (!def) return null
  const n = parseFloat(String(m?.deteccao?.[tipo]?.[campoKey] ?? '').replace(',', '.'))
  return n > 0 ? Math.min(n, def.maximo) : def.maximo
}

function secaoAlarmeDeteccao(state, ctx) {
  const m = state.memorialPB || {}
  const at = m.atestos || {}
  const exigAlarme = exigibilidade(ctx, 'alarme')
  const exigDet = exigibilidade(ctx, 'deteccao')
  // Local da central (o mesmo para alarme e detecção) e tipos de detector:
  // informados nas páginas da PB.
  const localCentral = () => m.alarmeCentralLocal || ''

  // Valores de projeto dos detectores (página da Detecção), só para os
  // tipos de detector adotados.
  const tiposDet = new Set(m.detectoresTipos || [])
  const v = (tipo, campoKey) => (exigDet && tiposDet.has(tipo) ? fmtM(valorDetectorPB(m, tipo, campoKey)) : '')

  return {
    titulo: '14. SISTEMA DE ALARME E DETECÇÃO DE INCÊNDIO',
    linhas: [
      sub('14.1 Sistema de Alarme de Incêndio', '(Informe as características do sistema de alarme, conforme NT 19/2024)'),
      { tipo: 'exigivel', exigivel: exigAlarme },
      ...ATESTOS_ALARME.map(([key, label]) => ck({ x: atestoMarcado(at, key), label })),
      campo('Localização da central de alarme (cômodo):', exigAlarme ? localCentral() : ''),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'alarme')),
      sub('14.2 Sistema de Detecção de Incêndio', '(Informe as características do sistema de alarme, conforme NT 19/2024)'),
      { tipo: 'exigivel', exigivel: exigDet },
      campo('Localização da central do alarme:', exigDet ? localCentral() : ''),
      campo('Raio de atuação em detecção pontual de fumaça (máximo 6,3m):', v('fumaca_pontual', 'raio')),
      campo('Altura de instalação da detecção pontual de fumaça (máximo 8m):', v('fumaca_pontual', 'altura')),
      campo('Raio de atuação em detecção pontual de temperatura (máximo 4,2m):', v('temperatura_pontual', 'raio')),
      campo('Altura de instalação da detecção pontual de temperatura (máximo 5m):', v('temperatura_pontual', 'altura')),
      campo('Distanciamento entre detectores lineares (máximo 15m):', v('fumaca_linear', 'distancia')),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'deteccao')),
    ],
  }
}

const ATESTOS_SINALIZACAO = [
  ['sin_fotoluminescentes', 'Todas as sinalizações são fotoluminescentes'],
  ['sin_rotas', 'Todas as rotas de saída estão sinalizadas'],
  ['sin_mudancas_direcao', 'Todas as mudanças de direção nas rotas de fuga estão sinalizadas'],
  ['sin_equipamentos', 'Todos os equipamentos estão sinalizados'],
  ['sin_pavimentos', 'Todos os pavimentos estão sinalizados'],
  ['sin_tamanho_a1', 'O tamanho das placas segue a tabela A-1'],
  ['sin_placa_m1', 'Placa M-1'],
  ['sin_placa_m2', 'Placa M-2'],
  ['sin_mensagens', 'Todas as mensagens escritas foram sinalizadas'],
  ['sin_locais_risco', 'Todos os locais de risco possuem sinalização de alerta e proibição'],
  ['sin_complementar_nt16', 'Todo acesso, escada e descarga possuem sinalização complementar em ambos os lados (nos casos de adaptações pela NT CBMPB 16)'],
]

function secaoSinalizacao(state, ctx) {
  const at = state.memorialPB?.atestos || {}
  const ativo = !!ctx.sistemas?.sinalizacao?.ativo
  return {
    titulo: '15. SINALIZAÇÃO DE EMERGÊNCIA', nota: '(Informe ou Marque X nas características da sinalização, conforme NT CBMPB 06/2013)',
    linhas: [
      ...ATESTOS_SINALIZACAO.map(([key, label]) => ck({ x: ativo && atestoMarcado(at, key), label })),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'sinalizacao')),
    ],
  }
}

// 16 — nível de carga → capacidade extintora mínima e caminhamento (Tabelas
// 4 e 5 da NT 21/2024). Nível I, II e III (3A/40BC) saem sozinhos; o RT só
// marca se adotou 4A/80BC no nível III.
const RISCO_DO_NIVEL = { I: 'baixo', II: 'medio', III: 'alto' }

/** Resultado do item 16: nível de carga do projeto e a opção de capacidade
 *  (A e B, com a distância máxima a percorrer) adotada. */
export function resultadoExtintoresPB(state, ctx) {
  const F = getMemorialFormulario(state.uf)
  const nivel = F && ctx.cargaMaxima > 0 ? faixaDe(F.NIVEIS_CARGA, ctx.cargaMaxima)?.nivel : null
  if (!nivel) return null
  const escolha = nivel === 'III' && state.memorialPB?.extintorNivelIII === 'nivel_III_4A' ? 'nivel_III_4A' : null
  const opcao = opcaoCapacidade(getExtintores(state.uf), RISCO_DO_NIVEL[nivel], escolha)
  return { nivel, linha: escolha || F.EXTINTORES_NIVEL.find(l => l.nivel === nivel)?.key || null, opcao }
}

/** Linhas especiais do item 16 — marcáveis pelo RT; sem escolha, vale a
 *  sugestão automática (`auto`, pela ocupação/riscos do projeto). */
export function especiaisExtintoresPB(state, ctx) {
  const m = state.memorialPB || {}
  return [
    ['ext_posto', 'Postos de abastecimento com tanques enterrados, além dos extintores previstos, devem ser instalados dois extintores portáteis de pó químico (ABC ou BC) ou espuma mecânica, próximos ao setor de abastecimento.', ctx.divisoes.has('G-3')],
    ['ext_carga_descarga', 'As áreas de carga e descarga de líquidos inflamáveis devem possuir extintores sobrerrodas com capacidade mínima de 80-B, localizados a no máximo 22,5 m de distância do tanque', false],
    ['ext_glp_revenda', 'Quantidade de extintores para revenda e armazenamento de GLP conforme Tabela 6 NBR 15514', ctx.riscos.has('glp') && !!m.glpClasse],
    ['ext_central_glp', 'Quantidade de extintores para Central predial de GLP conforme tabela 9 NBR 13523', !!ctx.sistemas?.central_gas?.ativo],
    ['ext_fogos', 'Quantidade de extintores para revenda de fogos de artifício conforme NT CBMPB 01/2018', ctx.riscos.has('fogos_artificio')],
    ['ext_heliponto', 'Quantidade de extintores para helipontos e heliportos conforme item 5.4.4.5 NBR 12693', false],
    ['ext_tanques_superficie', 'Quantidade de extintores para tanques de combustível na superfície conforme tabela 1 NBR 12693', false],
  ].map(([key, label, auto]) => ({ key, label, auto }))
}

/** Linha especial marcada: a escolha do RT, ou a sugestão automática. */
export const especialMarcado = (atestos, e) => (e.key in (atestos || {}) ? !!atestos[e.key] : e.auto)

function secaoExtintores(state, F, ctx) {
  const at = state.memorialPB?.atestos || {}
  const ativo = !!ctx.sistemas?.extintores?.ativo
  const r = resultadoExtintoresPB(state, ctx)
  return {
    titulo: '16. EXTINTORES DE INCÊNDIO', nota: '(Marque X nas características dos extintores, conforme NT CBMPB 21/2024)',
    linhas: [
      ...F.EXTINTORES_NIVEL.map(l => ck({ x: ativo && l.key === r?.linha, label: l.texto, negrito: true, detalhe: l.detalhe })),
      ...especiaisExtintoresPB(state, ctx).map(e => ck({ x: ativo && especialMarcado(at, e), label: e.label })),
      obs('OBSERVAÇÕES LIVRES:', obsDe(state, 'extintores')),
    ],
  }
}

// 17 — tipos de sistema da NT 15/2016 PB (a key é o que o RT escolhe).
export const TIPOS_HIDRANTE_PB = [
  ['tipo1',    'Sistema TIPO 1 (esguicho regulável DN25, mangueira DN 25 com 30m, expedição simples, PRESSÃO e VAZÃO mínimas no ponto mais desfavorável de 100l/min e 80mca);'],
  ['tipo2',    'Sistema TIPO 2 (esguicho regulável DN40, mangueira DN 40 com 30m, expedição simples, PRESSÃO e VAZÃO mínimas no ponto mais desfavorável de 150l/min e 30mca);'],
  ['tipo3',    'Sistema TIPO 3 (esguicho regulável DN40, mangueira DN 40 com 30m, expedição simples, PRESSÃO e VAZÃO mínimas no ponto mais desfavorável de 200l/min e 40mca);'],
  ['tipo4_40', 'Sistema TIPO 4 (esguicho regulável DN40, mangueira DN 40 com 30m, expedição simples, PRESSÃO e VAZÃO mínimas no ponto mais desfavorável de 300l/min e 65mca);'],
  ['tipo4_65', 'Sistema TIPO 4 (esguicho regulável DN65, mangueira DN 65 com 30m, expedição simples, PRESSÃO e VAZÃO mínimas no ponto mais desfavorável de 300l/min e 30mca);'],
  ['tipo5',    'Sistema TIPO 5 (esguicho regulável DN65, mangueira DN 65 com 30m, expedição dupla, PRESSÃO e VAZÃO mínimas no ponto mais desfavorável de 600l/min e 60mca);'],
]
export const RESERVATORIOS_PB = [['elevado', 'Reservatório elevado'], ['enterrado', 'Reservatório enterrado'], ['manancial', 'Manancial'], ['semienterrado', 'Reservatório semi-enterrado']]
const LANCES_INTERNOS_PB = LANCES_INTERNOS
const LANCES_EXTERNOS_PB = LANCES_EXTERNOS
const MANGUEIRAS_PB = TIPOS_MANGUEIRA
const FAIXAS_CARGA_RTI = [['Até 300Mj/m²', 300], ['301 a 800Mj/m²', 800], ['801 a 1200Mj/m²', 1200], ['Acima de 1200Mj/m²', Infinity]]
const ATESTOS_HIDRANTES = {
  mangueiras: [
    ['hid_esguichos', 'Esguichos reguláveis adotado em todos os pontos de hidrantes'],
    ['hid_chave', 'Chave de mangueiras presente em todos os pontos de hidrantes'],
  ],
  bombas: [
    ['hid_desligamento_manual', 'Sistema possui desligamento apenas de forma manual, conforme item C.1.6'],
    ['hid_acionador_manual', 'Sistema possui acionador manual em local de fácil acesso e seguro, conforme item C.1.7'],
    ['hid_acionamento_auto', 'Sistema possui acionamento automático ao acionar qualquer ponto, conforme item C.1.8'],
    ['hid_independencia', 'Sistema possui independência elétrica, conforme item C.2.7'],
    ['hid_recalque_fachada', 'Sistema possui dispositivo de recalque do tipo coluna instalado na fachada ou dentro de um abrigo embutido no muro, conforme Item 4.2.2'],
    ['hid_recalque_passeio', 'Sistema possui dispositivo de recalque instalado no passeio público, com impossibilidade técnica comprovada por meio de laudo, conforme Item 4.2.2'],
    ['hid_dreno_c2', 'Sistema possui sistema de dreno, conforme Figura C.2 do anexo C, de acordo com exigência do item 5.11.6'],
    ['hid_drenos_ensaios', 'Sistema possui drenos, recursos para simulação e ensaios, escorvas e outros dispositivos dimensionados conforme a aplicação, de acordo com exigência do item 5.11.6'],
    ['hid_tubulacao_vermelha', 'Sistema possui tubulação aparente em cor vermelha, conforme item 5.11.6'],
    ['hid_aneis_vermelhos', 'Sistema pintado em outras cores e identificado com anéis vermelhos com 0,20 m de largura e dispostos, no máximo, a 3 m um do outro, exceto para edificações dos grupos G, I, J, L e M, conforme item 5.11.6'],
    ['hid_manometro', 'Sistema possui manômetro hidráulico (0 a 200 mca) a não mais de um metro da saída da válvula do hidrante considerado mais desfavorável hidraulicamente, conforme item 5.11.7'],
  ],
}

// Linhas do recalque (17.3): marcadas pelo tipo de dispositivo de recalque
// escolhido na página de hidrantes (state.hidrantes.recalqueTipo) — não
// aparecem no box da PB.
const RECALQUE_DO_TIPO = {
  hid_recalque_fachada: ['coluna_fachada', 'embutido_muro'],
  hid_recalque_passeio: ['passeio'],
}
/** Atestos de bombas e tubulação que o RT marca (sem os do recalque). */
export const ATESTOS_BOMBAS_MARCAVEIS = ATESTOS_HIDRANTES.bombas.filter(([key]) => !(key in RECALQUE_DO_TIPO))

// Diâmetros das tubulações (17.2): os dos trechos do dimensionamento do
// Revit (state.hidrantes.dimensionamento.res.j), agrupados por diâmetro.
// Todos iguais → só "DN65"; senão "DN80 (RTI → Bomba, Bomba → Ponto A);
// DN65 (Ponto A → HD01, Ponto A → HD02)".
const TRECHOS_HIDRANTE = [['t1', 'RTI → Bomba'], ['t2', 'Bomba → Ponto A'], ['t3', 'Ponto A → HD01'], ['t4', 'Ponto A → HD02']]
export function diametrosTubulacaoPB(dimensionamento) {
  const j = dimensionamento?.res?.j
  if (!j) return ''
  const porDiametro = new Map()
  TRECHOS_HIDRANTE.forEach(([id, rotulo]) => {
    ;(j[id]?.segmentos || []).forEach(seg => {
      const dn = Math.round(Number(seg.d_mm))
      if (!(dn > 0)) return
      if (!porDiametro.has(dn)) porDiametro.set(dn, [])
      if (!porDiametro.get(dn).includes(rotulo)) porDiametro.get(dn).push(rotulo)
    })
  })
  const grupos = [...porDiametro.entries()].sort((a, b) => b[0] - a[0])
  if (grupos.length <= 1) return grupos.length ? `DN${grupos[0][0]}` : ''
  return grupos.map(([dn, trechos]) => `DN${dn} (${trechos.join(', ')})`).join('; ')
}

// Tipo do formulário a partir do tipo/variante da página de hidrantes
// (Tipo 4: variante 0 = DN40, 1 = DN65).
const tipoFormularioHidrante = h => {
  const t = parseInt(h?.tipo, 10)
  if (!t) return ''
  if (t === 4) return Number(h.tipoVariante) === 1 ? 'tipo4_65' : 'tipo4_40'
  return `tipo${t}`
}
// Posição do reservatório da página → opção do formulário.
const RESERVATORIO_DA_POSICAO = { elevado: 'elevado', subterraneo: 'enterrado', semienterrado: 'semienterrado', manancial: 'manancial' }

function secaoHidrantes(state, ctx) {
  const m = state.memorialPB || {}
  const extra = m.hidrantes || {}              // só o que a página comum não tem
  const h = state.hidrantes || {}              // página de hidrantes (comum)
  const d = h.dimensionamento || null          // dimensionamento hidráulico
  const at = m.atestos || {}
  const exigivel = exigibilidade(ctx, 'hidrantes')
  const ativo = !!ctx.sistemas?.hidrantes?.ativo
  const fmt = (v, casas = 2) => (v == null || v === '' ? null : fmtNum(v, casas, String(v)))
  const v = valor => (ativo && !vazio(valor) ? String(valor) : '')
  const tipo = tipoFormularioHidrante(h)
  const vazao = fmt(d?.dados_sistema?.q_min)
  const pressao = fmt(d?.res?.P_valv_ref)
  const vp = key => (ativo && tipo === key
    ? `Vazão exata do hidrante mais desfavorável: ${vazao ? V(`${vazao} l/min`) : '______ l/min'}. Pressão exata: ${pressao ? V(`${pressao} mca`) : '______ mca'}.`
    : 'Vazão exata do hidrante mais desfavorável: ______ l/min. Pressão exata: ______ mca.')
  const um = (lista, valor) => ck(...lista.map(([key, label]) => ({ x: ativo && valor === key, label })))
  const carga = ctx.cargaMaxima > 0 ? FAIXAS_CARGA_RTI.find(([, max]) => ctx.cargaMaxima <= max)?.[0] : null
  // Mangueiras: esguicho regulável e chave de mangueiras saem dos componentes
  // do tipo de sistema (Tabela 4 — "Abrigos e Mangueiras" da página).
  const comp = getHidrantes(state.uf)?.COMPONENTES_POR_TIPO?.[h.tipo] || null
  const DOS_COMPONENTES = { hid_esguichos: !!comp, hid_chave: !!comp?.chaveEngate }
  const marcado = key => (key in RECALQUE_DO_TIPO ? RECALQUE_DO_TIPO[key].includes(h.recalqueTipo)
    : key in DOS_COMPONENTES ? DOS_COMPONENTES[key]
    : atestoMarcado(at, key))
  const atestos = lista => lista.map(([key, label]) => ck({ x: ativo && marcado(key), label }))
  // Posição do reservatório da página (a da PB inclui o manancial).
  const reservatorio = RESERVATORIO_DA_POSICAO[h.reservatorioPosicao] || (extra.manancial ? 'manancial' : '')
  const alturaBomba = h.bombaExiste && d?.res?.P_RTI != null ? fmt(d.res.P_RTI) : null
  return {
    titulo: '17. SISTEMA DE HIDRANTES E MANGOTINHOS (Conforme NT 15/2016)',
    linhas: [
      { tipo: 'exigivel', exigivel },
      ...TIPOS_HIDRANTE_PB.map(([key, label]) => ck({ x: ativo && tipo === key, label: `${label}\n${vp(key)}` })),
      sub('17.1 Reserva Técnica de Incêndio - RTI', '(Informe e/ou marque X nas características da RTI, conforme tabela 3 da NT CBMPB 15)'),
      campo('Classificação da edificação conforme item 3.1 deste memorial:', ativo ? [...ctx.divisoes].join(', ') : ''),
      { tipo: 'texto', centro: true, negrito: true, texto: 'Carga incêndio' },
      ck(...FAIXAS_CARGA_RTI.map(([label]) => ({ x: ativo && carga === label, label }))),
      um(RESERVATORIOS_PB, reservatorio),
      campo('Em casos de reservatórios enterrados informar o valor da NSTH:', reservatorio === 'enterrado' ? v(extra.nsth) : ''),
      campo('Material de construção da RTI:', v(h.reservatorioMaterial)),
      campo('Area construída da edificação:', ativo && state.areaConstruidaTotal ? fmtM2(state.areaConstruidaTotal) : ''),
      campo('RTI em m³:', v(h.rti)),
      sub('17.2 Mangueiras e tubulações', '(Informe e/ou marque X nas características da RTI, conforme NT CBMPB 15)'),
      campo('Diâmetro das tubulações:', v(diametrosTubulacaoPB(d))),
      campo('Material das tubulações:', v(h.redeMaterial)),
      ...atestos(ATESTOS_HIDRANTES.mangueiras),
      { tipo: 'texto', centro: true, negrito: true, texto: 'Quantidade de lances de mangueira (hidrantes internos)' },
      um(LANCES_INTERNOS_PB, h.lancesInternos || extra.lancesInternos),
      { tipo: 'texto', centro: true, negrito: true, texto: 'Quantidade de lances de mangueira (hidrantes externos)' },
      um(LANCES_EXTERNOS_PB, h.lancesExternos || extra.lancesExternos),   // 'nao_aplica' não marca nada
      { tipo: 'texto', centro: true, negrito: true, texto: 'Tipo de mangueira (NBR ABNT 11861)' },
      um(MANGUEIRAS_PB, comp ? tipoMangueiraValido(h.mangueiraTipo || extra.mangueira, comp.mangueiraIncendio) : (h.mangueiraTipo || extra.mangueira)),
      sub('17.3 Bombas de incêndio e casa de bombas', '(Informe e/ou marque X nas características da RTI, conforme NT CBMPB 15)'),
      campo('Pressão da bomba principal (mca) de incêndio:', ativo && alturaBomba ? alturaBomba : ''),
      campo('Pressão da bomba reserva (mca) para risco médio e alto:', ativo && h.bombaReserva && alturaBomba ? alturaBomba : ''),
      campo('Vazão da bomba jockey (l/min) em sistema com mais de 6 pontos de hidrante:', ativo && h.bombaJockey ? v(h.bombaJockeyVazao) : ''),
      ...atestos(ATESTOS_HIDRANTES.bombas),
    ],
  }
}

function secaoChuveiros(ctx) {
  return {
    titulo: '18. CHUVEIROS AUTOMÁTICOS – SPK - NT CBMPB 38 e ABNT NBR 10897-2020', nota: '(Informe e/ou marque X nas características do SPK)',
    linhas: [
      { tipo: 'exigivel', exigivel: exigibilidade(ctx, 'sprinklers') },
      ...linhasCheck([
        'A classificação de risco: da edificação está conforme a Tabela A.1 e/ou A.2 do Anexo A. da ABNT NBR 10897',
        'Em edificações de risco leve, as tubulações de CPVC são utilizadas apenas com pressão máxima não superior a 1,21 MPa e temperaturas até 65 °C (permitido somente nessas condições).',
        'Em edificações térreas, o sistema possui dispositivo de teste e alarme por gongo e/ou chave de fluxo, conforme o item 5.7.1. da ABNT NBR 10897',
        'Em edificações de múltiplos pavimentos, o sistema possui dispositivo de dreno, ensaio e alarme conforme Figura 3 e item 5.7.2. da ABNT NBR 10897',
        'O sistema possui dispositivo de recalque, conforme o item 5.8.3. da ABNT NBR 10897',
        'Quando houver alimentação comum para hidrantes e chuveiros automáticos, o hidrante de fachada é compartilhado, conforme item 5.8.4 (permitido somente nessas condições) da ABNT NBR 10897',
        'A quantidade de colunas de alimentação está conforme a área máxima definida na Tabela 8 da ABNT NBR 10897',
        'A área máxima de cobertura e o distanciamento entre chuveiros automáticos atendem às Tabelas 10, 11, 12, 13 e 14 da ABNT NBR 10897',
        'Há chuveiros automáticos instalados sobre todas as escadas, exceto as enclausuradas, conforme o item 7.12.3. da ABNT NBR 10897',
        'O sistema por tubos secos é utilizado apenas em modificações, reformas, ampliações ou sistemas novos com área máxima de 465 m² (permitido somente nessas condições).',
        'A reserva de água está conforme as Tabelas 23 e 24.da ABNT NBR 10897',
        'A pressão mínima do sistema não é inferior a 4,8 mca, conforme o item 9.4.4.10. da ABNT NBR 10897',
        'O abastecimento por piscinas, rios, mananciais e similares atende ao item B.1.3 da ABNT NBR 10897.',
        'Quando conjugado ao sistema de hidrantes, foram adicionados os critérios de RTI conforme o item 8.5.1.1. da ABNT NBR 10897',
      ]),
      sub('18.1 Risco da edificação', '(Informe e/ou marque X nas características do SPK)'),
      ck(c('leve'), c('Ordinário I'), c('Ordinário II'), c('Extraordinário I'), c('Extraordinário II')),
      sub('18.2 Área de operação/ aplicação', '(Informe e/ou marque X nas características do SPK)'),
      ck(c('Método de tabela (até 465m²)'), c('Método do cálculo hidráulico')),
      ...['Fator K:', 'Densidade (L/min/m²):', 'Área de operação/ aplicação m²:', 'Área de cobertura/proteção Max por chuveiro m²:', 'Distância entre os chuveiros', 'Desnível (m):', 'Demanda L/ min:', 'Duração (min) :', 'Pressão do chuveiro automático:']
        .map(l => campo(l)),
      campos({ label: 'Bomba hidráulica:' }, { label: 'Vazão :' }, { label: 'Pressão :' }, { label: 'Potência:' }),
      campo('RTI (m³):'),
      campos({ label: 'Bomba jockey:' }, { label: 'Vazão :' }, { label: 'Pressão :' }, { label: 'Potência:' }),
    ],
  }
}

function secaoSpda(ctx) {
  // O app não tem regra de exigência pro SPDA (depende da análise de risco
  // da NBR 5419): só marca "exigível" quando o RT o adotou.
  const exigivel = ctx.sistemas?.spda?.ativo ? true : null
  return {
    titulo: '19. SISTEMA DE PROTEÇÃO CONTRA DESCARGAS ATMOSFÉRICAS', nota: '(Informe e/ou marque X nas características do SPDA, conforme NBR ABNT 5419)',
    linhas: [
      { tipo: 'exigivel', exigivel, rotuloNao: 'NÃO EXIGÍVEL (conforme análise de risco anexa)' },
      ...['Tipo de sistema:', 'Nível de proteção:', 'Altura de instalação do captor:', 'Angulo de proteção (método Franklin):', 'Raio da esfera rolante (m) no método eletro geométrico:', 'Afastamento máximo dos condutores das malhas (m):', 'Material dos condutores:', 'Seção mínima (mm²) de Captores e descidas em estrutura superior a 20m:', 'Seção mínima (mm²) das descidas em estrutura inferior a 20m:', 'Seção mínima (mm²) do eletrodo de aterramento de cobre (mínimo 50mm²):', 'Seção mínima (mm²) do eletrodo de aterramento de aço ou embutido (mínimo 80mm²):']
        .map(l => campo(l)),
      { tipo: 'texto', centro: true, negrito: true, texto: 'Seção mínima dos condutores de ligação equipotencial' },
      ck(c('Cobre (16mm²)'), c('Alumínio (25mm²)'), c('Aço (50mm²)')),
      obs('OBSERVAÇÕES LIVRES:'),
    ],
  }
}

function secaoIsolamento() {
  const dados = 'DADOS:\nSeveridade:\nPorcentagem de abertura:\nRelação largura/altura:\nCoeficiente de segurança (β):'
  return {
    titulo: '20. Separação entre edificação (isolamento de risco) Conforme a NT 20/2023',
    linhas: [
      campos({ label: 'Edificação 1', centro: true }, { label: 'Edificação 2', centro: true }),
      campos({ label: dados, alto: true }, { label: dados, alto: true }),
      campo('Distância Mínima para isolamento entre as edificações:'),
      campo('Redutores de distância de separação:'),
      obs('Dimensionamento da separação (apresentação do cálculo detalhado:'),
    ],
  }
}

// ── Montagem ───────────────────────────────────────────────────────────────

/**
 * Contexto comum às seções. `sistemas`/`porEstrutura` vêm de
 * useMedidasObrigatorias (mesma fonte do memorial do MA e do Anexo B).
 */
export function contextoFormularioPB(state, sistemas, porEstrutura) {
  const divisoes = new Set((porEstrutura || []).flatMap(pe => pe.divisoes || []))
  const riscos = new Set(Object.values(state.riscosEspeciaisPorEstrutura || {})
    .flatMap(m => Object.entries(m || {}).filter(([, v]) => v).map(([k]) => k)))
  return {
    sistemas: sistemas || {},
    porEstrutura: porEstrutura || [],
    divisoes,
    riscos,
    cargaMaxima: cargaMaximaDoProjeto(state),
    temClassificacao: divisoes.size > 0,
    temTabelaExigencias: !!getMedidas(state.uf),
  }
}

/**
 * Seções do formulário, na ordem do modelo do CBMPB. null quando o estado
 * do projeto não usa memorial em formulário (ver getMemorialFormulario).
 */
export function buildFormularioPB(state, sistemas, porEstrutura) {
  const F = getMemorialFormulario(state.uf)
  if (!F) return null
  const ctx = contextoFormularioPB(state, sistemas, porEstrutura)
  return {
    norma: F.NORMA,
    temTabelaExigencias: ctx.temTabelaExigencias,
    secoes: semMarcasNaoExigiveis([
      secaoIdentificacao(state),
      secaoFormaApresentacao(state, F),
      secaoParametros(state, F, ctx),
      secaoMedidas(ctx),
      secaoRiscos(state, ctx),
      secaoAcessoViatura(state, F, ctx),
      secaoSegEstrutural(state, ctx),
      secaoCompartimentacao(state, ctx),
      secaoCmar(state, F, ctx),
      secaoSaidas(state, ctx),
      secaoGerenciamento(state, F, ctx),
      secaoBrigada(state, ctx),
      secaoIluminacao(state, ctx),
      secaoAlarmeDeteccao(state, ctx),
      secaoSinalizacao(state, ctx),
      secaoExtintores(state, F, ctx),
      secaoHidrantes(state, ctx),
      secaoChuveiros(ctx),
      secaoSpda(ctx),
      secaoIsolamento(),
    ]),
  }
}

// Sistema "NÃO EXIGÍVEL": nada marcado nos campos internos dele — da linha
// de exigibilidade até o próximo subtítulo (ou o fim da seção).
export function semMarcasNaoExigiveis(secoes) {
  return secoes.map(secao => {
    let bloqueado = false
    const linhas = secao.linhas.map(l => {
      if (l.tipo === 'sub') bloqueado = false
      if (l.tipo === 'exigivel') bloqueado = l.exigivel === false
      if (!bloqueado) return l
      if (l.tipo === 'checkValor') return { ...l, x: false, valor: '' }
      if (!l.itens) return l
      return { ...l, itens: l.itens.map(i => ({ ...i, x: false })) }
    })
    return { ...secao, linhas }
  })
}

// Chaves de state.memorialPB.atestos usadas acima, com o rótulo — o painel
// de complementos (MemorialPBPage.jsx) lista estas, na mesma redação do
// formulário.
export const ATESTOS_PB = {
  saidas: ATESTOS_SAIDAS,
  brigada: ATESTOS_BRIGADA,
  alarme: ATESTOS_ALARME,
  iluminacao: ATESTOS_ILUMINACAO,
  sinalizacao: ATESTOS_SINALIZACAO,
  hidrantes: ATESTOS_HIDRANTES,
}
