// Motor de cálculo hidráulico de hidrantes — MÉTODO DA MARCHA.
//
// Porte fiel de Fire Utils.tab/lib/hidrantes/calc.py (FireUtils.extension),
// que era a única fonte desta matemática dentro do plugin. Mesmos nomes de
// chave nos dicionários de resposta ("Q_lmin", "Jun", "P_PA"...), porque o
// plugin e o site já leem esse formato do firedata.json e do Supabase.
//
// Módulo puro: sem Deno, sem rede, sem banco — roda igual em Edge Function e
// em Node (tests/motorHidrantes.test.mjs compara com resultados do Python).
//
// Passo a passo (documento "Passo a Passo de Cálculo Hidráulico de
// Hidrantes"):
//   1. Q e Pmin de projeto vêm da norma vigente (Tabela 2).
//   2. Cenário: os 2 hidrantes mais desfavoráveis em funcionamento
//      simultâneo (HD01 = mais desfavorável, HD02 = 2º).
//   3. Trechos: T1 = RTI → Bomba (sucção); T2 = Bomba → Ponto A (recalque);
//      T3 = Ponto A → HD01; T4 = Ponto A → HD02.
//   4. Método "Válvula do Hidrante": (Q, Pmin) aplicam-se na válvula.
//      Método "Ponta do Esguicho Regulável": aplicam-se na ponta do esguicho,
//      e entre esguicho e válvula entram a mangueira (Jm) e a válvula
//      angular (Jvalv):
//        Jm    = 8·f·Lm/(g·π²·Dm⁵)·Q²   (Darcy-Weisbach, f = 0,022)
//        V     = 21,22·Q/Dm²
//        Jvalv = K_v·V²/(2g)             (K_v = 5)
//        P de referência (na válvula) = Pmin + Jm + Jvalv
//      Fator K só no hidrante mais desfavorável: K = Q / √P (P em bar).
//   5. Hazen-Williams por trecho e por diâmetro nominal:
//        Jun = 605·10⁴ · Q^1,85 · C^−1,85 · D^−4,87   [m/m]
//        J   = Ltotal · Jun                            [mca]
//   6. ΔH = Hi − Hf por trecho, na direção da marcha.
//   7. Equilíbrio no Ponto A: o ramal de maior pressão governa; o outro
//      converge iterativamente (vazão pelo Fator K, J recalculado a cada
//      passo) até a diferença de pressão caber na tolerância da norma.
//   8. Marcha de pressões: P_PA → P_SB → P_RTI (T2 e T1 com Qt = Q1 + Q2).

// Conversão de pressão usada pelo Fator K (1 bar = 10,1971 mca).
export const MCA_POR_BAR = 10.1971

// Trecho esguicho → mangueira → válvula.
export const F_DARCY = 0.022
export const G = 9.81
export const K_VALVULA = 5.0
export const COEF_JM = 8.0

// Trava de segurança contra não-convergência (não normativa).
export const MAX_ITER_EQUILIBRIO = 30

// Exceção prática (NÃO normativa) à verificação de velocidade nos trechos
// mais próximos da bomba: um sub-trecho de tubo mais curto que isso (ex.:
// redução na entrada/saída da bomba) fica de fora, porque não representa
// escoamento sustentado.
export const COMPRIMENTO_MIN_VERIF_VELOCIDADE_M = 0.20

export const METODO_VALVULA = 'Válvula do Hidrante'
export const METODO_ESGUICHO = 'Ponta do Esguicho Regulável'
export const METODOS_CALCULO = [METODO_VALVULA, METODO_ESGUICHO]

/** Dado de entrada que impede o cálculo (mensagem já pronta para o usuário). */
export class ErroDeCalculo extends Error {}

export interface Segmento {
  d_mm: number
  L: number
  Leq: number
  Ltotal: number
  [chave: string]: unknown
}

export interface Trecho {
  segmentos: Segmento[]
  L: number
  Leq: number
}

