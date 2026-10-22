import {
  filterSuggestionItems,
  type BlockNoteEditor,
  type BlockSchema,
  type InlineContentSchema,
  type StyleSchema,
} from '@blocknote/core'
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'
import { editorDictionary } from '@/features/editor/dictionary'

/**
 * Itens do menu "/": os padrões do BlockNote para o nosso schema (sem mídia), menos "Emoji" (o seletor
 * de emoji está desligado na 2a; o item abriria um menu que não existe). O item do React não tem
 * `key`, então o filtro é pelo título do dicionário.
 */
export function slashMenuItems<
  B extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(editor: BlockNoteEditor<B, I, S>, query: string): DefaultReactSuggestionItem[] {
  const hidden = new Set([editorDictionary.slash_menu.emoji.title])
  const items = getDefaultReactSlashMenuItems(editor).filter((item) => !hidden.has(item.title))
  return filterSuggestionItems(items, query)
}
