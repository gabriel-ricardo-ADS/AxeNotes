import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@/styles/index.css'
import { App } from '@/app/App'
import { reloadOnChunkError } from '@/lib/chunk-reload'

// O preload do Vite avisa aqui quando um chunk (JS ou CSS) não carrega. Sem preventDefault: o erro
// segue para o `lazyWithReload`, que fica em suspenso enquanto a página recarrega.
window.addEventListener('vite:preloadError', (event) => {
  reloadOnChunkError(event.payload)
})

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