export interface Trechos {
  t1: Trecho
  t2: Trecho
  t3: Trecho
  t4: Trecho
}

export interface Cotas {
  z_rti: number
  z_succao: number
  z_recalque: number
  z_ponto_a: number
  z_hd01: number
  z_hd02: number
}

export function ehMetodoEsguicho(metodo: string | null | undefined): boolean {
  return (metodo ?? '').trim() === METODO_ESGUICHO
}

// ===========================================================================
// FÓRMULAS BÁSICAS (Q em L/min, D em mm, P em mca)
// ===========================================================================

/** Fator K do hidrante mais desfavorável: K = Q / √P (P convertida a bar). */
export function calcFatorK(qLmin: number, pMca: number): number {
  const pBar = pMca / MCA_POR_BAR
  return qLmin / Math.sqrt(pBar)
}

/** Vazão resultante de uma pressão disponível: Q = K·√P (P em bar). */
export function vazaoPorK(k: number, pMca: number): number {
  if (pMca <= 0) return 0.0
  return k * Math.sqrt(pMca / MCA_POR_BAR)
}

/** Perda de carga unitária de Hazen-Williams [m/m]; D = diâmetro NOMINAL. */
export function calcJun(qLmin: number, c: number, dMm: number): number {
  if (qLmin <= 0 || dMm <= 0) return 0.0
  return 605.0 * 10.0 ** 4 * qLmin ** 1.85 * c ** -1.85 * dMm ** -4.87
}

/** Velocidade de escoamento [m/s]: V = 21,22 · Q / D². */
export function calcVelocidade(qLmin: number, dMm: number): number {
  if (dMm <= 0) return 0.0
  return (21.22 * qLmin) / dMm ** 2
}

// ===========================================================================
// ESGUICHO → MANGUEIRA → VÁLVULA
// ===========================================================================

/**
 * Perda de carga na mangueira (Darcy-Weisbach):
 *   Jm = 8·f·Lm / (g·π²·Dm⁵) · Q²
 * Q é a vazão INDIVIDUAL da mangueira, convertida a m³/s; Lm e Dm em metros.
 */
export function calcJmMangueira(qLmin: number, lmM: number, dmM: number, f = F_DARCY): number {
  if (lmM <= 0 || dmM <= 0) return 0.0
  const qM3s = qLmin / 60000.0
  return ((COEF_JM * f * lmM) / (G * Math.PI ** 2 * dmM ** 5)) * qM3s ** 2
}

/** Perda localizada na válvula angular: Jvalv = K · v² / (2g). */
export function calcJvalv(vMs: number, kValv = K_VALVULA): number {
  return (kValv * vMs ** 2) / (2.0 * G)
}

export interface CadeiaEsguicho {
  Q_lmin: number
  Jm: number
  V: number
  Jvalv: number
  P_esg: number
  P_valv: number
}

/**
 * Trecho entre a ponta do esguicho e a válvula do hidrante. Informe pEsgMca
 * para subir do esguicho até a válvula, ou pValvMca para descer da válvula
 * até o esguicho.
 */
export function calcCadeiaEsguicho(
  qLmin: number,
  mangDnMm: number,
  mangCompM: number,
  pValvMca: number | null = null,
  pEsgMca: number | null = null,
): CadeiaEsguicho {
  const dmM = mangDnMm / 1000.0
  const jm = calcJmMangueira(qLmin, mangCompM, dmM)
  const v = calcVelocidade(qLmin, mangDnMm)
  const jvalv = calcJvalv(v)

  let pEsg: number
  let pValv: number
  if (pEsgMca !== null) {
    pEsg = pEsgMca
    pValv = pEsg + jm + jvalv
  } else {
    pValv = pValvMca as number
    pEsg = pValv - jm - jvalv
  }

  return { Q_lmin: qLmin, Jm: jm, V: v, Jvalv: jvalv, P_esg: pEsg, P_valv: pValv }
}

