import { useEffect } from 'react'
import { detectMac, hasForeignModal, isSearchShortcut } from '@/features/search/search'
import { useSearchStore } from '@/features/search/search-store'

/**
 * Abre a busca com Ctrl+K (Windows/Linux) ou ⌘K (Mac) em qualquer tela do app. Regras:
 * - `preventDefault` sempre que o atalho vale, para não cair na barra de busca/endereço do navegador;
 * - evento já tratado por outro (`defaultPrevented`, ex.: o "criar link" do editor, Fase 2) é ignorado;
 * - com outro diálogo aberto (Mover para…, ícone, excluir) não abre nada por cima;
 * - com a própria busca aberta, só volta o foco ao campo e seleciona o texto;
 * - campo de texto com foco (ex.: o título da página) NÃO impede: Ctrl+K não digita nada.
 */
export function useSearchShortcut() {
  useEffect(() => {
    const isMac = detectMac(navigator)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSearchShortcut(event, isMac)) return
      event.preventDefault()
      const { open, openSearch } = useSearchStore.getState()
      if (open) {
        const input = document.querySelector<HTMLInputElement>('[data-search-input]')
        input?.focus()
        input?.select()
        return
      }
      if (hasForeignModal(document)) return
      openSearch()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
