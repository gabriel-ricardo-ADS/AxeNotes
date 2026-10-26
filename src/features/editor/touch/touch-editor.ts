// Regras puras do editor no toque (barra acima do teclado, painéis, alça do iPad, cursor visível).
// Os componentes ficam em TouchToolbar.tsx e TouchBlockHandle.tsx. Ver docs/CODEMAP.md §3.16.
import type { MouseEvent } from 'react'

/** O que decide se a barra acima do teclado aparece. */
export interface TouchBarState {
  /** Ponteiro grosso: `(pointer: coarse)`. */
  touch: boolean
  /** Teclado virtual aberto (`useVirtualKeyboard` do BlockNote). */
  keyboardOpen: boolean
  /** Editor focado, contando a UI dele (barra, painéis). */
  focused: boolean
  /** Leitor e página na lixeira: false. */
  editable: boolean
  /** Menu do bloco, seletor de emoji ou seletor de página abertos. */
  modalOpen: boolean
  /** Zoom de pinça ativo. */
  zoomed: boolean
}

/** A barra mostra quando há toque, teclado aberto, foco no editor editável, sem modal e sem zoom. */
export function shouldShowTouchBar(state: TouchBarState): boolean {
  return (
    state.touch &&
    state.keyboardOpen &&
    state.focused &&
    state.editable &&
    !state.modalOpen &&
    !state.zoomed
  )
}

/** Zoom de pinça: a escala do `visualViewport` saiu de 1 (com folga para arredondamento). */
export function isZoomed(scale: number): boolean {
  return Math.abs(scale - 1) > 0.01
}

/**
 * Para onde o botão "Tarefa" leva o bloco: checklist volta a texto; qualquer outro bloco com texto vira
 * checklist (uma lista com marcadores também; "Tarefa" de novo dá texto, não a lista de antes). Bloco
 * sem texto (divisor, tabela, link de página): nenhum.
 */
export function checklistToggleTarget(
  type: string,
  content: string,
): 'paragraph' | 'checkListItem' | null {
  if (type === 'checkListItem') return 'paragraph'
  return content === 'inline' ? 'checkListItem' : null
}

/**
 * Props de um botão da barra, dos painéis e da alça: o toque não tira o foco do editor (nem fecha o
 * teclado). O foco muda no `mousedown` (o de compatibilidade que o toque gera), então é ele que é
 * cancelado. No `pointerdown` não: no WebKit isso cancela o toque inteiro e o `click` nunca chega. O
 * `preventFocusOnTap` do BlockNote faz o mesmo só quando o `isTouchDevice` dele (que exige
 * `maxTouchPoints`) diz que é toque e, fora disso, foca o botão no Safari; aqui o botão só existe no toque.
 */
export const KEEP_EDITOR_FOCUS = {
  onMouseDown: (event: MouseEvent) => {
    event.preventDefault()
  },
}
