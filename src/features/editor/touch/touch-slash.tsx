import { SuggestionMenuController, type FloatingUIOptions } from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { useMemo } from 'react'
import { slashPanelRect, type VisibleArea } from '@/features/editor/touch/touch-editor'
import { useViewportBox } from '@/features/editor/touch/use-visual-viewport-box'

type Middleware = NonNullable<
  NonNullable<FloatingUIOptions['useFloatingOptions']>['middleware']
>[number]

/**
 * Middleware do floating-ui que põe o menu em cima da barra (`slashPanelRect`). Os números vão em
 * `options`: o `useFloating` compara o middleware por valor, então cada mudança da área visível (resize
 * e scroll do `visualViewport`, que re-renderizam quem usa `useViewportBox`) reposiciona o menu; o
 * `autoUpdate` sozinho não escuta o `visualViewport`.
 */
function aboveTouchBar(area: VisibleArea, dockHeight: number): Middleware {
  return {
    name: 'axnAboveTouchBar',
    options: { ...area, dockHeight },
    fn: ({ rects }) => {
      const rect = slashPanelRect(area, dockHeight, rects.floating.height)
      return { x: rect.x, y: rect.y }
    },
  }
}

/** Opções do popover do "/" no toque: painel inferior não modal, na largura da tela, acima da barra. */
function touchSlashOptions(area: VisibleArea, dockHeight: number): FloatingUIOptions {
  const rect = slashPanelRect(area, dockHeight, 0)
  return {
    useFloatingOptions: { strategy: 'fixed', middleware: [aboveTouchBar(area, dockHeight)] },
    elementProps: {
      className: 'axn-touch-slash',
      // As props substituem as do BlockNote: o z-index e o mousedown (o toque não tira o foco do
      // editor, então o teclado fica aberto) voltam aqui.
      style: { zIndex: 80, width: rect.width, maxHeight: rect.maxHeight },
      onMouseDownCapture: (event) => {
        event.preventDefault()
      },
    },
  }
}

/**
 * O menu "/" do editor. Com a barra do toque à vista, vira um painel inferior não modal acima dela (o
 * filtro continua pelo texto depois do "/"; Esc, apagar o "/" ou tocar fora fecham). Sem a barra, é o
 * popover de sempre, preso ao cursor.
 */
export function SlashMenuController({
  getItems,
  touchBar,
  dockHeight,
}: {
  getItems: (query: string) => Promise<DefaultReactSuggestionItem[]>
  touchBar: boolean
  dockHeight: number
}) {
  const area = useViewportBox(touchBar)
  const floatingUIOptions = useMemo(
    () => (area ? touchSlashOptions(area, dockHeight) : undefined),
    [area, dockHeight],
  )
  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getItems}
      {...(floatingUIOptions && { floatingUIOptions })}
    />
  )
}
