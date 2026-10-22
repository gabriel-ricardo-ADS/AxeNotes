import { DESKTOP_QUERY } from '@/app/layout/AppLayout'

/**
 * O jsdom não tem `matchMedia`. Instala um stub em que só DESKTOP_QUERY responde à largura
 * simulada; devolve `setDesktop` para trocar de viewport e notificar quem está ouvindo.
 */
export function installMatchMedia(initialDesktop: boolean) {
  let desktop = initialDesktop
  /** Cada listener com a consulta que ele ouve (o evento leva o `matches` dela, como no navegador). */
  const listeners = new Map<EventListenerOrEventListenerObject, string>()
  const matches = (query: string) => query === DESKTOP_QUERY && desktop

  window.matchMedia = (query: string): MediaQueryList => {
    return {
      get matches() {
        return matches(query)
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(listener, query)
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener)
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  }

  return {
    setDesktop(value: boolean) {
      desktop = value
      listeners.forEach((query, listener) => {
        const event = Object.assign(new Event('change'), { matches: matches(query), media: query })
        if (typeof listener === 'function') listener(event)
        else listener.handleEvent(event)
      })
    },
  }
}
