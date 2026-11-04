// Comprimento equivalente (Leq) das CONEXÕES de tubulação (cotovelo, tê,
// redução, tampão, união, luva Y), calculado aqui no motor a partir do tipo
// nativo da conexão (PartType do Revit, lido no plugin — ver
// get_tipo_conexao() em lib/hidrantes/rede.py) e do diâmetro, em vez de
// depender do parâmetro de família "Perda de Carga" preenchido manualmente
// no projeto. Válvulas/acessórios continuam no fluxo antigo (parâmetro de
// família) por ora — só as conexões/fittings saem dessa dependência.
//
// Valores por L/D (método consagrado Crane TP-410 / Idelchik): Leq = (L/D) ×
// diâmetro interno. São valores genéricos de engenharia hidráulica, não
// tabela própria da NT-22/2021 — ajuste aqui se uma tabela normativa
// específica for adotada depois. Convenção conservadora: quando a conexão
// tem mais de um caminho de perda possível (ex. tê), usa-se o maior L/D
// (passagem pelo ramal), nunca o menor — erra para o lado seguro do
// dimensionamento de incêndio.

export type TipoConexao = 'cotovelo' | 'tee' | 'transicao' | 'tampao' | 'uniao' | 'luva_y'

export const TIPOS_CONEXAO: ReadonlySet<string> = new Set([
  'cotovelo', 'tee', 'transicao', 'tampao', 'uniao', 'luva_y',
])

export interface ConexaoEntrada {
  tipo: TipoConexao
  qtd: number
  /** Só para 'cotovelo'. Ângulo entre os dois trechos conectados, em graus. */
  angulo_graus: number | null
  /** Só para 'transicao'. Diâmetro do outro lado da redução, em mm. */
  d2_mm: number | null
}

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

function leqUnitM(cx: Pick<ConexaoEntrada, 'tipo' | 'angulo_graus' | 'd2_mm'>, dMm: number): number {
  const dM = dMm / 1000
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
export function leqUnitarioConexao(cx: Pick<ConexaoEntrada, 'tipo' | 'angulo_graus' | 'd2_mm'>, dMm: number): number {
  return leqUnitM(cx, dMm)
}

export function nomeConexao(cx: Pick<ConexaoEntrada, 'tipo' | 'angulo_graus'>): string {
  switch (cx.tipo) {
    case 'cotovelo': return `Cotovelo ${cx.angulo_graus !== null && cx.angulo_graus <= 67.5 ? '45°' : '90°'}`
    case 'tee': return 'Tê'
    case 'luva_y': return 'Luva Y'
    case 'uniao': return 'União'
    case 'tampao': return 'Tampão'
    case 'transicao': return 'Redução'
    default: return 'Conexão'
  }
}
