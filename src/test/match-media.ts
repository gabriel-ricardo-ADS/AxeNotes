import { DESKTOP_QUERY } from '@/app/layout/AppLayout'

type Listener = () => void

/**
 * O jsdom não tem `matchMedia`. Instala um stub em que só DESKTOP_QUERY responde à largura
 * simulada; devolve `setDesktop` para trocar de viewport e notificar quem está ouvindo.
 */
export function installMatchMedia(initialDesktop: boolean) {
  let desktop = initialDesktop
  const listeners = new Set<Listener>()

  window.matchMedia = (query: string): MediaQueryList => {
    return {
      get matches() {
        return query === DESKTOP_QUERY && desktop
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.add(listener as Listener)
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener as Listener)
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  }

  return {
    setDesktop(value: boolean) {
      desktop = value
      listeners.forEach((listener) => {
        listener()
      })
    },
  }
}
