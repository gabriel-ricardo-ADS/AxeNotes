import { createContext } from 'react'

/** Como abrir o menu do bloco. */
export interface BlockMenuOpenOptions {
  /** Abre direto numa subtela ("Transformar em" da barra do toque). */
  view?: 'transform'
  /**
   * Veio de um toque (barra ou alça do iPad): o teclado fecha antes do bottom sheet abrir e, ao fechar, o
   * foco não volta sozinho ao editor (o iOS só reabre o teclado com um gesto; o próximo toque reabre).
   */
  fromTouch?: boolean
}

/** Abre o menu do bloco ancorado num elemento (o editor da página fornece; a alça ⋮⋮ usa). */
export const OpenBlockMenuContext = createContext<
  ((blockId: string, anchor: HTMLElement, options?: BlockMenuOpenOptions) => void) | null
>(null)
