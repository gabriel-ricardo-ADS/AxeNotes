import {
  create as createZustandStore,
  type StateCreator,
  type StoreApi,
  type UseBoundStore,
} from 'zustand'

const resets = new Set<() => void>()

/**
 * Cria uma store Zustand já registrada para voltar ao estado inicial no logout (`resetAllStores`).
 * Toda store do app nasce daqui: o ESLint proíbe importar `create`/`createStore` do 'zustand' em
 * outro arquivo, então uma store nova não tem como ficar de fora da limpeza.
 */
export function create<T>(initializer: StateCreator<T>): UseBoundStore<StoreApi<T>> {
  const store = createZustandStore<T>()(initializer)
  resets.add(() => {
    store.setState(store.getInitialState(), true)
  })
  return store
}

/** Devolve todas as stores ao estado inicial (chamado só pela limpeza do logout). */
export function resetAllStores(): void {
  for (const reset of resets) reset()
}
