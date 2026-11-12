// utils/assinaturas/grupos.js — estado da ferramenta de assinaturas.
//
// Um GRUPO reúne PDFs que são assinados no mesmo lugar: o campo (posição,
// tamanho, página) é configurado uma vez no grupo e vale para todos os
// arquivos dele. Todo arquivo pertence a exatamente um grupo.
//
// Reducer puro, sem efeitos: quem chama gera os ids (ver `novoId`) e passa os
// objetos File já prontos. Os PDFs ficam só na memória do navegador.

import { CAMPO_PADRAO } from './geometria.js'
import { SELO_PADRAO } from './selo.js'

export function novoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function novoGrupo(id, nome) {
  return { id, nome, campo: { ...CAMPO_PADRAO }, pagina: { modo: 'ultima', numero: 1 }, selo: { ...SELO_PADRAO } }
}

export function estadoInicial(idGrupo = novoId()) {
  return {
    grupos: [novoGrupo(idGrupo, 'Grupo 1')],
    arquivos: [],             // { id, nome, tamanho, grupoId, arquivo: File }
    grupoAtivoId: idGrupo,
    selecionados: [],         // ids de arquivos marcados na lista (para mover)
  }
}

const grupoExiste = (state, id) => state.grupos.some(g => g.id === id)

export function reducer(state, action) {
  switch (action.type) {
    case 'ADICIONAR_ARQUIVOS': {
      // Só PDFs; novos arquivos entram no grupo ativo (ou no indicado).
      const grupoId = grupoExiste(state, action.grupoId) ? action.grupoId : state.grupoAtivoId
      // O mesmo arquivo (nome + tamanho) enviado duas vezes é ignorado.
      const jaTem = new Set(state.arquivos.map(a => `${a.nome}|${a.tamanho}`))
      const novos = []
      for (const a of action.arquivos) {
        if (!a.nome || !/\.pdf$/i.test(a.nome)) continue
        const chave = `${a.nome}|${a.tamanho}`
        if (jaTem.has(chave)) continue
        jaTem.add(chave)
        novos.push({ ...a, grupoId })
      }
      if (!novos.length) return state
      return { ...state, arquivos: [...state.arquivos, ...novos] }
    }

    case 'REMOVER_ARQUIVOS': {
      const ids = new Set(action.ids)
      return {
        ...state,
        arquivos: state.arquivos.filter(a => !ids.has(a.id)),
        selecionados: state.selecionados.filter(id => !ids.has(id)),
      }
    }

    case 'MOVER_ARQUIVOS': {
      if (!grupoExiste(state, action.grupoId)) return state
      const ids = new Set(action.ids)
      return {
        ...state,
        arquivos: state.arquivos.map(a => (ids.has(a.id) ? { ...a, grupoId: action.grupoId } : a)),
        selecionados: [],
      }
    }

    case 'ALTERNAR_SELECAO': {
      const tem = state.selecionados.includes(action.id)
      return {
        ...state,
        selecionados: tem ? state.selecionados.filter(id => id !== action.id) : [...state.selecionados, action.id],
      }
    }

    case 'SELECIONAR_TODOS_DO_GRUPO': {
      const ids = state.arquivos.filter(a => a.grupoId === action.grupoId).map(a => a.id)
      return { ...state, selecionados: ids }
    }

    case 'LIMPAR_SELECAO':
      return { ...state, selecionados: [] }

    case 'CRIAR_GRUPO': {
      // O novo grupo nasce com o campo do grupo ativo: o caso comum é "quase
      // igual, só muda um pouco".
      const base = state.grupos.find(g => g.id === state.grupoAtivoId)
      const grupo = {
        ...novoGrupo(action.id, action.nome || `Grupo ${state.grupos.length + 1}`),
        ...(base ? { campo: { ...base.campo }, pagina: { ...base.pagina }, selo: { ...base.selo } } : {}),
      }
      return { ...state, grupos: [...state.grupos, grupo], grupoAtivoId: grupo.id }
    }

    case 'RENOMEAR_GRUPO': {
      const nome = String(action.nome ?? '').trim().slice(0, 60)
      if (!nome) return state
      return { ...state, grupos: state.grupos.map(g => (g.id === action.id ? { ...g, nome } : g)) }
    }

    case 'REMOVER_GRUPO': {
      // Nunca fica sem grupo; os arquivos vão para o grupo vizinho.
      if (state.grupos.length <= 1 || !grupoExiste(state, action.id)) return state
      const indice = state.grupos.findIndex(g => g.id === action.id)
      const restantes = state.grupos.filter(g => g.id !== action.id)
      const destino = restantes[Math.max(0, indice - 1)]
      return {
        ...state,
        grupos: restantes,
        arquivos: state.arquivos.map(a => (a.grupoId === action.id ? { ...a, grupoId: destino.id } : a)),
        grupoAtivoId: state.grupoAtivoId === action.id ? destino.id : state.grupoAtivoId,
      }
    }

    case 'SELECIONAR_GRUPO':
      return grupoExiste(state, action.id) ? { ...state, grupoAtivoId: action.id } : state

    case 'DEFINIR_CAMPO':
      // `campo` parcial: mescla com o atual.
      return {
        ...state,
        grupos: state.grupos.map(g => (g.id === action.id ? { ...g, campo: { ...g.campo, ...action.campo } } : g)),
      }

    case 'DEFINIR_SELO':
      // `selo` parcial: mescla com o atual.
      return {
        ...state,
        grupos: state.grupos.map(g => (g.id === action.id ? { ...g, selo: { ...g.selo, ...action.selo } } : g)),
      }

    case 'DEFINIR_PAGINA':
      return {
        ...state,
        grupos: state.grupos.map(g => (g.id === action.id ? { ...g, pagina: { ...g.pagina, ...action.pagina } } : g)),
      }

    default:
      return state
  }
}

// ── Seletores ─────────────────────────────────────────────────────────

export const grupoAtivo = state => state.grupos.find(g => g.id === state.grupoAtivoId)
export const arquivosDoGrupo = (state, grupoId) => state.arquivos.filter(a => a.grupoId === grupoId)

/** Tamanho legível em KB/MB (pt-BR). */
export function formatarTamanho(bytes) {
  if (!(bytes >= 0)) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
