import { SuggestionMenu } from '@blocknote/core/extensions'
import {
  RenderInPortalElement,
  UIModeContext,
  useBlockNoteEditor,
  useEditorState,
  useExtensionState,
} from '@blocknote/react'
import {
  CaseSensitiveIcon,
  GripVerticalIcon,
  KeyboardOffIcon,
  ListTodoIcon,
  Redo2Icon,
  Repeat2Icon,
  SlashIcon,
  Undo2Icon,
} from 'lucide-react'
import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { toggleChecklist } from '@/features/editor/block-menu/block-actions'
import {
  OpenBlockMenuContext,
  type BlockMenuOpenOptions,
} from '@/features/editor/block-menu/open-block-menu-context'
import type { editorSchema } from '@/features/editor/schema'
import { BarButton } from '@/features/editor/touch/BarButton'
import { blockContentElement } from '@/features/editor/touch/TouchBlockHandle'
import { checklistToggleTarget } from '@/features/editor/touch/touch-editor'
import { TouchFormatPanel } from '@/features/editor/touch/TouchFormatPanel'
import { t } from '@/i18n'

function useAxnEditor() {
  return useBlockNoteEditor<
    typeof editorSchema.blockSchema,
    typeof editorSchema.inlineContentSchema,
    typeof editorSchema.styleSchema
  >()
}

/** Os botões da barra acima do teclado, na ordem da DECISÃO-031. Rola na horizontal se não couber. */
function TouchToolbar({
  formatOpen,
  onToggleFormat,
}: {
  formatOpen: boolean
  onToggleFormat: (open: boolean) => void
}) {
  const editor = useAxnEditor()
  const cursor = useEditorState({
    editor,
    selector: () => {
      const block = editor.getTextCursorPosition().block
      return {
        id: block.id,
        inline: editor.schema.blockSchema[block.type].content === 'inline',
        checklist: block.type === 'checkListItem',
        canToggle:
          checklistToggleTarget(block.type, editor.schema.blockSchema[block.type].content) !== null,
      }
    },
  })
  const openBlockMenu = useContext(OpenBlockMenuContext)
  const openMenu = (options: BlockMenuOpenOptions) => {
    const anchor = blockContentElement(editor, cursor.id)
    if (anchor) openBlockMenu?.(cursor.id, anchor, options)
  }
  const slashOpen = useExtensionState(SuggestionMenu, {
    editor,
    selector: (state) => state?.show === true && state.triggerCharacter === '/',
  })

  return (
    <div role="toolbar" aria-label={t('editor.touch.toolbar')} className="axn-touch-bar">
      <BarButton
        label={t('editor.touch.blockOptions')}
        icon={GripVerticalIcon}
        onClick={() => {
          openMenu({ fromTouch: true })
        }}
      />
      <BarButton
        label={t('editor.touch.insert')}
        icon={SlashIcon}
        expanded={slashOpen}
        onClick={() => {
          onToggleFormat(false)
          // Insere o "/" de verdade (apagá-lo fecha o menu, como no desktop), sem simular tecla.
          editor
            .getExtension(SuggestionMenu)
            ?.openSuggestionMenu('/', { deleteTriggerCharacter: true })
        }}
      />
      <BarButton
        label={t('editor.touch.format')}
        icon={CaseSensitiveIcon}
        expanded={formatOpen}
        onClick={() => {
          onToggleFormat(!formatOpen)
        }}
      />
      <BarButton
        label={t('editor.touch.checklist')}
        icon={ListTodoIcon}
        pressed={cursor.checklist}
        disabled={!cursor.canToggle}
        onClick={() => {
          toggleChecklist(editor, cursor.id)
        }}
      />
      <BarButton
        label={t('editor.touch.transform')}
        icon={Repeat2Icon}
        disabled={!cursor.inline}
        onClick={() => {
          openMenu({ fromTouch: true, view: 'transform' })
        }}
      />
      <BarButton
        label={t('editor.touch.undo')}
        icon={Undo2Icon}
        onClick={() => {
          editor.undo()
        }}
      />
      <BarButton
        label={t('editor.touch.redo')}
        icon={Redo2Icon}
        onClick={() => {
          editor.redo()
        }}
      />
      <BarButton
        label={t('editor.touch.hideKeyboard')}
        icon={KeyboardOffIcon}
        allowBlur
        onClick={() => {
          editor.blur()
        }}
      />
    </div>
  )
}

/**
 * A barra acima do teclado, com as mesmas peças do `MobileFormattingToolbarController` do BlockNote:
 * portal no `document.body` registrado no editor (o foco nela conta como foco no editor), modo de UI
 * "mobile" e posição pelas variáveis `--bn-vv-*` (CSS `.axn-touch-dock`). Quem decide se ela aparece é o
 * `PageEditor` (`shouldShowTouchBar`), com as mesmas fontes que desligam a barra flutuante do desktop.
 * O painel Aa abre em cima dela, no mesmo bloco. Monte dentro do `BlockNoteView`. `onHeightChange`
 * recebe a altura ocupada (barra + painel; 0 ao desmontar).
 */
export function TouchToolbarController({
  onHeightChange,
}: {
  onHeightChange: (height: number) => void
}) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [formatOpen, setFormatOpen] = useState(false)

  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock) return
    const report = () => {
      onHeightChange(dock.getBoundingClientRect().height)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(dock)
    return () => {
      observer.disconnect()
      onHeightChange(0)
    }
  }, [onHeightChange])

  return (
    <RenderInPortalElement target={document.body}>
      <UIModeContext.Provider value="mobile">
        <div ref={dockRef} className="axn-touch-dock">
          {formatOpen ? <TouchFormatPanel /> : null}
          <TouchToolbar formatOpen={formatOpen} onToggleFormat={setFormatOpen} />
        </div>
      </UIModeContext.Provider>
    </RenderInPortalElement>
  )
}
