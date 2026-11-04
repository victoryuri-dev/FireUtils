// Dimensionamento do sistema de hidrantes: entrada extraída do Revit → todas
// as verificações normativas → resultado pronto para gravar.
//
// Porte da parte de CÁLCULO de lib/hidrantes_dimensionar_bridge.py
// (_processar), que no plugin vivia misturada com a leitura do modelo
// Revit. A leitura (trechos, cotas, classificação) continua no plugin e chega
// aqui como `EntradaDimensionamento`; tudo que decide o resultado — perfil
// normativo, Fator K, equilíbrio, sucção, NPSH e as verificações de
// velocidade/pressão/vazão — roda só neste lado.
//
// Falhas normativas e de dados voltam como `{ ok: false, erro }` com o mesmo
// texto que o plugin já mostrava ao usuário.

import {
  calcJTrecho,
  calcularRede,
  COMPRIMENTO_MIN_VERIF_VELOCIDADE_M,
  ErroDeCalculo,
  METODO_VALVULA,
  METODOS_CALCULO,
  type Cotas,
  type JTrecho,
  type ResultadoRede,
  type Trecho,
  type Trechos,
} from './hidraulica.ts'
import { verificarCondicaoSuccao, FATOR_VAZAO_NPSH, type VerifSuccao } from './succao.ts'
import { ALTITUDE_PADRAO, TEMPERATURA_PADRAO, calcularNpshd, type ResultadoNpshd } from './npshd.ts'
import { NormProfileError, opt, req, type PerfilHidrantes, type VarianteTipo } from './perfil.ts'
import { calcularLeqConexoes, leqUnitarioConexao, nomeConexao, TIPOS_CONEXAO, type ConexaoEntrada } from './leqConexoes.ts'

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface AcessorioEntrada {
  nome: string
  qtd: number
  leq_unit: number
  leq_tot: number
}

export interface SegmentoEntrada {
  d_mm: number
  L: number
  Leq: number
  n_tubos: number
  ids: number[]
  acessorios: AcessorioEntrada[]
  // Conexões/fittings (cotovelo, tê, redução, tampão, união, luva Y)
  // classificadas no plugin pelo tipo nativo do Revit (PartType) — o Leq
  // delas é calculado aqui, não aceito do cliente (ver trechoDeSegmentos).
  // Ausente/vazio em payloads de versões antigas do plugin: trata como [].
  conexoes: ConexaoEntrada[]
}

export interface EntradaDimensionamento {
  uf: string
  valor_sistema: string
  metodo: string | null
  trechos: { t1: SegmentoEntrada[]; t2: SegmentoEntrada[]; t3: SegmentoEntrada[]; t4: SegmentoEntrada[] }
  cotas: Cotas
  dados_succao: { altitude_m: number | null; temperatura_c: number | null }
}

/** Entrada malformada (não é falha normativa): a function responde 400. */
export class EntradaInvalida extends Error {}

const MAX_SEGMENTOS_POR_TRECHO = 100
const MAX_ACESSORIOS_POR_SEGMENTO = 500
const MAX_IDS_POR_SEGMENTO = 5000
const MAX_CONEXOES_POR_SEGMENTO = 500

function numero(valor: unknown, campo: string, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw new EntradaInvalida(`Campo inválido: ${campo}`)
  }
  return valor
}

function texto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== 'string' || valor.length > max) throw new EntradaInvalida(`Campo inválido: ${campo}`)
  return valor
}

function conexao(bruto: unknown, campo: string): ConexaoEntrada {
  if (!bruto || typeof bruto !== 'object') throw new EntradaInvalida(`Campo inválido: ${campo}`)
  // deno-lint-ignore no-explicit-any
  const x = bruto as any
  if (typeof x.tipo !== 'string' || !TIPOS_CONEXAO.has(x.tipo)) {
    throw new EntradaInvalida(`Campo inválido: ${campo}.tipo`)
  }
  const opcional = (v: unknown, c: string): number | null => (v === null || v === undefined ? null : numero(v, c, 0, 1e6))
  return {
    tipo: x.tipo,
    qtd: numero(x.qtd, `${campo}.qtd`, 0, 1e6),
    angulo_graus: opcional(x.angulo_graus, `${campo}.angulo_graus`),
    d2_mm: opcional(x.d2_mm, `${campo}.d2_mm`),
  }
}

