// se_fluxo.js — dados do fluxograma de saídas (Ambientes -> Acessos ->
// Saída/Escada) de um pavimento: box de ambientes (`grupos`), posição dos
// nós na área de trabalho (`fluxoPos`) e migração dos pavimentos salvos
// antes do fluxograma existir. Funções puras, sem React — o cálculo em si
// continua em se_calc.js.
//
//   pavimento.grupos   = [{ id, nome, acessoId: string|null }]
//     -- box de ambientes: agrupa ambientes e liga o conjunto a UM nó
//        (acesso/saída/escada). `acessoId` null = box ainda sem ligação.
//   ambiente.grupoId   : string|null   -- box em que o ambiente está.
//   ambiente.acessoId  : string|null   -- sempre igual ao `acessoId` do box
//        (o reducer mantém sincronizado, ver sincronizarAmbientes) — é o que
//        o motor de cálculo e o memorial leem.
//   pavimento.fluxoPos = { [idDoNo]: { x, y } }
//     -- posição de cada box e de cada acesso/saída/escada na área de trabalho.

import { ehRaiz, tipoNo } from './se_calc'

export const COL_W = 400
export const ROW_H = 220

/** Mantém `ambiente.acessoId` igual ao do box em que ele está — ambiente
 * fora de qualquer box (ou em box sem ligação) fica com acessoId null.
 * Box que aponta pra um acesso que não existe mais também é desligado. */
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

/** Posições iniciais (em colunas, da esquerda pra direita: boxes ->
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
 * `pisoDescarga`), cria um box por acesso que já tinha ambientes ligados
 * direto, sincroniza `acessoId` e completa as posições. Idempotente. */
export function migrarFluxoPavimento(p) {
  const acessos = (p.acessos || []).map(ac => ac.tipo ? ac : { ...ac, tipo: tipoNo(ac, p.pisoDescarga) })
  const grupos = [...(p.grupos || [])]
  const idsGrupo = new Set(grupos.map(g => g.id))
  const nomePorAcesso = new Map(acessos.map(ac => [ac.id, ac.nome]))

  const ambientes = (p.ambientes || []).map(a => {
    if (a.grupoId && idsGrupo.has(a.grupoId)) return a
    if (a.acessoId && nomePorAcesso.has(a.acessoId)) {
      const grupoId = `grp-mig-${a.acessoId}`
      if (!idsGrupo.has(grupoId)) {
        idsGrupo.add(grupoId)
        grupos.push({ id: grupoId, nome: `Ambientes — ${nomePorAcesso.get(a.acessoId)}`, acessoId: a.acessoId })
      }
      return { ...a, grupoId }
    }
    return { ...a, grupoId: null }
  })

  const fluxoPos = { ...(p.fluxoPos || {}), ...layoutFluxo(acessos, grupos, p.fluxoPos || {}) }
  return { ...p, acessos, grupos, ambientes: sincronizarAmbientes(ambientes, grupos, acessos), fluxoPos }
}
