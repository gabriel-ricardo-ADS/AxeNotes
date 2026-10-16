/** Rotas da tela da página e o aviso "foque o título" que a criação de página manda junto. */
export const pagePath = (pageId: string): string => `/p/${pageId}`

export const FOCUS_TITLE_STATE = { focusTitle: true } as const

export function wantsTitleFocus(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'focusTitle' in state &&
    state.focusTitle === true
  )
}
