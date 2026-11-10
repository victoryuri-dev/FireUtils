import { createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'
import { criarRepositorioSupabase } from '../lib/certificadosRepo'

// Permite injetar outro repositório (testes); sem provedor, usa o Supabase.
export const CertificadosRepoContext = createContext(null)

let padrao = null

export function useRepositorioCertificados() {
  const injetado = useContext(CertificadosRepoContext)
  if (injetado) return injetado
  padrao ??= criarRepositorioSupabase(supabase)
  return padrao
}