// ===========================================================================
// PERDA DE CARGA DE UM TRECHO (por diâmetro)
// ===========================================================================

export interface SegmentoCalculado extends Segmento {
  Jun: number
  J: number
  V: number
}

function cDoSegmento(seg: Segmento, cPadrao: number): number {
  const c = (seg as { c_hw?: unknown }).c_hw
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : cPadrao
}

export interface JTrecho {
  label: string
  Q_lmin: number
  segmentos: SegmentoCalculado[]
  J: number
  V_max: number
  L: number
  Leq: number
}

/**
 * Hazen-Williams por segmento de diâmetro: J_trecho = Σ Ltotal(D)·Jun(Q,C,D).
 * `c` é o coeficiente PADRÃO (ex.: hazen_c.galvanizado) — cada segmento pode
 * trazer o próprio `c_hw` (material escolhido por trecho na dockpane, ver
 * trechoDeSegmentos em dimensionar.ts) e nesse caso ele prevalece sobre `c`.
 * Payload sem material em nenhum segmento se comporta exatamente como antes.
 */
export function calcJTrecho(trecho: Trecho, qLmin: number, c: number, label = ''): JTrecho {
  const segmentos: SegmentoCalculado[] = []
  let jTotal = 0.0
  let vMax = 0.0
  for (const seg of trecho.segmentos) {
    const cSeg = cDoSegmento(seg, c)
    const jun = calcJun(qLmin, cSeg, seg.d_mm)
    const j = jun * seg.Ltotal
    const v = calcVelocidade(qLmin, seg.d_mm)
    jTotal += j
    if (v > vMax) vMax = v
    segmentos.push({ ...seg, Jun: jun, J: j, V: v })
  }
  return { label, Q_lmin: qLmin, segmentos, J: jTotal, V_max: vMax, L: trecho.L, Leq: trecho.Leq }
}

// ===========================================================================
// EQUILÍBRIO HIDRÁULICO ENTRE RAMAIS NO PONTO A
// ===========================================================================

export interface PassoEquilibrio {
  n: number
  P_ref: number
  Q: number
  J: number
  j: JTrecho
  P_A: number
  erro: number
}

export interface ResultadoEquilibrio {
  Q: number
  P_ref: number
  j: JTrecho
  P_A: number
  erro: number
  historico: PassoEquilibrio[]
  convergiu: boolean
  tolerancia: number
}

/**
 * Converge iterativamente a vazão do ramal MAIS FAVORÁVEL até a pressão
 * requerida dele no Ponto A coincidir com a pressão-alvo fixada pelo ramal
 * governante, dentro da tolerância da norma.
 *
 * A cada passo:
 *   P_ref  = P_alvo − J_atual − ∆H
 *   Q      = K · √(P_ref / 10,1971)
 *   J_novo = Hazen-Williams NESSA vazão (nunca reaproveita a de outra)
 *   P_A    = P_ref + J_novo + ∆H
 *   erro   = |P_A − P_alvo|
 */
function equilibrarRamal(
  trecho: Trecho,
  k: number,
  pAlvo: number,
  dhRamal: number,
  c: number,
  jInicial: JTrecho,
  toleranciaMca: number,
  maxIter = MAX_ITER_EQUILIBRIO,
): ResultadoEquilibrio {
  let jAtual = jInicial.J
  const label = jInicial.label ?? ''
  const historico: PassoEquilibrio[] = []
  let convergiu = false

  let pRef = pAlvo - jAtual - dhRamal
  let qNovo = jInicial.Q_lmin ?? 0.0
  let jNovo = jInicial
  let pANovo = pAlvo
  let erro = 0.0

  for (let n = 1; n <= Math.trunc(maxIter); n++) {
    pRef = pAlvo - jAtual - dhRamal
    qNovo = vazaoPorK(k, pRef)
    jNovo = calcJTrecho(trecho, qNovo, c, label)
    pANovo = pRef + jNovo.J + dhRamal
    erro = Math.abs(pANovo - pAlvo)
    historico.push({ n, P_ref: pRef, Q: qNovo, J: jNovo.J, j: jNovo, P_A: pANovo, erro })
    jAtual = jNovo.J
    if (erro <= toleranciaMca) {
      convergiu = true
      break
    }
  }

  return {
    Q: qNovo,
    P_ref: pRef,
    j: jNovo,
    P_A: pANovo,
    erro,
    historico,
    convergiu,
    tolerancia: toleranciaMca,
  }
}

