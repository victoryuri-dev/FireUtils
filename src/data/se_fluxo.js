// se_fluxo.js — dados do fluxograma de saídas (Ambientes -> Acessos ->
// Saída/Escada) de um pavimento: grupo de ambientes (`grupos`), posição dos
// nós na área de trabalho (`fluxoPos`) e migração dos pavimentos salvos
// antes do fluxograma existir. Funções puras, sem React — o cálculo em si
// continua em se_calc.js.
//
//   pavimento.grupos   = [{ id, nome, acessoId: string|null }]
//     -- grupo de ambientes: agrupa ambientes e liga o conjunto a UM nó
//        (acesso/saída/escada). `acessoId` null = grupo ainda sem ligação.
//   ambiente.grupoId   : string|null   -- grupo em que o ambiente está.
//   ambiente.acessoId  : string|null   -- sempre igual ao `acessoId` do grupo
//        (o reducer mantém sincronizado, ver sincronizarAmbientes) — é o que
//        o motor de cálculo e o memorial leem.
//   pavimento.fluxoLados = { [idDaOrigem]: { de, para } }
//     -- por qual lado (top|right|bottom|left) cada seta sai da origem e chega
//        ao destino; sem entrada vale o padrão (sai pela direita, chega pela
//        esquerda).
//   pavimento.fluxoPos = { [idDoNo]: { x, y } }
//     -- posição de cada grupo e de cada acesso/saída/escada na área de trabalho.

import { ehRaiz, tipoNo } from './se_calc'

export const COL_W = 400
export const ROW_H = 220

/** Nome padrão de um grupo novo: "Grupo 1", "Grupo 2"… — o menor número
 * ainda não usado por outro grupo do pavimento. */
export function proximoNomeGrupo(grupos) {
  const usados = new Set((grupos || []).map(g => g.nome))
  let n = (grupos || []).length + 1
  while (usados.has(`Grupo ${n}`)) n++
  return `Grupo ${n}`
}

/** Mantém `ambiente.acessoId` igual ao do grupo em que ele está — ambiente
 * fora de qualquer grupo (ou em grupo sem ligação) fica com acessoId null.
 * Grupo que aponta pra um acesso que não existe mais também é desligado. */
export function sincronizarAmbientes(ambientes, grupos, acessos) {
  const idsAcesso = new Set((acessos || []).map(a => a.id))
  const acessoDoGrupo = new Map((grupos || []).map(g => [g.id, idsAcesso.has(g.acessoId) ? g.acessoId : null]))
  return (ambientes || []).map(a => {
    const grupoId = acessoDoGrupo.has(a.grupoId) ? a.grupoId : null
    const acessoId = grupoId ? acessoDoGrupo.get(grupoId) : null
    return a.grupoId === grupoId && a.acessoId === acessoId ? a : { ...a, grupoId, acessoId }
  })
}

/** Ligar `origemId` -> `destinoId` (origem passa a alimentar o destino)
 * fecharia um ciclo? Verdadeiro quando o destino já é a própria origem ou
 * (direta/indiretamente) é alimentado por ela. */
export function criaCicloNoFluxo(acessos, origemId, destinoId) {
  const porId = new Map(acessos.map(a => [a.id, a]))
  const visitados = new Set()
  for (let id = destinoId; id && !visitados.has(id); id = porId.get(id)?.alimentaEm) {
    if (id === origemId) return true
    visitados.add(id)
  }
  return false
}

/** Posições iniciais (em colunas, da esquerda pra direita: grupos ->
 * acessos -> saídas/escadas) pros nós que ainda não têm posição. */
export function layoutFluxo(acessos, grupos, existentes = {}) {
  const porId = new Map(acessos.map(a => [a.id, a]))
  const nivelAcesso = (ac, visitados = new Set()) => {
    if (ehRaiz(ac)) return 0
    const prox = porId.get(ac.alimentaEm)
    if (!prox || visitados.has(ac.id)) return 1
    return nivelAcesso(prox, new Set(visitados).add(ac.id)) + 1
  }
  const nos = [
    ...acessos.map(ac => ({ id: ac.id, nivel: nivelAcesso(ac) })),
    ...grupos.map(g => ({ id: g.id, nivel: porId.has(g.acessoId) ? nivelAcesso(porId.get(g.acessoId)) + 1 : 2 })),
  ]
  const maxNivel = Math.max(0, ...nos.map(n => n.nivel))
  const linhaPorNivel = {}
  const posicoes = {}
  nos.forEach(({ id, nivel }) => {
    const linha = linhaPorNivel[nivel] = (linhaPorNivel[nivel] ?? -1) + 1
    if (!existentes[id]) posicoes[id] = { x: (maxNivel - nivel) * COL_W, y: linha * ROW_H }
  })
  return posicoes
}

/** Fluxo de um pavimento recém-criado: uma saída (piso de descarga) ou
 * escada/rampa, já com um acesso ligado a ela — evita a área de trabalho
 * vazia no primeiro uso. `novoId` gera o id de cada nó. */
export function fluxoPadrao(pisoDescarga, novoId) {
  const raizId = novoId()
  const acessos = [
    { id: raizId, nome: pisoDescarga ? 'Saída 01' : 'Escada/Rampa 01', tipo: pisoDescarga ? 'saida' : 'escada', alimentaEm: null },
    { id: novoId(), nome: 'Acesso 1', tipo: 'acesso', alimentaEm: raizId },
  ]
  return { acessos, grupos: [], fluxoPos: layoutFluxo(acessos, []) }
}

/** Migra um pavimento salvo antes do fluxograma (ou ainda parcial): dá
 * `tipo` explícito a cada nó (congela o que antes dependia de
 * `pisoDescarga`), cria um grupo por acesso que já tinha ambientes ligados
 * direto, sincroniza `acessoId` e completa as posições. Idempotente. */
export function migrarFluxoPavimento(p) {
  const acessos = (p.acessos || []).map(ac => ac.tipo ? ac : { ...ac, tipo: tipoNo(ac, p.pisoDescarga) })
  const grupos = [...(p.grupos || [])]
  const idsGrupo = new Set(grupos.map(g => g.id))
  const idsAcesso = new Set(acessos.map(ac => ac.id))

  const ambientes = (p.ambientes || []).map(a => {
    if (a.grupoId && idsGrupo.has(a.grupoId)) return a
    if (a.acessoId && idsAcesso.has(a.acessoId)) {
      const grupoId = `grp-mig-${a.acessoId}`
      if (!idsGrupo.has(grupoId)) {
        idsGrupo.add(grupoId)
        grupos.push({ id: grupoId, nome: proximoNomeGrupo(grupos), acessoId: a.acessoId })
      }
      return { ...a, grupoId }
    }
    return { ...a, grupoId: null }
  })

  const fluxoPos = { ...(p.fluxoPos || {}), ...layoutFluxo(acessos, grupos, p.fluxoPos || {}) }
  return { ...p, acessos, grupos, ambientes: sincronizarAmbientes(ambientes, grupos, acessos), fluxoPos }
}
