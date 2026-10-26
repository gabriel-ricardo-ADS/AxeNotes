import {
  RenderInPortalElement,
  UIModeContext,
  useBlockNoteEditor,
  useEditorState,
} from '@blocknote/react'
import { KeyboardOffIcon, ListTodoIcon, Redo2Icon, Undo2Icon, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { toggleChecklist } from '@/features/editor/block-menu/block-actions'
import type { editorSchema } from '@/features/editor/schema'
import { checklistToggleTarget, KEEP_EDITOR_FOCUS } from '@/features/editor/touch/touch-editor'
import { t } from '@/i18n'

function useAxnEditor() {
  return useBlockNoteEditor<
    typeof editorSchema.blockSchema,
    typeof editorSchema.inlineContentSchema,
    typeof editorSchema.styleSchema
  >()
}

interface BarButtonProps {
  label: string
  icon: LucideIcon
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  /** Fechar teclado: o toque pode tirar o foco (é o que ele faz). */
  allowBlur?: boolean
}

/** Botão de 44 px da barra; o toque não tira o foco do editor (o teclado fica aberto). */
function BarButton({ label, icon: Icon, onClick, pressed, disabled, allowBlur }: BarButtonProps) {
  return (
    <button
      type="button"
      className="axn-touch-button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...(allowBlur ? {} : KEEP_EDITOR_FOCUS)}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}

/** Os botões da barra acima do teclado, na ordem da DECISÃO-031. Rola na horizontal se não couber. */
function TouchToolbar() {
  const editor = useAxnEditor()
  const cursor = useEditorState({
    editor,
    selector: () => {
      const block = editor.getTextCursorPosition().block
      return {
        id: block.id,
        checklist: block.type === 'checkListItem',
        canToggle:
          checklistToggleTarget(block.type, editor.schema.blockSchema[block.type].content) !== null,
      }
    },
  })

  return (
    <div role="toolbar" aria-label={t('editor.touch.toolbar')} className="axn-touch-bar">
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
 * Monte dentro do `BlockNoteView`. `onHeightChange` recebe a altura ocupada (0 ao desmontar).
 */
export function TouchToolbarController({
  onHeightChange,
}: {
  onHeightChange: (height: number) => void
}) {
  const dockRef = useRef<HTMLDivElement>(null)

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
          <TouchToolbar />
        </div>
      </UIModeContext.Provider>
    </RenderInPortalElement>
  )
}
