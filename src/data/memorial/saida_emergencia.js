// memorial/saida_emergencia.js — texto do memorial descritivo pro sistema
// de Saída de Emergência (NT 14 CBMMA / NBR 9077). Estrutura definida pelo
// usuário a partir de um modelo .docx (Generalidades padrão + parametrizada
// pelas larguras mínimas da norma; uma tabela de distância máxima a
// percorrer por estrutura; por pavimento, um organograma da árvore de
// Acessos e Descargas, uma tabela única com todos os ambientes do
// pavimento, e uma tabela individual pra cada Saída/Circulação). Mesmo
// motor de cálculo (se_calc.js) que alimenta pages/medidas/
// FluxogramaSaidas.jsx — nunca duplica a lógica aqui, só narra o
// resultado.
//
// Diferente dos builders mais antigos (extintores.js, seg_estrutural.js),
// precisa saber chuveiros automáticos/detecção de incêndio POR ESTRUTURA
// pra resolver a distância máxima a percorrer (getDistancia) — por isso
// recebe `porEstrutura` (useMedidasObrigatorias().porEstrutura), não só o
// `sistemas` agregado do projeto que os outros builders usam.

import { getSE } from '../normas/index'
import {
  contarSaidasPavimento, raizesDoPavimento, getDistancia, calcPopPav,
  calcDimsAcesso, dimsDoAcesso, calcNoAmbientePT, tipoEscadaEstrutura, ARQUIBANCADA_TAXA,
} from '../se_calc'
import { fmtNum } from '../../utils/numero'
import { blocoObservacao } from '../../utils/observacoes'

const fmt  = n => fmtNum(n, 2, '0')
const fmtM = n => `${fmt(n)} m`
const fmtEnxuto = fmt
const num2 = n => String(n).padStart(2, '0')

function acessosFilhos(acessos, parentId) {
  return acessos.filter(a => a.alimentaEm === parentId)
}
function ambientesDe(ambientes, acessoId) {
  return ambientes.filter(a => a.acessoId === acessoId)
}

