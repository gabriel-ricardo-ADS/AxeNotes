import { createContext } from 'react'

/**
 * Faixa no topo da área de conteúdo: no desktop é uma barra acima da página; no mobile é o
 * cabeçalho do ☰. A tela da página coloca o breadcrumb nela por um portal (TopBarPortal).
 */
export const TopBarSlotContext = createContext<HTMLElement | null>(null)
