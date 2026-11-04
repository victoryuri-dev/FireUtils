// Comprimento equivalente (Leq) das CONEXÕES de tubulação (cotovelo, tê,
// redução, tampão, união, luva Y), calculado aqui no motor a partir do tipo
// nativo da conexão (PartType do Revit, lido no plugin — ver
// get_tipo_conexao() em lib/hidrantes/rede.py) e do diâmetro, em vez de
// depender do parâmetro de família "Perda de Carga" preenchido manualmente
// no projeto. Válvulas/acessórios continuam no fluxo antigo (parâmetro de
// família) por ora — só as conexões/fittings saem dessa dependência.
//
// SISTEMA DE CONEXÃO (bsp x grooved): aço galvanizado roscado (BSP) e
// ranhurado (Grooved/Victaulic) têm Leq bem diferentes pro mesmo tipo de
// conexão e diâmetro — e isso não dá mais pra inferir da família do Revit
// (motivo original desta refatoração). O usuário escolhe o sistema por
// diâmetro na dockpane (ver sistema_conexao.py, plugin) e o plugin manda
// junto de cada conexão — ver ConexaoEntrada.sistema.
//
// TABELA_LEQ_FT: valores por tamanho, de fontes citadas, ambos na mesma
// base (Sch. 40, Hazen-Williams C=120) pra serem comparáveis:
//   - bsp (roscado):  NFPA 13 Tabela 27.2.4.9.1.
//   - grooved:        Victaulic FireLock (fittings 101/102/103/104),
//                      publicação 10.06 Rev G (11/2024) — Seção 5.0,
//                      "Friction Flow Data".
// Só cobre DN32–DN65 (a faixa que as duas fontes têm em comum) — fora
// disso, ou pra luva Y/união/tampão/redução (sem tabela por sistema em
// nenhuma das duas fontes), cai no L/D genérico abaixo (Crane TP-410/
// Idelchik), que não distingue bsp de grooved. Convenção conservadora:
// quando a conexão tem mais de um caminho de perda possível (ex. tê),
// usa-se sempre o maior (passagem pelo ramal), nunca o menor.

export type TipoConexao = 'cotovelo' | 'tee' | 'transicao' | 'tampao' | 'uniao' | 'luva_y'
export type SistemaConexao = 'bsp' | 'grooved'

export const TIPOS_CONEXAO: ReadonlySet<string> = new Set([
  'cotovelo', 'tee', 'transicao', 'tampao', 'uniao', 'luva_y',
])

export const SISTEMAS_CONEXAO: ReadonlySet<string> = new Set(['bsp', 'grooved'])

export interface ConexaoEntrada {
  tipo: TipoConexao
  qtd: number
  /** Só para 'cotovelo'. Ângulo entre os dois trechos conectados, em graus. */
  angulo_graus: number | null
  /** Só para 'transicao'. Diâmetro do outro lado da redução, em mm. */
  d2_mm: number | null
  /** Ausente em payloads de plugin antigos — trata como 'bsp' (o que a tabela genérica já aproximava). */
  sistema: SistemaConexao
}

const FT_PARA_M = 0.3048

interface LinhaLeqFt {
  e90: number
  e45: number
  teeRamal: number
}

// Pé (ft) de tubo equivalente, Sch. 40, C=120 — chave é o DN (mm).
const TABELA_LEQ_FT: Record<SistemaConexao, Record<number, LinhaLeqFt>> = {
  // NFPA 13 Tabela 27.2.4.9.1.
  bsp: {
    32: { e90: 3, e45: 1, teeRamal: 6 },
    40: { e90: 4, e45: 2, teeRamal: 8 },
    50: { e90: 5, e45: 2, teeRamal: 10 },
    65: { e90: 6, e45: 3, teeRamal: 12 },
  },
  // Victaulic 10.06 Rev G, Seção 5.0 — Nº 101 (90°), Nº 103 (45°), Nº 102
  // ramal. DN65 na publicação tem duas sublinhas (2½" ANSI e DN65 EN10217,
  // OD ligeiramente diferente); usado o maior dos dois (mais conservador).
  grooved: {
    32: { e90: 2.8, e45: 0.4, teeRamal: 4.0 },
    40: { e90: 2.9, e45: 0.6, teeRamal: 4.0 },
    50: { e90: 3.0, e45: 1.1, teeRamal: 8.0 },
    65: { e90: 3.1, e45: 1.6, teeRamal: 9.0 },
  },
}

