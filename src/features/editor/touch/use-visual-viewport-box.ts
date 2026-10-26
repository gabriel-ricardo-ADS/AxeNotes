import { useCallback, useSyncExternalStore } from 'react'
import { isZoomed } from '@/features/editor/touch/touch-editor'

/** A área visível (acima do teclado no iOS) na referência do viewport do layout, mais a escala. */
export interface ViewportBox {
  offsetTop: number
  offsetLeft: number
  width: number
  height: number
  scale: number
  /** Altura do viewport do layout (`innerHeight`): no iOS não encolhe com o teclado. */
  layoutHeight: number
}

/** Lê o `visualViewport` agora (sem a API: a janela inteira, como o fallback do BlockNote). */
export function readViewportBox(): ViewportBox {
  const viewport = window.visualViewport
  return {
    offsetTop: viewport?.offsetTop ?? 0,
    offsetLeft: viewport?.offsetLeft ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    scale: viewport?.scale ?? 1,
    layoutHeight: window.innerHeight,
  }
}

function subscribe(notify: () => void, events: readonly ('resize' | 'scroll')[]) {
  const viewport = window.visualViewport
  for (const event of events) viewport?.addEventListener(event, notify)
  window.addEventListener('resize', notify)
  return () => {
    for (const event of events) viewport?.removeEventListener(event, notify)
    window.removeEventListener('resize', notify)
  }
}

let cached: ViewportBox | null = null
let cachedKey = ''

/** Mesmo objeto enquanto os números não mudam (o `useSyncExternalStore` exige snapshot estável). */
function snapshot(): ViewportBox {
  const box = readViewportBox()
  const key = Object.values(box).join(',')
  if (key !== cachedKey || cached === null) {
    cached = box
    cachedKey = key
  }
  return cached
}

/**
 * A área visível, atualizada no `resize` e no `scroll` do `visualViewport` (o painel "/" acompanha o
 * Safari quando ele desloca a página). Desligado (`active` false), não escuta nada e devolve null.
 */
export function useViewportBox(active: boolean): ViewportBox | null {
  const subscribeBox = useCallback(
    (notify: () => void) => (active ? subscribe(notify, ['resize', 'scroll']) : () => undefined),
    [active],
  )
  const box = useSyncExternalStore(subscribeBox, snapshot, () => null)
  return active ? box : null
}

/** Há zoom de pinça? Só re-renderiza quando a resposta muda. */
export function useZoomed(): boolean {
  return useSyncExternalStore(
    useCallback((notify: () => void) => subscribe(notify, ['resize']), []),
    () => isZoomed(window.visualViewport?.scale ?? 1),
    () => false,
  )
}