// ===========================================================================
// RESOLUÇÃO DA REDE — MÉTODO DA MARCHA COM FATOR K
// ===========================================================================

export interface ResultadoRede {
  metodo: string
  esguicho: boolean
  K: number
  P_valv_ref: number
  esg: {
    hd01: CadeiaEsguicho
    hd02: CadeiaEsguicho
    ref: CadeiaEsguicho | null
    mang_dn_mm: number | null
    mang_comp_m: number | null
  } | null
  dH: { t1: number; t2: number; t3: number; t4: number }
  j: { t1: JTrecho; t2: JTrecho; t3: JTrecho; t4: JTrecho }
  j_inicial: { t3: JTrecho; t4: JTrecho }
  equilibrio: ResultadoEquilibrio & { ramal_iterado: string; ramal_governante: string }
  Q_hd01: number
  Q_hd02: number
  Qt: number
  P_PA1: number
  P_PA2: number
  P_PA: number
  P_hd01: number
  P_hd02: number
  P_SB: number
  P_RTI: number
  hid_governa: string
}

export interface ParametrosRede {
  Qs_lmin: number
  Pmin: number
  C: number
  cotas: Cotas
  tolerancia_equilibrio_mca: number
  metodo?: string
  mang_dn_mm?: number | null
  mang_comp_m?: number | null
  max_iter_equilibrio?: number
}

/**
 * Resolve a rede de 2 hidrantes em paralelo pelo método da marcha, com
 * equilíbrio hidráulico iterativo entre os dois ramais no Ponto A.
 *
 * Sequência:
 *   1. Ponto de referência do par normativo (válvula: P_valv_ref = Pmin;
 *      esguicho: P_valv_ref = Pmin + Jm + Jvalv).
 *   2. K = Qs/√P_valv_ref (só no hidrante mais desfavorável).
 *   3. Cálculo INICIAL dos dois ramais com a mesma vazão Qs.
 *   4. O ramal de maior pressão no Ponto A governa e não muda mais.
 *   5. O outro converge (equilibrarRamal).
 *   6. Só depois de convergido soma-se Qt = Q_hd01 + Q_hd02; no método do
 *      esguicho Jm/V/Jvalv são recalculados com a vazão final.
 *   7. Qt segue para o tronco: P_SB = P_PA + J(T2, Qt) ± ΔH; P_RTI = P_SB +
 *      J(T1, Qt) ± ΔH.
 *   8. Demanda final: Q = Qt, P = P_RTI.
 */
