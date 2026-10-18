import { useEffect } from 'react'

/**
 * Publica a área realmente visível (acima do teclado virtual) em `--vv-top` e `--vv-height` no elemento.
 * O Safari do iOS NÃO redimensiona o viewport do layout quando o teclado abre: só o `visualViewport` muda.
 * Sem suporte à API, as variáveis não são definidas e o CSS cai nos valores de `dvh`.
 */
export function useVisualViewport(element: HTMLElement | null, active: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!element || !active || !viewport) return
    const update = () => {
      element.style.setProperty('--vv-top', `${String(viewport.offsetTop)}px`)
      element.style.setProperty('--vv-height', `${String(viewport.height)}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      element.style.removeProperty('--vv-top')
      element.style.removeProperty('--vv-height')
    }
  }, [element, active])
}
