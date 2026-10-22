import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { reloadOnChunkError, type ReloadDeps } from '@/lib/chunk-reload'

/**
 * `React.lazy` que, se o chunk não carregar (deploy novo, chunk antigo sumiu), recarrega a página
 * uma vez e fica em suspenso até a recarga. Qualquer outro erro, ou uma segunda falha logo depois
 * da recarga, segue para o error boundary.
 */
export function lazyWithReload<T extends ComponentType>(
  factory: () => Promise<{ default: T }>,
  deps?: ReloadDeps,
): LazyExoticComponent<T>
/** Mesma coisa para um componente com props (ex.: o editor da página). */
export function lazyWithReload<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
  deps?: ReloadDeps,
): LazyExoticComponent<ComponentType<P>>
export function lazyWithReload<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
  deps?: ReloadDeps,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() =>
    factory().catch((error: unknown) => {
      if (reloadOnChunkError(error, deps)) return new Promise<never>(() => undefined)
      throw error
    }),
  )
}
