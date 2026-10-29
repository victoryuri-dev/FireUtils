// memorial/hidrantesCalculo.js — memorial de cálculo (marcha hidráulica) do
// Sistema de Hidrantes/Mangotinhos, migrado do plugin Revit (antigo botão
// "Memorial de Cálculo", Fire Utils.tab/lib/hidrantes/memorial.py) pro
// site. Não recalcula nada: só narra o resultado que o plugin já calculou
// ("Dimensionar Hidrantes"), importado em state.hidrantes.dimensionamento
// (ver pages/medidas/HidrantesPage.jsx) — mesmo payload sincronizado (JSON
// cru de hidrantes/calc.py:calcular_rede + companhia), sem transformar
// nenhum campo. Sempre a ÚLTIMA folha do memorial (ver
// memorial/registry.js:buildMemorial), depois de toda a parte descritiva.
//
// O dimensionamento da bomba de incêndio (eficiência/potência) é a única
// parte de conteúdo NOVA — o plugin parou de calcular isso (ver
// hidrantes_calc.js:calcPotenciaBomba, mesma fórmula); as demais seções
// são a tradução do memorial.py pro vocabulário de blocos do memorial
// (ver documentos/MemorialDescritivoPage.jsx:BlocoMedida).
//
// Sem fração/sobrescrito/subscrito renderizados de verdade (o resto do
// memorial descritivo também não faz isso) — fórmulas em notação simples
// (ex.: "Q^1,85"), como texto monoespaçado destacado (bloco 'formula').

import { getHidrantes } from '../normas/index'
import { calcPotenciaBomba } from '../hidrantes_calc'
import { fmtNum } from '../../utils/numero'

// Constantes só de narração (nunca recalculadas aqui) — mesmos valores de
// Fire Utils.tab/lib/hidrantes/calc.py.
const MCA_POR_BAR = 10.1971
const F_DARCY = 0.022
const G = 9.81
const K_VALVULA = 5.0
const COEF_JM = 8.0
const COMPRIMENTO_MIN_VERIF_VELOCIDADE_M = 0.20

const SIM_OK = '✓'
const SIM_X = '✗'
const SIM_GE = '≥'

// Formato numérico oficial (utils/numero.js). A marcha hidráulica mantém até
// 4 casas nos passos de cálculo (vazões em m³/s, perdas unitárias...), onde 2
// casas zerariam o valor — mesmo formato, só com mais precisão.
const f = (n, casas = 4) => fmtNum(n, casas, '0')
const fDh = (dh) => (dh >= 0 ? `+ ${f(Math.abs(dh))}` : `− ${f(Math.abs(dh))}`)
const mca2 = (v) => `${f(v, 2)} mca`

function contadorLetras() {
  const letras = 'abcdefghijklmnopqrstuvwxyz'
  let i = 0
  return () => letras[i++]
}