function linhaTabelada(dMm: number, sistema: SistemaConexao): LinhaLeqFt | null {
  const dnArredondado = Math.round(dMm)
  return TABELA_LEQ_FT[sistema][dnArredondado] ?? null
}

// --- Fallback genérico (L/D) — usado fora de DN32–65, e pra transição/
// tampão/união/luva Y, que não têm tabela por sistema em nenhuma das duas
// fontes citadas acima.
const LD_COTOVELO_90 = 30
const LD_COTOVELO_45 = 16
const LD_TEE_RAMAL = 60
const LD_WYE_RAMAL = 30
const LD_UNIAO = 0
const LD_TAMPAO = 0

/** Ângulos intermediários (ex. 60°) não têm entrada própria na tabela genérica — usa o bucket mais próximo. */
function ldCotovelo(anguloGraus: number | null): number {
  if (anguloGraus === null) return LD_COTOVELO_90
  return anguloGraus <= 67.5 ? LD_COTOVELO_45 : LD_COTOVELO_90
}

/**
 * Redução/ampliação: sem tabela L/D publicada para transições — aproximação
 * própria por faixa de razão entre diâmetros, referenciada ao menor diâmetro
 * (lado de maior velocidade, onde a perda localizada se concentra).
 */
function leqTransicaoMm(dMm: number, d2Mm: number | null): number {
  if (!d2Mm || d2Mm <= 0) return 0
  const menor = Math.min(dMm, d2Mm)
  const razao = Math.max(dMm, d2Mm) / menor
  if (razao <= 1.25) return 5 * menor
  if (razao <= 2) return 8 * menor
  return 12 * menor
}

function leqUnitM(cx: Pick<ConexaoEntrada, 'tipo' | 'angulo_graus' | 'd2_mm' | 'sistema'>, dMm: number): number {
  const dM = dMm / 1000

  if (cx.tipo === 'cotovelo' || cx.tipo === 'tee') {
    const linha = linhaTabelada(dMm, cx.sistema)
    if (linha) {
      const ft = cx.tipo === 'cotovelo' ? (cx.angulo_graus !== null && cx.angulo_graus <= 67.5 ? linha.e45 : linha.e90) : linha.teeRamal
      return ft * FT_PARA_M
    }
  }

  switch (cx.tipo) {
    case 'cotovelo': return ldCotovelo(cx.angulo_graus) * dM
    case 'tee': return LD_TEE_RAMAL * dM
    case 'luva_y': return LD_WYE_RAMAL * dM
    case 'uniao': return LD_UNIAO * dM
    case 'tampao': return LD_TAMPAO * dM
    case 'transicao': return leqTransicaoMm(dMm, cx.d2_mm) / 1000
    default: return 0
  }
}

/** Leq total (m) de todas as conexões de um segmento, dado o diâmetro (mm) do segmento. */
export function calcularLeqConexoes(conexoes: ConexaoEntrada[], dMm: number): number {
  return conexoes.reduce((soma, cx) => soma + leqUnitM(cx, dMm) * cx.qtd, 0)
}

/** Leq unitário (m) de UMA conexão — usado para compor a linha do memorial. */
export function leqUnitarioConexao(cx: Pick<ConexaoEntrada, 'tipo' | 'angulo_graus' | 'd2_mm' | 'sistema'>, dMm: number): number {
  return leqUnitM(cx, dMm)
}

export function nomeConexao(cx: Pick<ConexaoEntrada, 'tipo' | 'angulo_graus' | 'sistema'>): string {
  const sufixoSistema = cx.sistema === 'grooved' ? ' (Grooved)' : ' (BSP)'
  switch (cx.tipo) {
    case 'cotovelo': return `Cotovelo ${cx.angulo_graus !== null && cx.angulo_graus <= 67.5 ? '45°' : '90°'}${sufixoSistema}`
    case 'tee': return `Tê${sufixoSistema}`
    case 'luva_y': return 'Luva Y'
    case 'uniao': return 'União'
    case 'tampao': return 'Tampão'
    case 'transicao': return 'Redução'
    default: return 'Conexão'
  }
}
