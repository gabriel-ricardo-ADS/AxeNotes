import { create } from 'zustand'

interface SearchState {
  open: boolean
  /** O que está digitado (sem normalizar). Some ao fechar: a busca não guarda histórico. */
  term: string
  /** Elemento que tinha o foco quando a busca abriu; o foco volta para ele ao fechar. */
  opener: HTMLElement | null
  /** Sobe a cada resultado aberto: o mobile fecha a gaveta que ficou por baixo. */
  pickCount: number
  openSearch: (opener?: HTMLElement | null) => void
  closeSearch: () => void
  setTerm: (term: string) => void
  notifyPick: () => void
}

/**
 * Estado só de interface da busca (em memória, sem localStorage). Mora numa store, e não no componente,
 * porque o botão da sidebar, o da gaveta e o atalho abrem o MESMO diálogo, montado uma vez no layout.
 */
export const useSearchStore = create<SearchState>((set, get) => ({
  open: false,
  term: '',
  opener: null,
  pickCount: 0,
  openSearch: (opener) => {
    if (get().open) return
    // O Safari não dá foco ao botão tocado, então quem abre pode (e deve) dizer qual é o elemento.
    const active = document.activeElement
    const from = opener ?? (active instanceof HTMLElement ? active : null)
    set({ open: true, term: '', opener: from })
  },
  closeSearch: () => {
    set({ open: false, term: '' })
  },
  setTerm: (term) => {
    set({ term })
  },
  notifyPick: () => {
    set({ pickCount: get().pickCount + 1 })
  },
}))