function segmento(bruto: unknown, campo: string): SegmentoEntrada {
  if (!bruto || typeof bruto !== 'object') throw new EntradaInvalida(`Campo inválido: ${campo}`)
  // deno-lint-ignore no-explicit-any
  const s = bruto as any

  const ids = Array.isArray(s.ids) ? s.ids : []
  if (ids.length > MAX_IDS_POR_SEGMENTO) throw new EntradaInvalida(`Campo inválido: ${campo}.ids`)
  ids.forEach((id: unknown) => numero(id, `${campo}.ids`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))

  const acessorios = Array.isArray(s.acessorios) ? s.acessorios : []
  if (acessorios.length > MAX_ACESSORIOS_POR_SEGMENTO) throw new EntradaInvalida(`Campo inválido: ${campo}.acessorios`)

  const conexoes = Array.isArray(s.conexoes) ? s.conexoes : []
  if (conexoes.length > MAX_CONEXOES_POR_SEGMENTO) throw new EntradaInvalida(`Campo inválido: ${campo}.conexoes`)

  return {
    d_mm: numero(s.d_mm, `${campo}.d_mm`, 0.1, 5000),
    L: numero(s.L, `${campo}.L`, 0, 1e6),
    Leq: numero(s.Leq, `${campo}.Leq`, 0, 1e6),
    n_tubos: numero(s.n_tubos ?? 0, `${campo}.n_tubos`, 0, 1e6),
    ids,
    acessorios: acessorios.map((a: unknown, i: number) => {
      if (!a || typeof a !== 'object') throw new EntradaInvalida(`Campo inválido: ${campo}.acessorios[${i}]`)
      // deno-lint-ignore no-explicit-any
      const x = a as any
      return {
        nome: texto(x.nome, `${campo}.acessorios[${i}].nome`, 200),
        qtd: numero(x.qtd, `${campo}.acessorios[${i}].qtd`, 0, 1e6),
        leq_unit: numero(x.leq_unit, `${campo}.acessorios[${i}].leq_unit`, 0, 1e6),
        leq_tot: numero(x.leq_tot, `${campo}.acessorios[${i}].leq_tot`, 0, 1e6),
      }
    }),
    conexoes: conexoes.map((cx: unknown, i: number) => conexao(cx, `${campo}.conexoes[${i}]`)),
  }
}

function listaDeSegmentos(bruto: unknown, campo: string): SegmentoEntrada[] {
  if (!Array.isArray(bruto) || bruto.length > MAX_SEGMENTOS_POR_TRECHO) {
    throw new EntradaInvalida(`Campo inválido: ${campo}`)
  }
  return bruto.map((s, i) => segmento(s, `${campo}[${i}]`))
}