export function textoMemorialCalculoHidrantes(state) {
  const norma = getHidrantes(state.uf)
  const d = state.hidrantes?.dimensionamento
  const titulo = 'Memorial de Cálculo — Sistema de Hidrantes'

  if (!d) {
    return {
      titulo,
      blocos: [{
        tipo: 'paragrafo',
        texto: 'Dimensionamento hidráulico ainda não importado do plugin Revit — pendente de preenchimento pelo responsável técnico.',
      }],
    }
  }

  const blocos = []
  const paragrafo = (texto) => blocos.push({ tipo: 'paragrafo', texto })
  const titulo3 = (texto) => blocos.push({ tipo: 'titulo3', texto })
  const lista = (itens) => blocos.push({ tipo: 'lista', itens })
  const tabela = (colunas, linhas, opts = {}) => blocos.push({
    tipo: 'tabela', colunas, linhas, titulo: opts.titulo,
    alinhas: opts.alinhas || ['left', ...Array(colunas.length - 1).fill('right')],
  })
  // Equação em destaque + bloco "Onde: símbolo — descrição" opcional, tudo
  // no mesmo bloco 'formula' (quebras de linha via whitespace-pre-line) —
  // mesmo agrupamento visual da _formula()/_formula_onde() do memorial.py.
  const formula = (expr, definicoes) => {
    let texto = expr
    if (definicoes?.length) {
      texto += `\n\nOnde:\n${definicoes.map(([s, desc]) => `${s}: ${desc}`).join('\n')}`
    }
    blocos.push({ tipo: 'formula', texto })
  }

  // Este memorial numera os proprios topicos (1., 1.1, a)...) porque os
  // titulo3 abaixo referenciam esse numero ("7.1 Trecho HD01 ao Ponto A") —
  // `semNumero` avisa o renderer pra nao prefixar a numeracao do documento
  // por cima (ver BlocoMedida em MemorialDescritivoPage.jsx).
  let nSec = 0
  const sec = (t) => {
    nSec += 1
    blocos.push({ tipo: 'titulo2', texto: `${nSec}. ${t}`, semNumero: true })
    return nSec
  }

  const { res, dados_sistema: ds, cotas, succao, verif_succao, verif_npshd, erro_npshd,
          j_succao_npsh, C_HW, metodo, valor_sistema, timestamp } = d
  const esguicho = res.esguicho
  const K = res.K
  const dH = res.dH
  const j = res.j
  const jInicial = res.j_inicial
  const esg = res.esg
  const equilibrio = res.equilibrio
  const toleranciaEquilibrio = equilibrio.tolerancia

  const Qs = ds.q_min
  const Pmin = ds.p_min

  const vMaxTubo = norma.V_MAX_TUBULACAO
  const vMaxSuccao = succao === 'positiva' ? norma.V_MAX_SUCCAO_POSITIVA : norma.V_MAX_SUCCAO_NEGATIVA
  const hidrSimult = norma.HIDRANTES_SIMULTANEOS
  const pontoRef = esguicho ? 'ponta do esguicho' : 'válvula do hidrante'

  // ── Cabeçalho ────────────────────────────────────────────────────────
  paragrafo(`Sistema: ${valor_sistema}  |  Método: ${metodo}  |  Norma: ${norma.NORMA.nome}${timestamp ? `  |  ${timestamp}` : ''}`)

  // ── 1. Definição da Vazão e Pressão de Projeto ──────────────────────
  sec('Definição da Vazão e da Pressão de Projeto')
  tabela(['Parâmetro', 'Valor'], [
    ['Norma aplicada', norma.NORMA.nome],
    ['Classificação do sistema', valor_sistema],
    ['Método de cálculo', metodo],
    ['Ponto de aplicação de Q e Pmin', pontoRef],
    ['Vazão por hidrante (Q)', `${f(Qs, 2)} L/min`],
    ['Hidrantes simultâneos (n)', `${hidrSimult}`],
    ['Pressão residual mínima (Pmin)', `${f(Pmin, 2)} mca = ${f(Pmin / MCA_POR_BAR)} bar`],
    ['Coef. Hazen-Williams (C)', `${C_HW}`],
    ['Esguicho — DN', `${ds.esguicho_dn} mm`],
    ['Mangueira — DN / comprimento', `${ds.mang_dn} mm / ${f(ds.mang_comp, 1)} m`],
    ['Velocidade máx. — recalque/descarga', `${f(vMaxTubo, 1)} m/s`],
    [`Velocidade máx. — sucção (${succao})`, `${f(vMaxSuccao, 1)} m/s`],
  ], { alinhas: ['left', 'left'] })

  // ── 2. Hidrantes mais desfavoráveis ──────────────────────────────────
  sec('Identificação dos Hidrantes Mais Desfavoráveis em Funcionamento Simultâneo')
  paragrafo(`O cenário de cálculo representa a condição mais crítica de operação do sistema: os ${hidrSimult} hidrantes mais desfavoráveis em funcionamento simultâneo, ou seja, aquela que resulta na maior demanda de vazão total associada às maiores perdas de carga e ao maior desnível geométrico.`)

  const ranking = d.ranking_hidrantes
  if (ranking?.length) {
    paragrafo(`Para identificar quais são de fato os hidrantes mais desfavoráveis, todas as válvulas de hidrante encontradas na rede de recalque são ranqueadas por uma pontuação preliminar — calculada com a vazão simples (vazão nominal de um único hidrante, Q = ${f(Qs, 2)} L/min, sem o equilíbrio hidráulico entre ramais que só se aplica aos dois hidrantes finalmente escolhidos, adiante neste memorial):`)
    formula('Perda de Carga Total = J + ∆Z', [
      ['J', 'Perda de carga do trecho Bomba → válvula do hidrante, por Hazen-Williams, com a vazão simples de um hidrante'],
      ['∆Z', 'Desnível geométrico entre a válvula do hidrante e a descarga da bomba'],
    ])
    paragrafo('Os dois hidrantes de maior Perda de Carga Total (HD01 e HD02, na tabela abaixo) são os mais desfavoráveis e recebem a marcha de cálculo completa, com equilíbrio hidráulico, no restante deste memorial:')
    tabela(['Hidrante', 'J (mca)', '∆Z (m)', 'Perda de Carga Total (mca)'],
      ranking.map((h) => [h.id, f(h.J), f(h.dZ), f(h.score)]))
  }

  // ── 3. Identificação dos trechos ─────────────────────────────────────
  sec('Identificação dos Trechos')
  paragrafo('Para fins de organização e como facilitador de cálculo, a tubulação é dividida em trechos. O Ponto A é o ponto de distribuição onde há a separação das vazões que vão rumo aos hidrantes desfavoráveis considerados.')
  lista(['RTI → Bomba', 'Bomba → Ponto A', 'Ponto A → HD01', 'Ponto A → HD02'])

  // ── Cotas altimétricas ────────────────────────────────────────────────
  sec('Cotas Altimétricas')
  tabela(['Ponto', 'Cota H (m)'], [
    ['RTI (reservatório)', f(cotas.z_rti)],
    ['Sucção (entrada da bomba)', f(cotas.z_succao)],
    ['Descarga da bomba', f(cotas.z_recalque)],
    ['Ponto A (distribuição)', f(cotas.z_ponto_a)],
    ['HD01 (mais desfavorável)', f(cotas.z_hd01)],
    ['HD02 (2º mais desfavorável)', f(cotas.z_hd02)],
  ])
  paragrafo('∆H = Hi − Hf (posição dos pontos inicial e final de cada trecho, na direção da marcha de cálculo):')
  tabela(['Trecho', 'Hi (m)', 'Hf (m)', '∆H (m)'], [
    ['HD01 ao Ponto A', f(cotas.z_hd01), f(cotas.z_ponto_a), f(dH.t3)],
    ['HD02 ao Ponto A', f(cotas.z_hd02), f(cotas.z_ponto_a), f(dH.t4)],
    ['Ponto A à descarga da bomba', f(cotas.z_ponto_a), f(cotas.z_recalque), f(dH.t2)],
    ['Sucção (Bomba à RTI)', f(cotas.z_succao), f(cotas.z_rti), f(dH.t1)],
  ])

  // ── Condição de sucção (diferença direta de cotas) ───────────────────
  sec('Verificação da Condição de Sucção')
  paragrafo('A condição de sucção é dada pela comparação direta entre a cota da RTI e a cota de sucção da bomba, já apresentadas em "Cotas Altimétricas":')
  formula('∆H_succao = cota_RTI − cota_succao', [
    ['cota_RTI', 'Cota da RTI (reservatório)'],
    ['cota_succao', 'Cota de sucção da bomba'],
  ])
  paragrafo(`∆H_succao = ${f(verif_succao.cota_rti)} − ${f(verif_succao.cota_succao_bomba)} = ${f(verif_succao.dH)} m`)
  paragrafo('Verificação:')
  paragrafo(verif_succao.justificativa)
  paragrafo(`${verif_succao.condicao === 'NEGATIVA' ? SIM_X : SIM_OK} Condição de sucção adotada: ${verif_succao.condicao}`)

  // ── NPSH disponível (só quando a sucção é negativa) ──────────────────
  if (verif_succao.exige_npsh) {
    sec('NPSH Disponível na Sucção')
    const fator = verif_succao.fator_vazao_npsh
    paragrafo(`A sucção resultou NEGATIVA, o que exige verificar o NPSH disponível (${norma.NPSHD_REF}) — a energia que a instalação realmente oferece à bomba na sucção.`)
    formula('NPSHd = Ha − Hvp + Hs − Hf_s', [
      ['NPSHd', 'NPSH disponível na tubulação de sucção'],
      ['Ha', "Pressão atmosférica local, em altura de coluna d'água"],
      ['Hvp', 'Pressão de vapor da água na temperatura de operação'],
      ['Hs', 'Altura estática de sucção — positiva com a bomba afogada, negativa quando a sucção da bomba está acima da RTI'],
      ['Hf_s', 'Perda de carga na tubulação de sucção, com a vazão majorada'],
    ])
    paragrafo('Com a sucção da bomba acima da cota da RTI, Hs é negativo e a fórmula operacional fica:')
    formula('NPSHd = Ha − Hvp − |Hs| − Hf_s')

    if (erro_npshd) {
      paragrafo(`${SIM_X} Não foi possível calcular o NPSHd: ${erro_npshd}`)
    } else if (verif_npshd) {
      const n = verif_npshd
      paragrafo(`|Hs| = cota de sucção da bomba − cota da RTI = ${f(verif_succao.cota_succao_bomba)} − ${f(verif_succao.cota_rti)} = ${f(n.Hs_abs)} m`)
      paragrafo(`Perda de carga na sucção (Hf_s) — mesmo Hazen-Williams do resto do memorial, mas com a vazão majorada em ${f(fator, 2)}×, majoração exclusiva desta verificação:`)
      formula(`Q_npsh = ${f(fator, 2)} · Qt = ${f(fator, 2)} · ${f(verif_succao.vazao_npsh_lmin / fator, 2)} = ${f(verif_succao.vazao_npsh_lmin, 2)} L/min`)
      if (j_succao_npsh) {
        tabela(['DN (mm)', 'Ltotal (m)', 'Jun (m/m)', 'J (mca)'],
          j_succao_npsh.segmentos.map((s) => [f(s.d_mm, 1), f(s.Ltotal), f(s.Jun, 6), f(s.J)]))
        paragrafo(`Hf_s = ${f(j_succao_npsh.J)} mca (C = ${C_HW})`)
      }
      paragrafo('Resultado:')
      tabela(['Termo', 'Valor'], [
        [`Ha — altitude ${f(n.altitude_m, 2)} m`, `${f(n.Ha, 3)} mca`],
        [`Hvp — água a ${f(n.temperatura_c, 2)} °C`, `${f(n.Hvp, 3)} mca`],
        ['|Hs| — sucção da bomba acima da RTI', `${f(n.Hs_abs, 3)} mca`],
        ['Hf_s — perda na sucção com a vazão majorada', `${f(n.Hf_s, 3)} mca`],
        ['NPSHd', `${f(n.NPSHd, 3)} mca`],
      ])
      paragrafo(`NPSHd = ${f(n.Ha, 3)} − ${f(n.Hvp, 3)} − ${f(n.Hs_abs, 3)} − ${f(n.Hf_s, 3)} = ${f(n.NPSHd, 3)} mca`)
    }
  }

  // ── Roteiro de cálculo ────────────────────────────────────────────────
  sec('Roteiro de Cálculo')
  paragrafo('Cada trecho listado adiante é calculado na seguinte sequência:')
  paragrafo('A marcha de cada ramal segue o sentido do escoamento, do ponto mais desfavorável (esguicho) até o Ponto A: esguicho → mangueira → válvula → canalização → Ponto A.')

  const pRefDesc = esguicho
    ? 'pressão na válvula do hidrante (P_valv), quando o método referencia Q e Pmin no esguicho'
    : 'pressão mínima exigida em projeto (Pmin), já que o método referencia Q e Pmin diretamente na válvula'

  let prox = contadorLetras()

  if (esguicho) {
    paragrafo('Como o par normativo (Q, Pmin) está referido à ponta do esguicho, a marcha começa por ele: a perda de carga no esguicho é a própria pressão mínima exigida em projeto (Pmin), e a pressão sobe até a válvula somando as perdas da mangueira e da válvula angular.')

    titulo3(`${prox()}) Perda de carga na mangueira`)
    formula(`Jm = ${COEF_JM}·f·Lm / (g·π²·Dm⁵) · Q²   [mca]`, [
      ['Jm', 'Perda de carga na mangueira (Darcy-Weisbach)'],
      ['f', `Fator de atrito = ${f(F_DARCY)}`],
      ['Lm', 'Comprimento da mangueira, em m'],
      ['g', `Aceleração da gravidade = ${f(G)} m/s²`],
      ['Dm', 'Diâmetro da mangueira, em m'],
      ['Q', 'Vazão individual do hidrante'],
    ])
    titulo3(`${prox()}) Velocidade do fluido na mangueira`)
    formula('V = 21,22 · Q / Dm²   [m/s]', [['V', 'Velocidade do fluido na mangueira']])
    titulo3(`${prox()}) Perda de carga na válvula angular do hidrante`)
    formula('Jvalv = K · V² / 2g   [mca]', [
      ['Jvalv', 'Perda de carga na válvula angular do hidrante'],
      ['K', `Fator K da válvula, adotado = ${f(K_VALVULA, 2)}`],
    ])
    titulo3(`${prox()}) Pressão na válvula do hidrante`)
    formula('P_valv = Pmin + Jm + Jvalv', [
      ['P_valv', 'Pressão na válvula do hidrante, soma das perdas entre o esguicho e a válvula'],
    ])
  }

  titulo3(`${prox()}) Comprimento total da tubulação, somado por diâmetro`)
  formula('Ltotal = L + Leq', [
    ['L', 'Comprimento real da tubulação'],
    ['Leq', 'Comprimento equivalente das conexões e acessórios do trecho'],
  ])
  titulo3(`${prox()}) Perda de carga, por Hazen-Williams, também por diâmetro`)
  formula('Jun = 605·10⁴ · Q^1,85 · C^−1,85 · D^−4,87   [m/m]', [
    ['Jun', 'Perda de carga unitária'],
    ['Q', 'Vazão no trecho, em L/min'],
    ['C', `Coeficiente de rugosidade, adimensional — ${C_HW}`],
    ['D', 'Diâmetro nominal (DN) da tubulação, em mm'],
  ])
  formula('J = Ltotal · Jun   [mca]', [['J', 'Perda de carga do trecho — soma dos diâmetros']])

  titulo3(`${prox()}) Velocidade de escoamento, verificada contra o limite do trecho`)
  formula('V = 21,22 · Q / D²   [m/s]', [
    ['V', 'Velocidade de escoamento'],
    ['Limite', `${f(vMaxTubo, 1)} m/s no recalque/descarga; ${f(vMaxSuccao, 1)} m/s na sucção ${succao}`],
  ])

  titulo3(`${prox()}) Fator K, calculado somente no 1º hidrante mais desfavorável, a partir do par normativo`)
  formula('K = Q / √P', [
    ['K', 'Fator de vazão (coeficiente de escoamento) do hidrante'],
    ['Q', 'Vazão normativa do hidrante mais desfavorável, em L/min'],
    ['P', `${pRefDesc}, em bar (1 bar = ${f(MCA_POR_BAR)} mca)`],
  ])
  paragrafo('Esse K, uma vez calculado, é reaproveitado para achar a vazão dos demais hidrantes: Q = K·√P.')

  titulo3(`${prox()}) Pressão no Ponto A, por ramal — os dois calculados inicialmente com a mesma vazão normativa Qs`)
  formula('P_PA = P_ref + J ± ∆H', [
    ['P_PA', 'Pressão necessária no Ponto A pelo ramal'],
    ['P_ref', 'Pressão de referência do hidrante — Pmin ou P_valv, conforme o método'],
    ['J', 'Perda de carga do ramal (hidrante → Ponto A)'],
    ['∆H', 'Desnível geométrico do trecho (Hi − Hf)'],
  ])
  paragrafo('A maior pressão entre os dois ramais vira a pressão-alvo do Ponto A, e o ramal dela é o ramal governante — ele não muda mais: por construção, já está com a vazão normativa Qs e a pressão de referência P_ref.')

  titulo3(`${prox()}) Equilíbrio hidráulico do ramal mais favorável`)
  paragrafo(`Uma diferença de pressão entre os ramais, calculados os dois com a mesma vazão, é normal — reflete a diferença de resistência hidráulica entre os caminhos (comprimento, diâmetro, conexões, desnível), não um erro de projeto. O Ponto A só tem uma pressão física, então o ramal mais favorável precisa convergir até sua P_A bater com a pressão-alvo, dentro da variação máxima de pressão admitida pela norma (${norma.TOLERANCIA_EQUILIBRIO_MCA_REF}):`)
  formula('P_ref = P_PA,alvo − J − ∆H', [['P_ref', 'Pressão de referência recalculada do ramal mais favorável']])
  formula('Q = K · √P_ref', [['Q', 'Vazão recalculada a cada iteração, a partir da nova pressão de referência']])
  formula('Erro = |P_A − P_PA,alvo|', [['P_A', 'Pressão no Ponto A recalculada com a nova vazão (P_ref + J + ∆H)']])
  paragrafo(`Repete até Erro ≤ variação máxima admitida pela norma (${f(toleranciaEquilibrio, 2)} mca). Só então soma-se a vazão dos dois ramais:`)
  formula('Qt = Q_hd01 + Q_hd02')

  titulo3(`${prox()}) Marcha de pressões até a bomba e a RTI, agora com a vazão total Qt`)
  formula('P = P_anterior + J ± ∆H', [
    ['P', 'Pressão no ponto seguinte — aplicada do Ponto A até a saída da bomba, e da saída da bomba até a RTI (passando pela sucção)'],
  ])

  // ── Cálculo trecho a trecho (marcha) ─────────────────────────────────
  const n7 = sec('Cálculo Trecho a Trecho')

  const passoLtotal = (jt, letra) => {
    titulo3(`${letra}) Comprimento total da tubulação`)
    formula('Ltotal = L + Leq')
    const linhasAces = jt.segmentos.flatMap((s) => s.acessorios.map((a) => [a.nome, f(s.d_mm, 1), `${a.qtd}`, f(a.leq_unit), f(a.leq_tot)]))
    if (linhasAces.length) {
      tabela(['Conexão / acessório', 'DN (mm)', 'Qtd', 'Leq unitário (m)', 'Leq total (m)'], linhasAces, { titulo: 'Conexões e acessórios por diâmetro' })
    } else {
      paragrafo('Nenhuma conexão com comprimento equivalente cadastrado neste trecho.')
    }
    tabela(['DN (mm)', 'L (m)', 'Leq (m)', 'Ltotal (m)'],
      jt.segmentos.map((s) => [f(s.d_mm, 1), f(s.L), f(s.Leq), f(s.Ltotal)]),
      { titulo: 'Comprimento total por diâmetro' })
  }

  const passoPerda = (jt, cHw, letra) => {
    titulo3(`${letra}) Perda de carga (Hazen-Williams)`)
    formula('Jun = 605·10⁴ · Q^1,85 · C^−1,85 · D^−4,87   [m/m]')
    formula('J = Ltotal · Jun   [mca]')
    paragrafo(`Com Q = ${f(jt.Q_lmin, 2)} L/min e C = ${cHw}.`)
    tabela(['DN (mm)', 'Ltotal (m)', 'Jun (m/m)', 'J (mca)'],
      jt.segmentos.map((s) => [f(s.d_mm, 1), f(s.Ltotal), f(s.Jun, 6), f(s.J)]))
    paragrafo(`J do trecho (soma dos diâmetros) = ${f(jt.J)} mca`)
  }

  const passoVelocidade = (jt, vLimite, letra, comprimentoMin) => {
    titulo3(`${letra}) Velocidade de escoamento`)
    formula('V = 21,22 · Q / D²   [m/s]')
    let temCurto = false
    const linhas = jt.segmentos.map((s) => {
      let verificacao
      if (comprimentoMin != null && s.L < comprimentoMin) {
        temCurto = true
        verificacao = '— não verificado'
      } else {
        verificacao = s.V <= vLimite ? `${SIM_OK} atende` : `${SIM_X} NÃO atende`
      }
      return [f(s.d_mm, 1), f(jt.Q_lmin, 2), f(s.V, 3), f(vLimite, 1), verificacao]
    })
    tabela(['DN (mm)', 'Q (L/min)', 'V (m/s)', 'Limite (m/s)', 'Verificação'], linhas,
      { alinhas: ['right', 'right', 'right', 'right', 'left'] })
    if (temCurto) {
      paragrafo(`Sub-trecho(s) com menos de ${f(comprimentoMin * 100, 0)} cm de tubo (ex.: redução na entrada/saída da bomba) não entram na verificação de velocidade — comprimento curto demais para representar escoamento sustentado.`)
    }
  }

  // --- 8.1 Trecho HD01 ---------------------------------------------------
  titulo3(`${n7}.1 Trecho HD01 ao Ponto A`)
  paragrafo(`Ramal do 1º hidrante mais desfavorável, calculado com a vazão normativa Q = ${f(Qs, 2)} L/min. A marcha segue o sentido do escoamento: esguicho → mangueira → válvula → canalização → Ponto A.`)
  prox = contadorLetras()
  const P_ref = res.P_valv_ref
  const P_ref_lbl = esguicho ? 'P_valv' : 'Pmin'

  if (esguicho) {
    const ref = esg.ref
    paragrafo(`A perda de carga no esguicho é a própria pressão mínima exigida em projeto (Pmin = ${f(Pmin, 2)} mca), aplicada na ponta do esguicho. Da ponta até a válvula somam-se a perda na mangueira e a perda na válvula angular.`)
    titulo3(`${prox()}) Perda de carga na mangueira`)
    formula(`Jm = ${COEF_JM}·f·Lm / (g·π²·Dm⁵) · Q²   [mca]`)
    tabela(['Lm (m)', 'Dm (mm)', 'Q (L/min)', 'Jm (mca)'], [[f(esg.mang_comp_m, 0), f(esg.mang_dn_mm, 0), f(Qs, 2), f(ref.Jm)]])
    titulo3(`${prox()}) Velocidade do fluido na mangueira`)
    formula('V = 21,22 · Q / Dm²   [m/s]')
    tabela(['Dm (mm)', 'Q (L/min)', 'V (m/s)'], [[f(esg.mang_dn_mm, 0), f(Qs, 2), f(ref.V)]])
    titulo3(`${prox()}) Perda de carga na válvula angular do hidrante`)
    formula('Jvalv = K · V² / 2g   [mca]')
    tabela(['K', 'V (m/s)', 'Jvalv (mca)'], [[f(K_VALVULA, 0), f(ref.V), f(ref.Jvalv)]])
    titulo3(`${prox()}) Pressão na válvula do hidrante`)
    formula('P_valv = Pmin + Jm + Jvalv')
    paragrafo(`P_valv = ${f(Pmin, 2)} + ${f(ref.Jm)} + ${f(ref.Jvalv)} = ${f(P_ref)} mca`)
  }

  passoLtotal(jInicial.t3, prox())
  passoPerda(jInicial.t3, C_HW, prox())
  passoVelocidade(jInicial.t3, vMaxTubo, prox())

  titulo3(`${prox()}) Fator K — calculado aqui, no 1º hidrante mais desfavorável, e reaproveitado nos demais trechos`)
  formula('K = Q / √P')
  paragrafo(`K = ${f(Qs, 0)} / √(${f(P_ref)} / ${f(MCA_POR_BAR)}) = ${f(Qs, 0)} / √${f(P_ref / MCA_POR_BAR)} = ${f(K)} L/min/bar^0,5`)

  titulo3(`${prox()}) Pressão necessária no Ponto A pelo ramal do HD01, ainda com a vazão normativa Qs`)
  formula(`P_PA = ${P_ref_lbl} + J ± ∆H`)
  tabela([`${P_ref_lbl} (mca)`, 'J (mca)', '∆H (m)', 'P_PA (mca)'],
    [[f(P_ref), f(jInicial.t3.J), fDh(dH.t3), f(res.P_PA1)]])

  // --- 8.2 Trecho HD02 -----------------------------------------------------
  titulo3(`${n7}.2 Trecho HD02 ao Ponto A`)
  paragrafo(`Ramal do 2º hidrante mais desfavorável — primeiro cálculo, ainda com a mesma vazão normativa Qs = ${f(Qs, 2)} L/min dos dois ramais, antes de qualquer equilíbrio.`)
  prox = contadorLetras()
  passoLtotal(jInicial.t4, prox())
  passoPerda(jInicial.t4, C_HW, prox())
  passoVelocidade(jInicial.t4, vMaxTubo, prox())
  titulo3(`${prox()}) Pressão necessária no Ponto A pelo ramal do HD02, ainda com a vazão normativa Qs`)
  formula(`P_PA = ${P_ref_lbl} + J ± ∆H`)
  tabela([`${P_ref_lbl} (mca)`, 'J (mca)', '∆H (m)', 'P_PA (mca)'],
    [[f(P_ref), f(jInicial.t4.J), fDh(dH.t4), f(res.P_PA2)]])

  // --- 8.3 Ponto A e vazões finais (Fator K) --------------------------------
  titulo3(`${n7}.3 Pressão no Ponto A e Vazões Finais (Fator K)`)
  paragrafo('Pressão no Ponto A = maior pressão calculada entre os dois trechos:')
  formula('P_PA = max(P_PA1; P_PA2)')

  const ramalIt = equilibrio.ramal_iterado
  const ramalGov = equilibrio.ramal_governante
  // O ramal NÃO iterado é o governante — por construção, ele não muda (ver
  // parágrafo abaixo), então "depois" tem que repetir o próprio P_PA dele,
  // não o do outro ramal. Bug corrigido: a 2ª metade de cada ternário
  // buscava res.P_PA2/res.P_PA1 trocados, fazendo a tabela mostrar o
  // governante "caindo" pro valor do ramal mais favorável.
  const pDepoisHd01 = ramalIt === 'HD01' ? equilibrio.P_A : res.P_PA1
  const pDepoisHd02 = ramalIt === 'HD02' ? equilibrio.P_A : res.P_PA2

  paragrafo('Comparativo de pressões entre os ramais, antes e depois do equilíbrio hidráulico:')
  tabela(['Ramal', 'P_A antes do equilíbrio', 'P_A depois do equilíbrio', 'Governante'], [
    ['HD01', mca2(res.P_PA1), mca2(pDepoisHd01), res.hid_governa === 'HD01' ? SIM_OK : ''],
    ['HD02', mca2(res.P_PA2), mca2(pDepoisHd02), res.hid_governa === 'HD02' ? SIM_OK : ''],
  ], { alinhas: ['left', 'right', 'right', 'left'] })
  paragrafo(`P_PA,alvo = ${f(res.P_PA)} mca (ramal governante: ${res.hid_governa})`)

  const trechoIt = ramalIt === 'HD01' ? 't3' : 't4'
  const dHIt = dH[trechoIt]
  const pPaItInicial = ramalIt === 'HD01' ? res.P_PA1 : res.P_PA2

  paragrafo(`O ramal governante (${ramalGov}) não muda — permanece com a vazão normativa Qs = ${f(Qs, 2)} L/min e a pressão de referência P_ref = ${f(res.P_valv_ref)} mca, por construção.`)
  paragrafo(`Diferença de pressão entre os ramais, ambos calculados com a mesma vazão normativa Qs — é essa diferença que o ramal mais favorável (${ramalIt}) precisa absorver, subindo sua vazão até sua P_A bater com a pressão-alvo:`)
  formula(`∆P = |P_PA,alvo − P_PA,${ramalIt.toLowerCase()}|`)
  paragrafo(`∆P = |${f(res.P_PA)} − ${f(pPaItInicial)}| = ${f(Math.abs(res.P_PA - pPaItInicial))} mca`)

  let jAtual = jInicial[trechoIt].J
  equilibrio.historico.forEach((h) => {
    titulo3(`Iteração ${h.n} do ramal ${ramalIt}`)
    paragrafo('Pressão de referência recalculada — a pressão-alvo do Ponto A menos a perda de carga e o desnível deste ramal:')
    formula('P_ref = P_PA,alvo − J − ∆H')
    paragrafo(`P_ref = ${f(res.P_PA)} − ${f(jAtual)} ${fDh(dHIt)} = ${f(h.P_ref)} mca`)
    paragrafo('Vazão recalculada pelo Fator K, com a nova pressão de referência:')
    formula(`Q = K · √(P_ref / ${f(MCA_POR_BAR)})`)
    paragrafo(`Q = ${f(K)} · √(${f(h.P_ref)} / ${f(MCA_POR_BAR)}) = ${f(h.Q, 2)} L/min`)
    paragrafo('Perda de carga recalculada por Hazen-Williams, com a vazão recalculada:')
    formula('Jun = 605·10⁴ · Q^1,85 · C^−1,85 · D^−4,87   [m/m]')
    formula('J = Ltotal · Jun   [mca]')
    tabela(['DN (mm)', 'Ltotal (m)', 'Jun (m/m)', 'J (mca)'],
      h.j.segmentos.map((s) => [f(s.d_mm, 1), f(s.Ltotal), f(s.Jun, 6), f(s.J)]))
    paragrafo(`J recalculado (soma dos diâmetros) = ${f(h.j.J)} mca`)
    paragrafo('Nova pressão no Ponto A, com o J recalculado:')
    formula('P_A = P_ref + J ± ∆H')
    paragrafo(`P_A = ${f(h.P_ref)} + ${f(h.j.J)} ${fDh(dHIt)} = ${f(h.P_A)} mca`)
    paragrafo(`Erro = |P_A − P_PA,alvo| = |${f(h.P_A)} − ${f(res.P_PA)}| = ${f(h.erro, 6)} mca`)
    jAtual = h.j.J
  })

  if (equilibrio.convergiu) {
    paragrafo(`${SIM_OK} Convergiu em ${equilibrio.historico.length} iteração(ões) — erro final de ${f(equilibrio.erro, 6)} mca, dentro da variação máxima admitida pela norma (${norma.TOLERANCIA_EQUILIBRIO_MCA_REF}) de ${f(toleranciaEquilibrio, 2)} mca. Resultado esperado: a diferença de pressão entre os ramais no Ponto A fica, na prática, eliminada.`)
  } else {
    paragrafo(`${SIM_X} Não convergiu em ${equilibrio.historico.length} iterações — erro final de ${f(equilibrio.erro, 6)} mca, acima da variação máxima admitida pela norma (${norma.TOLERANCIA_EQUILIBRIO_MCA_REF}) de ${f(toleranciaEquilibrio, 2)} mca. Resultado fora da norma; revisar a geometria da rede.`)
  }

  paragrafo('Pressão na válvula de cada hidrante, ao final do equilíbrio:')
  tabela(['Hidrante', 'P_hd (mca)'], [['HD01', f(res.P_hd01)], ['HD02', f(res.P_hd02)]])
  formula('Q = K · √P')
  tabela(['Hidrante', 'K', 'P (bar)', 'Q (L/min)'], [
    ['HD01', f(K), f(res.P_hd01 / MCA_POR_BAR), f(res.Q_hd01, 2)],
    ['HD02', f(K), f(res.P_hd02 / MCA_POR_BAR), f(res.Q_hd02, 2)],
  ])
  paragrafo(`Qt = Q_hd01 + Q_hd02 = ${f(res.Q_hd01, 2)} + ${f(res.Q_hd02, 2)} = ${f(res.Qt, 2)} L/min`)

  if (esguicho) {
    paragrafo('Com a vazão final de cada hidrante, recalculam-se a velocidade na mangueira e a perda na válvula angular — valores que aumentam conforme o traçado hidráulico caminha em direção aos pontos mais favoráveis. A pressão no esguicho sai de:')
    formula('P_esg = P_hd − Jm − Jvalv')
    tabela(['Hidrante', 'Q (L/min)', 'V mangueira (m/s)', 'Jm (mca)', 'Jvalv (mca)', 'P válvula (mca)', 'P esguicho (mca)'],
      [['HD01', esg.hd01], ['HD02', esg.hd02]].map(([lbl, e]) =>
        [lbl, f(e.Q_lmin, 2), f(e.V), f(e.Jm), f(e.Jvalv), f(e.P_valv), f(e.P_esg)]))
  }

  const colP = esguicho ? 'P esguicho (mca)' : 'P válvula (mca)'
  const linhasHid = esguicho
    ? [['HD01', esg.hd01.P_esg, res.Q_hd01], ['HD02', esg.hd02.P_esg, res.Q_hd02]]
    : [['HD01', res.P_hd01, res.Q_hd01], ['HD02', res.P_hd02, res.Q_hd02]]
  tabela(['Hidrante', colP, 'Q (L/min)', `Verificação (P ${SIM_GE} ${f(Pmin, 2)} mca e Q ${SIM_GE} ${f(Qs, 2)} L/min)`],
    linhasHid.map(([lbl, p, q]) => {
      const ok = p >= Pmin - 0.01 && q >= Qs - 0.01
      return [lbl, f(p), f(q, 2), ok ? `${SIM_OK} atende` : `${SIM_X} NÃO atende`]
    }),
    { alinhas: ['left', 'right', 'right', 'left'], titulo: 'Pressões e vazões resultantes nos hidrantes' })

  // --- 8.4 Ponto A à descarga da bomba --------------------------------------
  titulo3(`${n7}.4 Trecho do Ponto A à Descarga da Bomba`)
  paragrafo('Nesse trecho a vazão a ser considerada é a soma das vazões dos dois hidrantes em funcionamento, e a pressão inicial é a maior pressão calculada entre os dois trechos anteriores:')
  paragrafo(`Qt = Q_hd01 + Q_hd02 = ${f(res.Q_hd01, 2)} + ${f(res.Q_hd02, 2)} = ${f(res.Qt, 2)} L/min`)
  prox = contadorLetras()
  passoLtotal(j.t2, prox())
  passoPerda(j.t2, C_HW, prox())
  passoVelocidade(j.t2, vMaxTubo, prox(), COMPRIMENTO_MIN_VERIF_VELOCIDADE_M)
  titulo3(`${prox()}) Pressão na saída da bomba`)
  formula('P_SB = P_PA + J ± ∆H')
  tabela(['P_PA (mca)', 'J (mca)', '∆H (m)', 'P_SB (mca)'], [[f(res.P_PA), f(j.t2.J), fDh(dH.t2), f(res.P_SB)]])

  // --- 8.5 Sucção ------------------------------------------------------------
  titulo3(`${n7}.5 Trecho de Sucção (RTI à Bomba)`)
  paragrafo(`A pressão a ser utilizada agora é a encontrada no trecho anterior (Ponto A à descarga da bomba). Aqui utiliza-se para o cálculo de Jun também a vazão total Qt = ${f(res.Qt, 2)} L/min.`)
  prox = contadorLetras()
  passoLtotal(j.t1, prox())
  passoPerda(j.t1, C_HW, prox())
  passoVelocidade(j.t1, vMaxSuccao, prox(), COMPRIMENTO_MIN_VERIF_VELOCIDADE_M)
  titulo3(`${prox()}) Pressão de demanda referida à RTI`)
  formula('P_RTI = P_SB + J ± ∆H')
  tabela(['P_SB (mca)', 'J (mca)', '∆H (m)', 'P_RTI (mca)'], [[f(res.P_SB), f(j.t1.J), fDh(dH.t1), f(res.P_RTI)]])

  // ── Demanda do sistema ────────────────────────────────────────────────
  sec('Demanda do Sistema')
  paragrafo('Concluídos os cálculos e verificações, o sistema possui a demanda de:')
  tabela(['Grandeza', 'Valor'], [
    ['Vazão total do sistema (Qt)', `${f(res.Qt, 2)} L/min = ${f((res.Qt * 60) / 1000)} m³/h`],
    ['Altura manométrica total (Ht)', `${f(res.P_RTI)} mca`],
  ], { alinhas: ['left', 'left'] })

  // ── Dimensionamento da Bomba de Incêndio (calculado aqui, no site) ─────
  sec('Dimensionamento da Bomba de Incêndio')
  const eta = state.hidrantes?.bombaEficiencia
  const { potCv, potKw } = calcPotenciaBomba(res.Qt, res.P_RTI, eta)
  paragrafo('A vazão total (Qt) e a altura manométrica total (Ht) já obtidas definem o ponto de operação exigido da bomba de incêndio; a potência mínima depende, além disso, da eficiência global do conjunto motobomba, informada pelo responsável técnico.')
  formula('Pcv = 1000 · Qt[m³/s] · Ht / (75 · η)', [
    ['Pcv', 'Potência mínima da bomba, em cv'],
    ['Qt', 'Vazão total do sistema, convertida para m³/s'],
    ['Ht', 'Altura manométrica total (mesma da Demanda do Sistema, acima)'],
    ['η', 'Eficiência global do conjunto motobomba, adotada em projeto'],
  ])
  tabela(['Parâmetro', 'Valor'], [
    ['Vazão total (Qt)', `${f(res.Qt, 2)} L/min = ${f(res.Qt / 60000, 4)} m³/s`],
    ['Altura manométrica total (Ht)', `${f(res.P_RTI)} mca`],
    ['Eficiência global (η)', eta ? `${eta}%` : '—'],
  ], { alinhas: ['left', 'left'] })

  if (potCv != null) {
    paragrafo(`Pcv = 1000 · ${f(res.Qt / 60000, 4)} · ${f(res.P_RTI)} / (75 · ${f(eta / 100, 2)}) = ${f(potCv, 2)} cv`)
    tabela(['Potência mínima (cv)', 'Potência mínima (kW)'], [[f(potCv, 2), f(potKw, 2)]], { alinhas: ['right', 'right'] })
  } else {
    paragrafo('Eficiência da bomba ainda não informada — pendente de preenchimento na seção "Bomba de Incêndio" do formulário de classificação, acima.')
  }

  return { titulo, blocos }
}
