import { useEffect } from 'react'
import type { AxnEditor } from '@/features/editor/schema'
import {
  bottomInset,
  cursorScrollDelta,
  findScrollParent,
} from '@/features/editor/touch/touch-editor'
import { readViewportBox } from '@/features/editor/touch/use-visual-viewport-box'

/** O painel "/" do toque (popover do BlockNote com a classe do touch-slash). */
const SLASH_PANEL = '.axn-touch-slash'

/**
 * Com a barra do toque à vista, o cursor nunca fica atrás dela, do painel "/" ou do teclado:
 * - `scroll-padding-bottom` no container que rola (o `<main>`) = barra + painel;
 * - espaço extra no fim do editor (`bottomInset`), recalculado só quando a barra ou o painel mudam de
 *   altura, quando ele abre/fecha e no `resize` do `visualViewport` — nunca no `scroll` dele;
 * - a cada mudança de seleção ou de conteúdo, no `resize` e quando o que está acima do editor muda de altura,
 *   rola só o que falta (`cursorScrollDelta`).
 * Ao sair (teclado fechou, barra sumiu), tira tudo o que pôs.
 */
export function useKeepCursorVisible(
  editor: AxnEditor,
  options: {
    active: boolean
    section: HTMLElement | null
    dockHeight: number
    slashOpen: boolean
  },
): void {
  const { active, section, dockHeight, slashOpen } = options

  useEffect(() => {
    if (!active || !section) return
    const scroller = findScrollParent(section)
    const slashHeight = () =>
      slashOpen ? (document.querySelector(SLASH_PANEL)?.getBoundingClientRect().height ?? 0) : 0
    const covered = () => dockHeight + slashHeight()

    const applyInset = () => {
      const inset = bottomInset(readViewportBox(), covered())
      section.style.setProperty('padding-bottom', `${String(inset)}px`)
      scroller.style.setProperty('scroll-padding-bottom', `${String(covered())}px`)
    }

    let frame = 0
    const reveal = () => {
      cancelAnimationFrame(frame)
      // Depois do scroll do próprio ProseMirror.
      frame = requestAnimationFrame(() => {
        let caretBottom: number
        try {
          const view = editor.prosemirrorView
          caretBottom = view.coordsAtPos(view.state.selection.head).bottom
        } catch {
          return
        }
        const delta = cursorScrollDelta({
          caretBottom,
          area: readViewportBox(),
          coveredBottom: covered(),
        })
        if (delta > 0) scroller.scrollBy({ top: delta })
      })
    }
    const onResize = () => {
      applyInset()
      reveal()
    }

    applyInset()
    reveal()
    const stopSelection = editor.onSelectionChange(reveal)
    const stopChange = editor.onChange(reveal)
    window.visualViewport?.addEventListener('resize', onResize)
    window.addEventListener('resize', onResize)

    // O painel "/" nasce depois deste efeito e muda de altura com o filtro: acompanha pelo tamanho dele.
    // O que fica acima do editor pode mudar de altura depois (a linha "Editada há… / Salvando…" quebra e
    // empurra o texto): sem evento de seleção nem de resize. Só a rolagem é refeita (o espaço não muda).
    const contentObserver = new ResizeObserver(reveal)
    if (section.parentElement) contentObserver.observe(section.parentElement)

    let panelObserver: ResizeObserver | null = null
    const watchPanel = requestAnimationFrame(() => {
      const panel = slashOpen ? document.querySelector(SLASH_PANEL) : null
      if (!panel) return
      panelObserver = new ResizeObserver(onResize)
      panelObserver.observe(panel)
    })

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(watchPanel)
      panelObserver?.disconnect()
      contentObserver.disconnect()
      stopSelection()
      stopChange()
      window.visualViewport?.removeEventListener('resize', onResize)
      window.removeEventListener('resize', onResize)
      section.style.removeProperty('padding-bottom')
      scroller.style.removeProperty('scroll-padding-bottom')
    }
  }, [editor, active, section, dockHeight, slashOpen])
}
