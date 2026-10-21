import { create } from '@/lib/create-store'

interface TreeUiState {
  /** De quem é o estado abaixo; se o usuário mudar, tudo é zerado (nada vaza entre contas). */
  ownerId: string | null
  expanded: ReadonlySet<string>
  /** Página sendo renomeada na própria árvore. */
  renamingId: string | null
  /** Aviso de erro da árvore (pt-BR), dispensável. */
  notice: string | null
  bindUser: (userId: string | undefined) => void
  toggle: (id: string) => void
  expand: (id: string) => void
  startRename: (id: string) => void
  stopRename: () => void
  setNotice: (message: string | null) => void
}

const empty = { ownerId: null, expanded: new Set<string>(), renamingId: null, notice: null }

/**
 * Estado só de interface da árvore. Fica em memória e NÃO é persistido (sem localStorage): a
 * expansão volta ao recolhido ao recarregar. O logout devolve a store ao estado inicial
 * (`resetClientState`); o `ownerId` ainda protege a troca de conta sem logout no meio.
 */
export const useTreeUiStore = create<TreeUiState>((set, get) => ({
  ...empty,
  bindUser: (userId) => {
    const next = userId ?? null
    if (get().ownerId !== next) set({ ...empty, expanded: new Set<string>(), ownerId: next })
  },
  toggle: (id) => {
    const expanded = new Set(get().expanded)
    if (expanded.has(id)) expanded.delete(id)
    else expanded.add(id)
    set({ expanded })
  },
  expand: (id) => {
    if (get().expanded.has(id)) return
    set({ expanded: new Set(get().expanded).add(id) })
  },
  startRename: (id) => {
    set({ renamingId: id })
  },
  stopRename: () => {
    set({ renamingId: null })
  },
  setNotice: (message) => {
    set({ notice: message })
  },
}))