// ── Generalidades — mesmo texto pra qualquer projeto, só as larguras
// mínimas (parágrafo de fluxo + tabela de portas) vêm da norma do estado. ──
function fmtLarguraPorta(m) {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${fmtEnxuto(m)} m`
}

function blocosGeneralidades(larguras) {
  const { AD, ER, PT } = larguras
  const textoFluxo = AD === ER
    ? `devem ser de ${fmtM(AD)}`
    : `devem ser de ${fmtM(AD)} para acessos e descargas, e de ${fmtM(ER)} para escadas e rampas`

  const letras = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const bulletsPortas = (PT || []).map((linha, i) => {
    const folhas = linha.tipo && linha.tipo !== '1 folha' ? `, em ${linha.tipo}` : ''
    const unidade = linha.n_up === 1 ? 'unidade' : 'unidades'
    return `${letras[i] || i + 1}) ${fmtLarguraPorta(linha.largura)}${folhas}, valendo por ${linha.n_up} ${unidade} de passagem;`
  })

  return [
    { tipo: 'titulo2', texto: 'Generalidades' },
    { tipo: 'titulo2', texto: 'Acessos' },
    { tipo: 'paragrafo', texto: 'Os acessos devem satisfazer às seguintes condições:' },
    { tipo: 'lista', estilo: 'lettered', itens: [
      'a) permitir o escoamento fácil de todos os ocupantes da edificação;',
      'b) permanecer desobstruídos em todos os pavimentos;',
      'c) ter larguras conforme o estabelecido na NT;',
      'd) ter pé-direito mínimo de 2,30 m, com exceção de obstáculos representados por vigas, vergas de portas e outros, cuja altura mínima livre deve ser de 2,10 m;',
      'e) ser sinalizados e iluminados (iluminação de emergência) com indicação clara do sentido da saída.',
    ]},
    { tipo: 'paragrafo', texto: 'Os acessos devem permanecer livres de quaisquer obstáculos, tais como móveis, divisórias, locais para exposição de mercadorias e outros, de forma permanente, mesmo quando a edificação esteja, supostamente, fora de uso.' },
    { tipo: 'titulo2', texto: 'Larguras Mínimas a Serem Adotadas' },
    { tipo: 'paragrafo', texto: `As larguras mínimas das saídas de emergência para acessos, escadas, rampas ou descargas ${textoFluxo}.` },
    { tipo: 'paragrafo', texto: 'A largura das portas, comuns ou corta-fogo, utilizadas nas rotas de saídas de emergência, devem ter as seguintes dimensões mínimas de vão livre:' },
    { tipo: 'lista', estilo: 'lettered', itens: bulletsPortas },
    { tipo: 'campo', label: 'Notas', valor: '1) Porta com dimensão maior que 1,2 m deve ter duas folhas;\n2) Porta com dimensão maior ou igual a 2,2 m exige coluna central.' },
    { tipo: 'titulo2', texto: 'Distâncias Máximas a Percorrer' },
    { tipo: 'paragrafo', texto: 'As distâncias máximas a serem percorridas para atingir as portas de acesso às saídas das edificações e o acesso às escadas ou às portas das escadas (nos pavimentos) constam nas tabelas abaixo e devem ser consideradas a partir da porta de acesso da unidade autônoma mais distante, desde que o seu caminhamento interno não ultrapasse 10 m.' },
    { tipo: 'titulo2', texto: 'Dimensionamento das Saídas de Emergência' },
  ]
}

// ── Árvore do pavimento — uma travessia só produz o organograma (formato
// colchete: raiz/Circulação em negrito, ambientes com o próprio nome
// embaixo) e a lista de ambientes/nós usada nas tabelas, garantindo que
// organograma e tabelas sempre casam. Raiz mantém o próprio nome (Saída
// NN/Escada-Rampa NN, já numerado pelo site); nó não-raiz vira
// "CIRCULAÇÃO NN" — o nome que o usuário deu no site (Acesso 1, Acesso
// 2...) é só um rótulo de trabalho, o memorial usa uma numeração própria e
// contínua por pavimento. Ambiente usa o próprio nome sem numeração
// extra — muitos já vêm numerados pelo Revit ("02 - Sala", ver
// populacao.set_occupancy no plugin); prefixar de novo aqui duplicava o
// número ("01 - 02 - Sala").
function montarArvorePavimento(pav) {
  const acessos = pav.acessos || []
  const ambientes = pav.ambientes || []
  const raizes = raizesDoPavimento(acessos)

  let nCirculacao = 0
  const listaAmbientes = [] // [{ amb }] em ordem de aparição
  const nos = []            // [{ acesso, label }] em ordem — raízes + Circulações

  function visitar(acesso, isRaiz) {
    const label = isRaiz ? String(acesso.nome).toUpperCase() : `CIRCULAÇÃO ${num2(++nCirculacao)}`
    nos.push({ acesso, label })

    const subAmbientes = ambientesDe(ambientes, acesso.id).map(amb => {
      listaAmbientes.push({ amb })
      return { texto: amb.nome, bold: false }
    })
    const subAcessos = acessosFilhos(acessos, acesso.id).map(a => visitar(a, false))

    return { texto: label, bold: true, sub: [...subAmbientes, ...subAcessos] }
  }

  const organograma = raizes.map(r => visitar(r, true))

  // Ambiente ainda sem acesso atribuído não tem nó pra pendurar no
  // organograma, mas continua entrando na tabela única de portas — não
  // faz sentido escondê-lo da tabela só por ainda não ter posição na
  // fluxo (ver FluxogramaSaidas.jsx).
  ambientes.filter(a => !a.acessoId).forEach(amb => listaAmbientes.push({ amb }))

  return { organograma, listaAmbientes, nos }
}

// Texto da taxa populacional aplicada a um ambiente — só faz sentido pra
// popTipo 'area' (a taxa vem da divisão, ver TAXA_POPULACIONAL); 'manual'
// ('População estimada', vale pra toda ocupação) e 'fixo' usam um valor informado direto, sem taxa por área.
function taxaPopulacionalTexto(amb, taxaPopulacional) {
  let base
  if (amb.popTipo === 'fixo') base = 'Assentos informados'
  else if (amb.popTipo === 'manual') base = 'População estimada (informada pelo responsável técnico)'
  else base = taxaPopulacional[amb.divisao]?.obs || '—'
  if (amb.arquibancada && amb.divisao === 'F-3') return `${base}; arquibancada: ${ARQUIBANCADA_TAXA.obs}`
  return base
}

// Medida que entra no cálculo da população do ambiente: com assentos fixos a
// área não conta — vale a quantidade de assentos ("64 p"); nos demais, a área.
function medidaTexto(amb) {
  const base = amb.popTipo === 'fixo' ? `${fmt(parseInt(amb.assentos) || 0)} p`
    : amb.popTipo === 'manual' ? `${fmt(parseInt(amb.popManual) || 0)} p`
    : `${fmt(amb.area || 0)} m²`
  if (amb.arquibancada && amb.divisao === 'F-3') return `${base} + ${fmt(parseFloat(amb.arquibancadaComprimento) || 0)} m linear (arquibancada)`
  return base
}

// ── Tabela única com todos os ambientes do pavimento (largura de porta) ──
function tabelaAmbientes(listaAmbientes, taxaPopulacional, larguras) {
  return {
    tipo: 'tabela',
    centralizado: true,
    linhasCabecalho: [
      [{ texto: 'POPULAÇÃO E PORTAS DOS AMBIENTES', colSpan: 8 }],
      [{ texto: 'AMBIENTES' }, { texto: 'DIVISÃO' }, { texto: 'TAXA POPULACIONAL' }, { texto: 'MEDIDA' }, { texto: 'POP.' }, { texto: 'CUP' }, { texto: 'UP' }, { texto: 'L. MÍN (m)' }],
    ],
    linhas: listaAmbientes.map(({ amb }) => {
      const { pop, capPT, pt } = calcNoAmbientePT(amb, taxaPopulacional, larguras)
      return [
        amb.nome,
        amb.divisao || '—',
        taxaPopulacionalTexto(amb, taxaPopulacional),
        medidaTexto(amb),
        pop, capPT, pt.n, fmt(pt.la),
      ]
    }),
  }
}

// Ambiente que não foi ligado a nenhum acesso/saída da árvore não é
// pendência: é tratado como ambiente com acesso direto à área de relativa
// segurança (não passa por corredor/escada a dimensionar), e a largura da
// sua própria porta continua calculada na tabela de ambientes.
function notaAcessoDireto(pav) {
  const diretos = (pav.ambientes || []).filter(a => !a.acessoId)
  if (diretos.length === 0) return null
  const nomes = diretos.map(a => a.nome)
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  const plural = diretos.length > 1
  return {
    tipo: 'paragrafo',
    texto: `${plural ? 'Os ambientes' : 'O ambiente'} ${lista} ${plural ? 'possuem portas' : 'possui porta'} em comunicação direta com a área externa livre de relativa segurança, dispensando acessos, escadas ou corredores de saída. A largura ${plural ? 'dessas portas está dimensionada' : 'dessa porta está dimensionada'} na tabela de população e portas dos ambientes.`,
  }
}

// ── Tabela individual de um nó (Saída/Escada-Rampa raiz, ou Circulação) —
// uma linha por dimensionamento LIGADO no nó (AD/ER/PT, ver acesso.dims em
// FluxogramaSaidas.jsx) — um nó pode ter mais de um ao mesmo tempo
// (ex.: piso de descarga que é corredor de saída E chegada de escada). ──
function tabelaNo({ acesso, label }, ambientes, acessos, taxaPopulacional, larguras, pisoDescarga) {
  const dims = dimsDoAcesso(acesso, pisoDescarga)
  const { pop, cap, ad, er, pt } = calcDimsAcesso(acesso.id, ambientes, acessos, taxaPopulacional, larguras, dims)
  const linhas = [
    ad && ['ACESSO/DESCARGA', pop, cap.AD, ad.n, fmt(ad.la)],
    er && ['ESCADAS/RAMPAS', pop, cap.ER, er.n, fmt(er.la)],
    pt && ['PORTAS', pop, cap.PT, pt.n, fmt(pt.la)],
  ].filter(Boolean)
  return {
    tipo: 'tabela',
    centralizado: true,
    linhasCabecalho: [
      [{ texto: label, colSpan: 5 }],
      [{ texto: 'ELEMENTOS' }, { texto: 'POPULAÇÃO' }, { texto: 'CAPACIDADE' }, { texto: 'UP' }, { texto: 'LARGURA MÍNIMA (m)' }],
    ],
    linhas,
  }
}

function blocosDoPavimento(pav, seNorma, temChuveiros, temDeteccao) {
  const { TAXA_POPULACIONAL, LARGURAS_MINIMAS, DISTANCIAS_MAXIMAS } = seNorma
  const acessos = pav.acessos || []
  const ambientes = pav.ambientes || []
  const raizes = raizesDoPavimento(acessos)
  const rotuloRaiz = pav.pisoDescarga ? 'saída' : 'escada/rampa'

  const blocos = [{ tipo: 'titulo2', texto: pav.pisoDescarga ? `${pav.label} (Piso de Descarga)` : pav.label }]

  if (!pav.divisao) {
    blocos.push({ tipo: 'paragrafo', texto: `Ocupação de ${pav.label} ainda não classificada (Etapa de Classificação) — dimensionamento pendente.` })
    return blocos
  }
  if (raizes.length === 0) {
    const soAcessoDireto = ambientes.length > 0 && ambientes.every(a => !a.acessoId)
    blocos.push({ tipo: 'paragrafo', texto: soAcessoDireto
      ? `Nenhuma ${rotuloRaiz} cadastrada em ${pav.label}: todos os ambientes possuem acesso direto à área de relativa segurança.`
      : `Nenhuma ${rotuloRaiz} cadastrada em ${pav.label} até o momento — árvore de acessos e descargas pendente.` })
    // Sem saída/escada não há árvore pra organograma nem larguras mínimas
    // a calcular, mas os ambientes já cadastrados no pavimento (com sua
    // população e largura de porta) não dependem disso — seguem exibidos.
    const { listaAmbientes } = montarArvorePavimento(pav)
    if (listaAmbientes.length > 0) {
      blocos.push(tabelaAmbientes(listaAmbientes, TAXA_POPULACIONAL, LARGURAS_MINIMAS))
      const nota = notaAcessoDireto(pav)
      if (nota) blocos.push(nota)
    }
    return blocos
  }

  // Resumo do pavimento — a tabela de distância máxima da estrutura (ver
  // blocosDaEstrutura) já traz as duas referências (saída única/mais de
  // uma saída); aqui só aponta qual das duas se aplica de fato, junto com
  // a quantidade de saídas e a população total já calculadas pra esse
  // pavimento específico.
  const nSaidas = Math.max(1, contarSaidasPavimento(acessos))
  const dist = getDistancia(pav.divisao, !!pav.pisoDescarga, nSaidas, temChuveiros, temDeteccao, DISTANCIAS_MAXIMAS)
  const popTotal = calcPopPav(pav, TAXA_POPULACIONAL)
  blocos.push({
    tipo: 'lista',
    itens: [
      `Distância máxima a percorrer: ${dist != null ? fmtM(dist) : 'consultar NT (combinação não tabelada)'}`,
      `Quantidade de saídas/escadas/rampas: ${nSaidas}`,
      `População Total Calculada: ${popTotal} pessoas`,
    ],
  })

  const { organograma, listaAmbientes, nos } = montarArvorePavimento(pav)

  blocos.push({ tipo: 'titulo2', texto: 'Fluxograma' })
  blocos.push({ tipo: 'organograma', nos: organograma })

  blocos.push({ tipo: 'titulo2', texto: 'Larguras Mínimas' })
  nos.forEach(no => {
    blocos.push(tabelaNo(no, ambientes, acessos, TAXA_POPULACIONAL, LARGURAS_MINIMAS, !!pav.pisoDescarga))
  })
  if (listaAmbientes.length > 0) {
    blocos.push(tabelaAmbientes(listaAmbientes, TAXA_POPULACIONAL, LARGURAS_MINIMAS))
    const nota = notaAcessoDireto(pav)
    if (nota) blocos.push(nota)
  }

  return blocos
}

function blocosDaEstrutura(est, pavs, seNorma, temChuveiros, temDeteccao) {
  const { DISTANCIAS_MAXIMAS } = seNorma
  const divisoes = [...new Set(pavs.map(p => p.divisao).filter(Boolean))]

  const blocos = [{ tipo: 'titulo2', texto: est.nome || 'Estrutura' }]

  if (divisoes.length > 0) {
    blocos.push({
      tipo: 'tabela',
      centralizado: true,
      linhasCabecalho: [
        [{ texto: 'DISTÂNCIAS MÁXIMA A PERCORRER', colSpan: 4 }],
        [
          { texto: 'DIVISÃO', rowSpan: 3 },
          { texto: 'ANDAR', rowSpan: 3 },
          { texto: `${temChuveiros ? 'COM' : 'SEM'} CHUVEIROS AUTOMÁTICOS`, colSpan: 2 },
        ],
        [{ texto: `${temDeteccao ? 'COM' : 'SEM'} DETECÇÃO DE INCÊNDIO`, colSpan: 2 }],
        [{ texto: 'SAÍDA ÚNICA' }, { texto: 'MAIS DE UMA SAÍDA' }],
      ],
      linhas: divisoes.flatMap(divisao => [
        [
          { texto: divisao, rowSpan: 2 },
          'Piso de descarga',
          fmtDistOuConsultar(getDistancia(divisao, true, 1, temChuveiros, temDeteccao, DISTANCIAS_MAXIMAS)),
          fmtDistOuConsultar(getDistancia(divisao, true, 2, temChuveiros, temDeteccao, DISTANCIAS_MAXIMAS)),
        ],
        [
          null,
          'Demais andares',
          fmtDistOuConsultar(getDistancia(divisao, false, 1, temChuveiros, temDeteccao, DISTANCIAS_MAXIMAS)),
          fmtDistOuConsultar(getDistancia(divisao, false, 2, temChuveiros, temDeteccao, DISTANCIAS_MAXIMAS)),
        ],
      ]),
    })
  }

  const escada = tipoEscadaEstrutura(est, pavs.map(p => p.divisao), seNorma.TIPOS_ESCADA)
  if (escada?.status === 'ok') {
    const t = seNorma.TIPOS_ESCADA.tipos[escada.exigido]
    const tipoTexto = escada.exigido === '+' || escada.exigido === '-' ? t.nome : `${escada.exigido} — ${t.nome}`
    blocos.push({
      tipo: 'paragrafo',
      texto: `Tipo de escada de emergência (Anexo C, Tabela 3): ${tipoTexto}, para altura piso a piso de ${fmt(parseFloat(est.alturaPisoPiso) || 0)} m (${escada.faixa.label}) e ocupação ${escada.porDivisao.map(p => p.divisao).join(', ')}.${escada.consultar && escada.exigido !== '+' ? ' Além do tipo indicado, consultar normas e regulamentos específicos.' : ''}`,
    })
  }

  // Antes dos pavimentos: o título de cada pavimento é do mesmo nível do da
  // estrutura, e a observação ficaria parecendo do último pavimento.
  blocos.push(...blocoObservacao(est, 'saida_emergencia'))
  blocos.push(...pavs.flatMap(pav => blocosDoPavimento(pav, seNorma, temChuveiros, temDeteccao)))
  return blocos
}

function fmtDistOuConsultar(valor) {
  return valor != null ? fmtM(valor) : 'Consultar NT'
}

// `opcoes.soDimensionamento`: só os blocos de cada estrutura, sem as
// generalidades (acessos, larguras mínimas, distâncias) — Anexo A da PB.
export function textoMemorialSaidaEmergencia(state, sistemas, porEstrutura, opcoes = {}) {
  const seNorma = getSE(state.uf)
  const sistemasPorEst = Object.fromEntries((porEstrutura || []).map(pe => [pe.estrutura.id, pe.sistemas]))

  const blocosEstruturas = (state.estruturas || []).flatMap(est => {
    const pavs = (state.pavimentos || []).filter(p => p.estruturaId === est.id)
    if (pavs.length === 0) return []
    const temChuveiros = !!sistemasPorEst[est.id]?.sprinklers?.ativo
    const temDeteccao  = !!sistemasPorEst[est.id]?.deteccao?.ativo
    return blocosDaEstrutura(est, pavs, seNorma, temChuveiros, temDeteccao)
  })

  const blocos = [
    ...(opcoes.soDimensionamento ? [] : blocosGeneralidades(seNorma.LARGURAS_MINIMAS)),
    ...(blocosEstruturas.length > 0
      ? blocosEstruturas
      : [{ tipo: 'paragrafo', texto: 'Nenhum pavimento cadastrado — dimensionamento de saída de emergência pendente.' }]),
  ]

  return { titulo: 'Saída de Emergência', blocos }
}
