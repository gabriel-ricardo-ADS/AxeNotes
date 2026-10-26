import {
  blockTypeSelectItems,
  FormattingToolbar,
  useBlockNoteEditor,
  type BlockTypeSelectItem,
} from '@blocknote/react'
import { MessageSquareQuoteIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { editorSchema } from '@/features/editor/schema'
import { t } from '@/i18n'

const CalloutIcon: BlockTypeSelectItem['icon'] = ({ size }) => (
  <MessageSquareQuoteIcon size={size} aria-hidden="true" />
)

/**
 * Barra de formatação do BlockNote com o seletor de tipo ("Texto ▾") sabendo do Destaque: sem ele na
 * lista, o seletor some quando o cursor está num destaque.
 */
export function AxnFormattingToolbar() {
  const editor = useBlockNoteEditor<
    typeof editorSchema.blockSchema,
    typeof editorSchema.inlineContentSchema,
    typeof editorSchema.styleSchema
  >()
  const items = useMemo(
    () => [
      ...blockTypeSelectItems(editor),
      { name: t('editor.callout.title'), type: 'callout', icon: CalloutIcon },
    ],
    [editor],
  )
  return <FormattingToolbar blockTypeSelectItems={items} />
}