export function calcularRede(trechos: Trechos, p: ParametrosRede): ResultadoRede {
  const Qs = Number(p.Qs_lmin)
  const Pmin = Number(p.Pmin)
  const C = p.C
  const cotas = p.cotas
  const metodo = p.metodo ?? METODO_VALVULA
  const mangDnMm = p.mang_dn_mm ?? null
  const mangCompM = p.mang_comp_m ?? null

  const esguicho = ehMetodoEsguicho(metodo)
  if (esguicho && !(mangDnMm && mangCompM)) {
    throw new ErroDeCalculo(`O método '${METODO_ESGUICHO}' exige o DN e o comprimento da mangueira.`)
  }

  // ΔH = Hi − Hf por trecho, na direção da marcha de cálculo.
  const dH = {
    t3: cotas.z_hd01 - cotas.z_ponto_a,
    t4: cotas.z_hd02 - cotas.z_ponto_a,
    t2: cotas.z_ponto_a - cotas.z_recalque,
    t1: cotas.z_succao - cotas.z_rti,
  }

  let esgRef: CadeiaEsguicho | null = null
  let pValvRef: number
  if (esguicho) {
    esgRef = calcCadeiaEsguicho(Qs, mangDnMm as number, mangCompM as number, null, Pmin)
    pValvRef = esgRef.P_valv
  } else {
    pValvRef = Pmin
  }

  const K = calcFatorK(Qs, pValvRef)

  // Cálculo INICIAL dos dois ramais, ambos com a mesma vazão normativa Qs.
  // j3_inicial/j4_inicial ficam guardados à parte: o memorial precisa do
  // "antes" (Qs) e do "depois" (pós-equilíbrio).
  let j3 = calcJTrecho(trechos.t3, Qs, C, 'Trecho HD01 ao Ponto A')
  let j4 = calcJTrecho(trechos.t4, Qs, C, 'Trecho HD02 ao Ponto A')
  const j3Inicial = j3
  const j4Inicial = j4

  const P_PA1 = pValvRef + j3.J + dH.t3
  const P_PA2 = pValvRef + j4.J + dH.t4
  const P_PA = Math.max(P_PA1, P_PA2)
  const hidGoverna = P_PA1 >= P_PA2 ? 'HD01' : 'HD02'

  let Q1: number
  let Q2: number
  let P_hd01: number
  let P_hd02: number
  let equilibrio: ResultadoRede['equilibrio']

  if (hidGoverna === 'HD01') {
    const eq = equilibrarRamal(trechos.t4, K, P_PA, dH.t4, C, j4, p.tolerancia_equilibrio_mca, p.max_iter_equilibrio)
    j4 = eq.j
    P_hd01 = pValvRef
    Q1 = Qs
    P_hd02 = eq.P_ref
    Q2 = eq.Q
    equilibrio = { ramal_iterado: 'HD02', ramal_governante: 'HD01', ...eq }
  } else {
    const eq = equilibrarRamal(trechos.t3, K, P_PA, dH.t3, C, j3, p.tolerancia_equilibrio_mca, p.max_iter_equilibrio)
    j3 = eq.j
    P_hd02 = pValvRef
    Q2 = Qs
    P_hd01 = eq.P_ref
    Q1 = eq.Q
    equilibrio = { ramal_iterado: 'HD01', ramal_governante: 'HD02', ...eq }
  }

  const Qt = Q1 + Q2

  let esg: ResultadoRede['esg'] = null
  if (esguicho) {
    esg = {
      hd01: calcCadeiaEsguicho(Q1, mangDnMm as number, mangCompM as number, P_hd01),
      hd02: calcCadeiaEsguicho(Q2, mangDnMm as number, mangCompM as number, P_hd02),
      ref: esgRef,
      mang_dn_mm: mangDnMm,
      mang_comp_m: mangCompM,
    }
  }

  const j2 = calcJTrecho(trechos.t2, Qt, C, 'Trecho Bomba ao Ponto A')
  const P_SB = P_PA + j2.J + dH.t2

  const j1 = calcJTrecho(trechos.t1, Qt, C, 'Trecho de Sucção (RTI à Bomba)')
  const P_RTI = P_SB + j1.J + dH.t1

  return {
    metodo,
    esguicho,
    K,
    P_valv_ref: pValvRef,
    esg,
    dH,
    j: { t1: j1, t2: j2, t3: j3, t4: j4 },
    j_inicial: { t3: j3Inicial, t4: j4Inicial },
    equilibrio,
    Q_hd01: Q1,
    Q_hd02: Q2,
    Qt,
    P_PA1,
    P_PA2,
    P_PA,
    P_hd01,
    P_hd02,
    P_SB,
    P_RTI,
    hid_governa: hidGoverna,
  }
}
