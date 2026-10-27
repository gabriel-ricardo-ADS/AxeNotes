import { GripVerticalIcon } from 'lucide-react'
import { useContext, useEffect, useState } from 'react'
import { OpenBlockMenuContext } from '@/features/editor/block-menu/open-block-menu-context'
import type { AxnEditor } from '@/features/editor/schema'
import {
  blockContentElement,
  KEEP_EDITOR_FOCUS,
  marginHandlePosition,
} from '@/features/editor/touch/touch-editor'
import { t } from '@/i18n'

/**
 * Alça ⋮⋮ de 44 px do iPad (toque com largura ≥ 768 px), na margem esquerda do bloco do cursor, sem
 * depender de hover e sem o "+". Fica dentro da seção do editor (posição absoluta), então rola junto com
 * o texto; muda de lugar quando o cursor ou o conteúdo mudam e no resize. Tocar abre o bottom sheet do
 * menu do bloco. Quem decide se ela aparece (editor focado e editável, sem modal) é o `PageEditor`.
 */
export function TouchBlockHandle({
  editor,
  container,
}: {
  editor: AxnEditor
  container: HTMLElement | null
}) {
  const openBlockMenu = useContext(OpenBlockMenuContext)
  const [place, setPlace] = useState<{ blockId: string; top: number; left: number } | null>(null)

  useEffect(() => {
    if (!container) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const blockId = editor.getTextCursorPosition().block.id
        const content = blockContentElement(editor, blockId)
        if (!content) {
          setPlace(null)
          return
        }
        const position = marginHandlePosition(
          content.getBoundingClientRect(),
          container.getBoundingClientRect(),
        )
        setPlace({ blockId, ...position })
      })
    }
    update()
    const stopSelection = editor.onSelectionChange(update)
    const stopChange = editor.onChange(update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      stopSelection()
      stopChange()
      window.removeEventListener('resize', update)
    }
  }, [editor, container])

  if (!place) return null
  return (
    <button
      type="button"
      className="axn-touch-handle"
      style={{ top: place.top, left: place.left }}
      aria-label={t('editor.touch.blockOptions')}
      {...KEEP_EDITOR_FOCUS}
      onClick={(event) => {
        openBlockMenu?.(place.blockId, event.currentTarget, { fromTouch: true })
      }}
    >
      <GripVerticalIcon size={20} aria-hidden="true" />
    </button>
  )
}
