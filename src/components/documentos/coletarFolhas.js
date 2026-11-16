// Lê da tela as folhas do documento aberto e o bloco de assinatura (para "Assinar e imprimir").
import { escolherBlocoDeAssinatura } from '../../lib/documentoPdf'

/** Memoriais paginados pelo Paged.js (Descritivo e PB): várias folhas A4 e o bloco do responsável técnico. */
export function coletarMemorial(nome) {
  const area = document.querySelector('.print-area-memorial')
  const folhas = area ? [...area.querySelectorAll('.pagedjs_page')] : []
  // Só blocos DENTRO das folhas (o conteúdo-fonte, escondido, tem uma cópia que não conta).
  const blocos = folhas.flatMap(f => [...f.querySelectorAll('.assinatura-no-fim')])
  return { folhas, bloco: escolherBlocoDeAssinatura(blocos), nome }
}

/** Anexo B: uma folha só; a assinatura do responsável técnico é a primeira das duas linhas do rodapé. */
export function coletarAnexoB(nome) {
  const folha = document.querySelector('.print-area-anexob')
  return { folhas: folha ? [folha] : [], bloco: folha?.querySelector('.anexob-signatures > div') ?? null, nome }
}
