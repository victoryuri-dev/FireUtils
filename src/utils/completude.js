import { medidasObrigatorias } from '../hooks/useMedidasObrigatorias'
import { camposObrigatorios } from '../data/auditoriaProjeto'

// Completude do projeto (0–100): a MESMA conta do dashboard — campos
// obrigatórios da auditoria (auditoriaProjeto.js) preenchidos / total —, para
// o anel dos cards de "Meus projetos" bater com o número de dentro do projeto.
// `state` já hidratado (hydrateState) e normas da UF carregadas.
export function percentualCompletude(state) {
  try {
    const { porEstrutura } = medidasObrigatorias(state)
    const campos = camposObrigatorios(state, porEstrutura)
    if (!campos.length) return 0
    const pendentes = campos.filter(c => c.pendente).length
    return Math.round(((campos.length - pendentes) / campos.length) * 100)
  } catch (erro) {
    console.error('Falha ao calcular a completude do projeto:', erro)
    return 0
  }
}
