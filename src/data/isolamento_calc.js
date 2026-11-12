// Isolamento de risco (NT 20/2023 CBMPB): D = α × (largura ou altura) + β.
// α vem da Tabela A-1 (normas/<UF>/isolamento_risco.js, via Supabase):
// linha pela % de aberturas da classe de severidade, coluna pela relação
// largura/altura "X" (maior/menor dimensão da fachada). Sem interpolação:
// % de aberturas e X vão para a linha/coluna imediatamente acima
// (a favor da segurança).

const num = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Linhas de % de aberturas da classe (I, II ou III), em ordem. */
export const aberturasDaClasse = (tabela, classe) => (tabela?.linhas || []).map(l => l.aberturas?.[classe]).filter(v => v != null)

/**
 * { alfa, x, menor, aberturaTabela, xTabela, d } da fachada; null sem dados.
 * f: { severidade: 'I'|'II'|'III', aberturas (%), largura (m), altura (m), beta (m) }
 */
export function distanciaSeguranca(tabela, f) {
  const largura = num(f?.largura), altura = num(f?.altura), ab = num(f?.aberturas), beta = num(f?.beta) ?? 0
  if (!tabela || !f?.severidade || !(largura > 0) || !(altura > 0) || !(ab > 0)) return null
  const menor = Math.min(largura, altura)
  const x = Math.max(largura, altura) / menor
  const linha = tabela.linhas.find(l => l.aberturas?.[f.severidade] != null && ab <= l.aberturas[f.severidade])
  const iCol = tabela.relacoes.findIndex(r => x <= r + 1e-9)
  if (!linha || iCol < 0) return null
  const alfa = linha.alfa[iCol]
  return { alfa, x, menor, aberturaTabela: linha.aberturas[f.severidade], xTabela: tabela.relacoes[iCol], beta, d: alfa * menor + beta }
}

/** Distância depois do redutor escolhido (proteção × vedação); sem redutor, a própria. */
export function distanciaComRedutor(redutores, d, protecao, vedacao) {
  if (d == null) return null
  const efeito = redutores?.protecoes?.find(p => p.key === protecao)?.efeitos?.[vedacao]
  if (!efeito) return { d, efeito: null }
  let r = d * efeito.fator
  if (efeito.maximo != null) r = Math.min(r, efeito.maximo)
  return { d: r, efeito }
}
