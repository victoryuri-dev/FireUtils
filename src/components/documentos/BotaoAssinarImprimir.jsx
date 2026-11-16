import { lazy, Suspense, useState } from 'react'
import { importarOuRecarregar } from '../../lib/recarregarPorVersao'
import Icon from '../ui/Icon'

// Carregada só quando alguém clica: traz o PDF, o certificado e a assinatura (bibliotecas pesadas).
const ModalAssinarDocumento = lazy(() => importarOuRecarregar(() => import('./ModalAssinarDocumento')))

/**
 * Botão "Assinar e imprimir" da barra do documento. `coletar()` devolve `{ folhas, bloco, nome }`
 * lidos da tela no momento da assinatura (as folhas A4 da pré-visualização e o bloco de assinatura).
 */
export default function BotaoAssinarImprimir({ coletar }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setAberto(true)} title="Gera o PDF, assina digitalmente com o certificado A1 e abre para imprimir">
        <Icon name="signature" size={13}/> Assinar e imprimir
      </button>
      {aberto && (
        <Suspense fallback={null}>
          <ModalAssinarDocumento coletar={coletar} onFechar={() => setAberto(false)}/>
        </Suspense>
      )}
    </>
  )
}
