import { useEffect } from 'react'

// Caixa de confirmação do próprio site (no lugar do window.confirm do
// navegador). Fecha com Esc ou clicando fora; o botão de confirmar já vem
// focado, então Enter confirma.
// `perigo`: o botão de confirmar fica vermelho (ação destrutiva).
export default function ConfirmacaoModal({ titulo, texto, rotuloConfirmar = 'Confirmar', rotuloCancelar = 'Cancelar', perigo = false, onConfirmar, onCancelar }) {
  useEffect(() => {
    const aoTeclar = e => { if (e.key === 'Escape') onCancelar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onCancelar])

  return (
    // stopPropagation: este overlay pode ficar dentro de outro popup — sem isso o
    // clique borbulha e fecha os dois.
    <div className="fixed inset-0 z-[700] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); onCancelar() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmacao-titulo" onClick={e => e.stopPropagation()}
        className="bg-surface border border-solid border-border rounded-lg w-[440px] max-w-full p-5 shadow-[0_24px_64px_rgba(0,0,0,.55)]">
        <div id="confirmacao-titulo" className="font-heading text-base font-bold text-ink mb-2">{titulo}</div>
        <div className="text-[13px] text-ink-muted leading-[1.6] mb-5">{texto}</div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancelar}>{rotuloCancelar}</button>
          <button type="button" autoFocus onClick={onConfirmar}
            className={perigo
              ? 'inline-flex items-center gap-1.5 bg-red border border-solid border-red text-white cursor-pointer text-xs font-semibold rounded-md py-2 px-4 hover:opacity-90 transition-opacity'
              : 'btn-primary'}>
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
