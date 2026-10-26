import { createContext } from 'react'

/** Abre o menu do bloco ancorado num elemento (o editor da página fornece; a alça ⋮⋮ usa). */
export const OpenBlockMenuContext = createContext<
  ((blockId: string, anchor: HTMLElement) => void) | null
>(null)
