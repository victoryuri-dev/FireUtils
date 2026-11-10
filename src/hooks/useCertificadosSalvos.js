import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRepositorioCertificados } from '../context/certificados-context'
import { escolherSelecionado } from '../utils/assinaturas/certificadosSalvos'

// O certificado escolhido por último é só uma preferência deste navegador (um id, nada sensível).
const CHAVE = 'fireutils.assinaturas.certificado'
const lerPreferido = () => { try { return localStorage.getItem(CHAVE) } catch { return null } }
const guardarPreferido = id => {
  try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE) } catch { /* sem armazenamento: apenas não lembra */ }
}

/**
 * Certificados A1 salvos na conta e qual deles está selecionado para assinar.
 * Lista só os dados públicos; o arquivo .pfx é baixado por `baixar(id)` quando vai ser usado.
 */
export function useCertificadosSalvos() {
  const repositorio = useRepositorioCertificados()
  const [estado, setEstado] = useState({ carregando: true, erro: null, lista: [] })
  const [preferido, setPreferido] = useState(lerPreferido)

  useEffect(() => {
    let cancelado = false
    repositorio.listar()
      .then(lista => { if (!cancelado) setEstado({ carregando: false, erro: null, lista }) })
      .catch(e => { if (!cancelado) setEstado({ carregando: false, erro: e.message, lista: [] }) })
    return () => { cancelado = true }
  }, [repositorio])

  const selecionadoId = useMemo(() => escolherSelecionado(estado.lista, preferido), [estado.lista, preferido])
  const selecionado = estado.lista.find(c => c.id === selecionadoId) ?? null

  const selecionar = useCallback(id => { setPreferido(id); guardarPreferido(id) }, [])

  const adicionar = useCallback(async dados => {
    const novo = await repositorio.salvar(dados)
    setEstado(e => ({ ...e, lista: [...e.lista, novo] }))
    selecionar(novo.id)
    return novo
  }, [repositorio, selecionar])

  const remover = useCallback(async id => {
    await repositorio.remover(id)
    setEstado(e => ({ ...e, lista: e.lista.filter(c => c.id !== id) }))
  }, [repositorio])

  const baixar = useCallback(id => repositorio.baixar(id), [repositorio])

  return { ...estado, selecionadoId, selecionado, selecionar, adicionar, remover, baixar }
}