/** Valida e normaliza o corpo recebido; lança EntradaInvalida se algo não fecha. */
export function validarEntrada(corpo: unknown): EntradaDimensionamento {
  if (!corpo || typeof corpo !== 'object') throw new EntradaInvalida('Corpo da requisição inválido')
  // deno-lint-ignore no-explicit-any
  const c = corpo as any

  const cotas = c.cotas
  if (!cotas || typeof cotas !== 'object') throw new EntradaInvalida('Campo inválido: cotas')
  const lim = 1e5

  const succao = c.dados_succao ?? {}
  const opcional = (v: unknown, campo: string): number | null =>
    v === null || v === undefined || v === '' ? null : numero(v, campo, -1e6, 1e6)

  return {
    uf: texto(c.uf ?? 'MA', 'uf', 8),
    valor_sistema: texto(c.valor_sistema, 'valor_sistema', 100),
    metodo: c.metodo === null || c.metodo === undefined ? null : texto(c.metodo, 'metodo', 100),
    trechos: {
      t1: listaDeSegmentos(c.trechos?.t1, 'trechos.t1'),
      t2: listaDeSegmentos(c.trechos?.t2, 'trechos.t2'),
      t3: listaDeSegmentos(c.trechos?.t3, 'trechos.t3'),
      t4: listaDeSegmentos(c.trechos?.t4, 'trechos.t4'),
    },
    cotas: {
      z_rti: numero(cotas.z_rti, 'cotas.z_rti', -lim, lim),
      z_succao: numero(cotas.z_succao, 'cotas.z_succao', -lim, lim),
      z_recalque: numero(cotas.z_recalque, 'cotas.z_recalque', -lim, lim),
      z_ponto_a: numero(cotas.z_ponto_a, 'cotas.z_ponto_a', -lim, lim),
      z_hd01: numero(cotas.z_hd01, 'cotas.z_hd01', -lim, lim),
      z_hd02: numero(cotas.z_hd02, 'cotas.z_hd02', -lim, lim),
    },
    dados_succao: {
      altitude_m: opcional(succao.altitude_m, 'dados_succao.altitude_m'),
      temperatura_c: opcional(succao.temperatura_c, 'dados_succao.temperatura_c'),
    },
  }
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface DadosSistema {
  mang_dn: number
  mang_comp: number
  q_min: number
  p_min: number
  expedicoes: string | null
  esguicho_dn: number
}

/** Mesmo formato do `payload_hid` que o plugin gravava no firedata.json. */
export interface ResultadoDimensionamento {
  res: ResultadoRede
  dados_sistema: DadosSistema
  valor_sistema: string
  metodo: string
  cotas: Cotas
  succao: 'positiva' | 'negativa'
  verif_succao: VerifSuccao
  dados_succao: { altitude_m: number | null; temperatura_c: number | null }
  verif_npshd: ResultadoNpshd | null
  erro_npshd: string | null
  j_succao_npsh: JTrecho | null
  C_HW: number
  uf: string
  // Velocidade acima do limite não interrompe mais o dimensionamento (ver
  // Etapa 5 abaixo) — cada trecho reprovado vira uma mensagem aqui, e o
  // resultado completo é devolvido mesmo assim, pra dockpane/site
  // mostrarem a tabela de velocidade (com a reprovação já marcada) em vez
  // de nada. Vazio quando todos os trechos atendem.
  avisos_velocidade: string[]
}

export type RespostaDimensionamento =
  | { ok: true; norma: string; resultado: ResultadoDimensionamento }
  | { ok: false; erro: string }

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function trechoDeSegmentos(segmentos: SegmentoEntrada[]): Trecho {
  // Ltotal e os totais do trecho são recalculados aqui, nunca aceitos do
  // cliente: L + Leq por construção, igual a extrair_trecho() do plugin.
  // Leq agora soma duas fontes: s.Leq (válvulas/acessórios, ainda via
  // parâmetro de família "Perda de Carga" — escopo não migrado) + o Leq das
  // conexões/fittings, calculado aqui por tabela (ver leqConexoes.ts). As
  // conexões também entram na lista de acessórios do segmento, só para o
  // memorial mostrar a mesma composição que mostrava antes.
  const completos = segmentos.map((s) => {
    const conexoes = s.conexoes ?? []
    const leqConexoes = calcularLeqConexoes(conexoes, s.d_mm)
    const acessoriosConexoes = conexoes.map((cx) => {
      const leqUnit = leqUnitarioConexao(cx, s.d_mm)
      return { nome: nomeConexao(cx), qtd: cx.qtd, leq_unit: leqUnit, leq_tot: leqUnit * cx.qtd }
    })
    const leq = s.Leq + leqConexoes
    return { ...s, Leq: leq, Ltotal: s.L + leq, acessorios: [...s.acessorios, ...acessoriosConexoes] }
  })
  return {
    segmentos: completos,
    L: completos.reduce((soma, s) => soma + s.L, 0),
    Leq: completos.reduce((soma, s) => soma + s.Leq, 0),
  }
}

const f = (n: number, casas: number) => n.toFixed(casas)

export function resumoFalhaVelocidade(nomeTrecho: string, limite: number, falhas: Array<{ d_mm: number; V: number }>): string {
  const partes = [`Velocidade acima do limite normativo em "${nomeTrecho}" (limite ${f(limite, 3)} m/s):`]
  for (const s of falhas) partes.push(`- DN${Math.round(s.d_mm)} : ${f(s.V, 3)} m/s`)
  return partes.join('\n')
}

export function resumoFalhaHidrante(
  label: string,
  p: number,
  q: number,
  pRefDesc: string,
  trechoDesc: string,
  pmin: number,
  qmin: number,
): string {
  return (
    `${label} não atende a norma em "${trechoDesc}":\n` +
    `- ${pRefDesc} obtida: ${f(p, 4)} mca (mínimo ${f(pmin, 2)} mca)\n` +
    `- Vazão obtida: ${f(q, 2)} L/min (mínimo ${f(qmin, 2)} L/min)`
  )
}

function numeroDoPerfil(valor: unknown, rotulo: string, perfil: PerfilHidrantes): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new NormProfileError(
      `O perfil normativo '${perfil._uf_efetiva}' (${perfil.norma ?? '?'}) tem valor inválido em '${rotulo}'.`,
    )
  }
  return valor
}

