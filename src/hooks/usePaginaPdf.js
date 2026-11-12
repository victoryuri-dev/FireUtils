import { useEffect, useState } from 'react'
import { carregarPdf, geometriaDaPagina, molduraDaPagina } from '../lib/pdfjs'
import { indiceDaPagina } from '../utils/assinaturas/geometria'

/**
 * Abre o PDF e devolve a página escolhida pelo grupo (última, primeira ou nº).
 * `ativo=false` adia o carregamento (miniaturas fora da tela).
 *
 * @returns {{ status: 'inativo'|'carregando'|'ok'|'sem-pagina'|'erro',
 *             pagina?, geometria?, total?, erro? }}
 */
export function usePaginaPdf(arquivo, escolha, ativo = true) {
  const [resultado, setResultado] = useState({ chave: null, dados: null })
  const modo = escolha.modo
  const numero = escolha.numero
  const chave = ativo && arquivo ? `${modo}|${numero}` : null

  useEffect(() => {
    if (!chave) return undefined
    let cancelado = false
    carregarPdf(arquivo)
      .then(async doc => {
        const indice = indiceDaPagina({ modo, numero }, doc.numPages)
        if (indice < 0) return { status: 'sem-pagina', total: doc.numPages }
        const pagina = await doc.getPage(indice + 1)
        const moldura = await molduraDaPagina(pagina)
        return { status: 'ok', pagina, geometria: { ...geometriaDaPagina(pagina), moldura }, total: doc.numPages }
      })
      .catch(erro => ({ status: 'erro', erro }))
      .then(dados => { if (!cancelado) setResultado({ arquivo, chave, dados }) })
    return () => { cancelado = true }
  }, [arquivo, chave, modo, numero])

  if (!chave) return { status: 'inativo' }
  // Resultado de outro arquivo/página ainda em tela: está carregando de novo.
  if (resultado.arquivo !== arquivo || resultado.chave !== chave || !resultado.dados) return { status: 'carregando' }
  return resultado.dados
}
