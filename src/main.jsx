import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { recarregarPorVersao } from './lib/recarregarPorVersao'

// Versão nova publicada com a aba aberta: os arquivos antigos somem e o carregamento falha.
// Recarrega a página uma vez (ver lib/recarregarPorVersao.js); `lazy` usa importarOuRecarregar.
window.addEventListener('vite:preloadError', e => {
  if (recarregarPorVersao()) e.preventDefault()
})
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </StrictMode>
)