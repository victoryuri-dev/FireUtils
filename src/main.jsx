import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Depois de um novo deploy, uma aba aberta com a versão antiga procura arquivos (chunks) que não
// existem mais e o carregamento falha. Recarrega a página uma vez para pegar a versão nova; se
// falhar de novo logo em seguida (problema real), não entra em laço e deixa o erro aparecer.
window.addEventListener('vite:preloadError', e => {
  const CHAVE = 'fireutils.recarregou-por-versao'
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) || 0)
    if (Date.now() - ultima < 30000) return
    sessionStorage.setItem(CHAVE, String(Date.now()))
  } catch { /* sem sessionStorage: recarrega mesmo assim, uma vez por falha */ }
  e.preventDefault()
  window.location.reload()
})
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </StrictMode>
)