// ---------------------------------------------------------------------------
// Dimensionamento
// ---------------------------------------------------------------------------

export function dimensionar(entrada: EntradaDimensionamento, perfil: PerfilHidrantes): RespostaDimensionamento {
  try {
    return processar(entrada, perfil)
  } catch (ex) {
    if (ex instanceof NormProfileError) return { ok: false, erro: ex.message }
    // Erros de dados (ex.: mangueira ausente no método do esguicho) trazem
    // mensagem própria; o resto vira falha genérica sem vazar pilha.
    if (ex instanceof ErroDeCalculo) return { ok: false, erro: ex.message }
    return { ok: false, erro: 'Falha inesperada ao dimensionar.' }
  }
}

function processar(entrada: EntradaDimensionamento, perfil: PerfilHidrantes): RespostaDimensionamento {
  const valorSistema = entrada.valor_sistema

  // Etapa 1: tipo de sistema (classificação já aplicada no Project Information).
  const partes = valorSistema.trim().split(/\s+/)
  const tipoNum = Number.parseInt(partes[1], 10)
  if (partes.length < 2 || Number.isNaN(tipoNum)) {
    return { ok: false, erro: 'Não foi possível interpretar o tipo classificado.' }
  }

  let varianteIdx = 0
  if (valorSistema.includes('Var.')) {
    const aposVar = valorSistema.split('Var.')[1]?.trim() ?? ''
    const letra = aposVar.charCodeAt(0) - 65
    varianteIdx = Number.isNaN(letra) || letra < 0 ? 0 : letra
  }

  const tipos = req<Record<number, { variantes: VarianteTipo[] }>>(perfil, 'tipos')
  const tipoPerfil = tipos[tipoNum]
  if (!tipoPerfil) {
    return { ok: false, erro: `O perfil normativo '${perfil.norma}' não define o Tipo ${tipoNum} de sistema de hidrante.` }
  }

  const variante = tipoPerfil.variantes[varianteIdx]
  if (!variante) {
    return {
      ok: false,
      erro: `O perfil normativo '${perfil.norma}' não define a variante ${String.fromCharCode(65 + varianteIdx)} do Tipo ${tipoNum}.`,
    }
  }

  // A Tabela 2 pode vir da base central com esses valores como inteiros.
  const dadosSistema: DadosSistema = {
    mang_dn: numeroDoPerfil(variante.mang_dn, 'mangueiraDn', perfil),
    mang_comp: numeroDoPerfil(variante.mang_comp, 'mangueiraComprimento', perfil),
    q_min: numeroDoPerfil(variante.q_min, 'vazaoMin', perfil),
    p_min: numeroDoPerfil(variante.p_min, 'pressaoMin', perfil),
    expedicoes: variante.expedicoes,
    esguicho_dn: numeroDoPerfil(variante.esguicho_dn, 'esguicho', perfil),
  }

  const Qs = dadosSistema.q_min
  const Pmin = dadosSistema.p_min
  if (Qs <= 0 || Pmin <= 0) {
    return { ok: false, erro: `O perfil normativo '${perfil.norma}' define vazão ou pressão mínima não positiva para o Tipo ${tipoNum}.` }
  }

  const hazen = req<Record<string, number>>(perfil, 'hazen_c')
  const CHW = numeroDoPerfil(hazen.galvanizado, 'hazen_c.galvanizado', perfil)
  if (CHW <= 0) {
    return { ok: false, erro: `O perfil normativo '${perfil.norma}' define coeficiente C não positivo para galvanizado.` }
  }

  // Etapa 1b: método de cálculo (gravado junto da classificação).
  let metodoCalculo = entrada.metodo
  if (!metodoCalculo || !METODOS_CALCULO.includes(metodoCalculo)) {
    if (metodoCalculo) {
      return {
        ok: false,
        erro: `Método de cálculo desconhecido no projeto: '${metodoCalculo}'. Classifique o sistema novamente.`,
      }
    }
    metodoCalculo = METODO_VALVULA
  }

  // Etapa 4: trechos (por diâmetro) e perfil normativo do cálculo.
  const trechos: Trechos = {
    t1: trechoDeSegmentos(entrada.trechos.t1),
    t2: trechoDeSegmentos(entrada.trechos.t2),
    t3: trechoDeSegmentos(entrada.trechos.t3),
    t4: trechoDeSegmentos(entrada.trechos.t4),
  }

  const toleranciaEquilibrioMca = numeroDoPerfil(req(perfil, 'tolerancia_equilibrio_mca'), 'tolerancia_equilibrio_mca', perfil)
  const vMaxTubo = numeroDoPerfil(req(perfil, 'v_max_tubulacao'), 'v_max_tubulacao', perfil)
  const vMaxSucPos = numeroDoPerfil(req(perfil, 'v_max_succao_positiva'), 'v_max_succao_positiva', perfil)
  const vMaxSucNeg = numeroDoPerfil(req(perfil, 'v_max_succao_negativa'), 'v_max_succao_negativa', perfil)
  const normaNome = String(req(perfil, 'norma'))

  const cotas = entrada.cotas

  const res = calcularRede(trechos, {
    Qs_lmin: Qs,
    Pmin,
    C: CHW,
    cotas,
    tolerancia_equilibrio_mca: toleranciaEquilibrioMca,
    metodo: metodoCalculo,
    mang_dn_mm: dadosSistema.mang_dn,
    mang_comp_m: dadosSistema.mang_comp,
  })

  // Etapa 4a: equilíbrio hidráulico entre HD01/HD02 no Ponto A.
  if (!res.equilibrio.convergiu) {
    const eq = res.equilibrio
    return {
      ok: false,
      erro:
        `O equilíbrio hidráulico entre HD01 e HD02 não convergiu ` +
        `(diferença de ${f(eq.erro ?? 0, 4)} mca, limite ${f(eq.tolerancia ?? toleranciaEquilibrioMca, 2)} mca — ${normaNome}). ` +
        `Revise o traçado/diâmetro da rede entre os dois ramais.`,
    }
  }

  // Condição de sucção + NPSH (quando negativa).
  const verifSuccao = verificarCondicaoSuccao(
    cotas.z_rti,
    cotas.z_succao,
    res.Qt,
    numeroDoPerfil(opt(perfil, 'npshd_fator_vazao', FATOR_VAZAO_NPSH), 'npshd_fator_vazao', perfil),
  )
  const succao = verifSuccao.succao_simples

  let verifNpshd: ResultadoNpshd | null = null
  let erroNpshd: string | null = null
  let jSuccaoNpsh: JTrecho | null = null
  if (verifSuccao.exige_npsh) {
    const qNpsh = verifSuccao.vazao_npsh_lmin as number
    jSuccaoNpsh = calcJTrecho(trechos.t1, qNpsh, CHW, 'Sucção — vazão majorada (NPSH)')
    try {
      verifNpshd = calcularNpshd(
        entrada.dados_succao.altitude_m ?? ALTITUDE_PADRAO,
        entrada.dados_succao.temperatura_c ?? TEMPERATURA_PADRAO,
        verifSuccao.hs_abs as number,
        jSuccaoNpsh.J,
      )
    } catch (ex) {
      erroNpshd = (ex as Error).message
    }
  }

  const vMaxSuccao = succao === 'positiva' ? vMaxSucPos : vMaxSucNeg

  let pHd01Ref: number
  let pHd02Ref: number
  let pRefDesc: string
  if (res.esguicho && res.esg) {
    pHd01Ref = res.esg.hd01.P_esg
    pHd02Ref = res.esg.hd02.P_esg
    pRefDesc = 'pressão no esguicho'
  } else {
    pHd01Ref = res.P_hd01
    pHd02Ref = res.P_hd02
    pRefDesc = 'pressão na válvula'
  }

  // Etapa 5 — verificações normativas. Pressão/vazão no hidrante para o
  // dimensionamento (não dá pra seguir com um resultado que não atende);
  // velocidade só registra um aviso e continua — uma correção de diâmetro
  // que pode ser feita depois não deveria travar o resto do fluxo
  // (resultado final, memorial, sincronização com o site/dockpane). O RT
  // vê a reprovação na própria tabela de velocidade, com o trecho/DN/
  // limite ultrapassado, em vez de nada.
  const falhaVelocidade = (j: JTrecho, limite: number, nomeTrecho: string, comprimentoMin: number | null = null) => {
    const segmentos = comprimentoMin === null ? j.segmentos : j.segmentos.filter((s) => s.L >= comprimentoMin)
    const falhas = segmentos.filter((s) => s.V > limite + 1e-9)
    return falhas.length ? resumoFalhaVelocidade(nomeTrecho, limite, falhas) : null
  }

  const falhaHidrante = (label: string, p: number, q: number, trechoDesc: string) => {
    if (p >= Pmin - 0.01 && q >= Qs - 0.01) return null
    return resumoFalhaHidrante(label, p, q, pRefDesc, trechoDesc, Pmin, Qs)
  }

  const avisosVelocidade: string[] = []
  const registrarVelocidade = (j: JTrecho, limite: number, nomeTrecho: string, comprimentoMin: number | null = null) => {
    const falha = falhaVelocidade(j, limite, nomeTrecho, comprimentoMin)
    if (falha) avisosVelocidade.push(falha)
  }

  registrarVelocidade(res.j.t3, vMaxTubo, 'Ponto A → HD01')
  const falhaHd01 = falhaHidrante('HD01', pHd01Ref, res.Q_hd01, 'Ponto A → HD01')
  if (falhaHd01) return { ok: false, erro: falhaHd01 }

  registrarVelocidade(res.j.t4, vMaxTubo, 'Ponto A → HD02')
  const falhaHd02 = falhaHidrante('HD02', pHd02Ref, res.Q_hd02, 'Ponto A → HD02')
  if (falhaHd02) return { ok: false, erro: falhaHd02 }

  registrarVelocidade(res.j.t2, vMaxTubo, 'Bomba → Ponto A (recalque)', COMPRIMENTO_MIN_VERIF_VELOCIDADE_M)
  registrarVelocidade(res.j.t1, vMaxSuccao, 'Sucção (RTI → Bomba)', COMPRIMENTO_MIN_VERIF_VELOCIDADE_M)

  return {
    ok: true,
    norma: normaNome,
    resultado: {
      res,
      dados_sistema: dadosSistema,
      valor_sistema: valorSistema,
      metodo: metodoCalculo,
      cotas,
      succao,
      verif_succao: verifSuccao,
      dados_succao: entrada.dados_succao,
      verif_npshd: verifNpshd,
      erro_npshd: erroNpshd,
      j_succao_npsh: jSuccaoNpsh,
      C_HW: CHW,
      uf: perfil._uf_efetiva,
      avisos_velocidade: avisosVelocidade,
    },
  }
}
