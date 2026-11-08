// ─────────────────────────────────────────────────────────────────────────────
// hidrantesRapido.js — projeto "Dimensionamento de hidrantes" (tipoProjeto
// 'hidrantes'): um formulário único, só com o que a classificação do Sistema
// de Hidrantes/Mangotinhos (Tipo + RTI, Tabela 3 da norma do estado) precisa:
//
//   • área construída total (soma das estruturas)
//   • ocupação (divisão) de cada estrutura — principal + subsidiárias
//   • carga de incêndio (MJ/m²) de cada divisão
//   • chuveiros automáticos (não / exigido / instalado por conta própria)
//
// Os dados vão para o MESMO formato do projeto completo (state.estruturas,
// state.pavimentos, state.cargaState, state.sistemasPorEstrutura e
// state.hidrantes), então o plugin Revit e a sincronização leem esse projeto
// sem nenhuma mudança. Funções puras: a norma entra por parâmetro.
// ─────────────────────────────────────────────────────────────────────────────
import { sugerirClassificacao } from './hidrantes_calc'
import { cargaDaDivisao, classificarRisco } from './extintores_calc'

export const TIPO_PROJETO_HIDRANTES = 'hidrantes'

/** O projeto é do modo exclusivo de hidrantes? */
export const ehProjetoHidrantes = state => state?.tipoProjeto === TIPO_PROJETO_HIDRANTES

/** Chuveiros automáticos — dois sinais distintos na Tabela 3 (ver
 *  opcoesClassificacao em hidrantes_calc.js): `exigido` (Nota 1) e
 *  `instalado` sem ser exigido (Nota 2). */
export const OPCOES_CHUVEIROS = [
  { key: 'nao',       label: 'Não possui',                    desc: 'Sem chuveiros automáticos na edificação.' },
  { key: 'exigido',   label: 'Exigido pela norma',            desc: 'A edificação é obrigada a ter chuveiros automáticos (Nota 1 da Tabela 3).' },
  { key: 'instalado', label: 'Instalado, mas não exigido',    desc: 'Instalado por conta própria, sem exigência normativa (Nota 2 da Tabela 3).' },
]

/** Divisões (principal + subsidiárias) da estrutura, sem repetição e na ordem
 *  em que aparecem nos pavimentos. */
export function divisoesDaEstruturaRapido(state, estruturaId) {
  const lista = []
  state.pavimentos.filter(p => p.estruturaId === estruturaId).forEach(p => {
    ;[p.divisao, ...(p.acess || []).map(a => a.divisao)].forEach(d => { if (d && !lista.includes(d)) lista.push(d) })
  })
  return lista
}

/** Análise completa do projeto: o que falta preencher e, com tudo pronto, a
 *  sugestão de classificação (opções de Tipo/RTI). `extNorma` é opcional —
 *  só serve para o risco (carga máxima × limiares). */
export function analisarHidrantesRapido(state, norma, extNorma) {
  const pendencias = []
  if (!String(state.nome || '').trim()) pendencias.push('Nome do projeto')

  let areaTotal = 0
  const porDivisao = new Map()
  state.estruturas.forEach(est => {
    const area = parseFloat(est.areaTotal) || 0
    if (area <= 0) pendencias.push(`Área construída (${est.nome || 'estrutura'})`)
    areaTotal += area

    const divisoes = divisoesDaEstruturaRapido(state, est.id)
    if (divisoes.length === 0) pendencias.push(`Ocupação (${est.nome || 'estrutura'})`)
    const cargaState = state.cargaState[est.id] || {}
    divisoes.forEach(divisao => {
      const carga = cargaDaDivisao(divisao, cargaState)
      if (carga == null) { pendencias.push(`Carga de incêndio ${divisao} (${est.nome || 'estrutura'})`); return }
      const atual = porDivisao.get(divisao)
      if (atual == null || carga > atual) porDivisao.set(divisao, carga)
    })
  })

  const divisoesComCarga = [...porDivisao.entries()].map(([divisao, cargaMJm2]) => ({ divisao, cargaMJm2 }))
  const chuveiros = state.hidrantes?.chuveiros || 'nao'
  const sprinklersObrigatorio = chuveiros === 'exigido'
  const sprinklersAtivo = chuveiros !== 'nao'

  const pronto = pendencias.length === 0 && !!norma
  const sugestao = pronto
    ? sugerirClassificacao(areaTotal, divisoesComCarga, sprinklersObrigatorio, sprinklersAtivo, norma)
    : { faixaIndex: -1, coluna: null, divisao: null, opcoes: [] }

  const maiorCarga = divisoesComCarga.length ? Math.max(...divisoesComCarga.map(d => d.cargaMJm2)) : null
  const risco = maiorCarga != null && extNorma?.LIMIARES_RISCO ? classificarRisco(maiorCarga, extNorma.LIMIARES_RISCO) : null

  // Pronto mas sem opção: a divisão não consta na Tabela 3 do estado (ou a
  // área caiu fora das faixas) — a tela avisa em vez de ficar muda.
  const semClassificacao = pronto && sugestao.opcoes.length === 0

  return { pendencias, areaTotal, divisoesComCarga, sugestao, maiorCarga, risco, semClassificacao }
}

/** Completude (0–100) do projeto de hidrantes — não depende das normas
 *  carregadas (usada nos cards de "Meus projetos"): nome, área, ocupação,
 *  carga de cada divisão e a classificação (Tipo) definida. */
export function completudeHidrantesRapido(state) {
  const checks = [!!String(state.nome || '').trim()]
  state.estruturas.forEach(est => {
    checks.push((parseFloat(est.areaTotal) || 0) > 0)
    const divisoes = divisoesDaEstruturaRapido(state, est.id)
    checks.push(divisoes.length > 0)
    const cargaState = state.cargaState[est.id] || {}
    divisoes.forEach(d => checks.push(cargaDaDivisao(d, cargaState) != null))
  })
  checks.push(!!state.hidrantes?.tipo)
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
