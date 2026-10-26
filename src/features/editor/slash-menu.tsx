import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'
import { MessageSquareQuoteIcon } from 'lucide-react'
import { CALLOUT_DEFAULT_BACKGROUND } from '@/features/editor/blocks/callout/callout'
import { editorDictionary } from '@/features/editor/dictionary'
import type { AxnEditor } from '@/features/editor/schema'
import { t } from '@/i18n'

const ICON_SIZE = 18

/** Os itens do AxeNotes, que entram logo depois de um item padrão (pelo título). */
function axnItems(editor: AxnEditor): { after: string; item: DefaultReactSuggestionItem }[] {
  const basics = editorDictionary.slash_menu.quote.group
  return [
    {
      after: editorDictionary.slash_menu.quote.title,
      item: {
        title: t('editor.callout.title'),
        subtext: t('editor.callout.subtext'),
        aliases: ['callout', 'destaque', 'aviso', 'nota', 'caixa'],
        group: basics,
        icon: <MessageSquareQuoteIcon size={ICON_SIZE} aria-hidden="true" />,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: 'callout',
            props: { backgroundColor: CALLOUT_DEFAULT_BACKGROUND },
          })
        },
      },
    },
  ]
}

/**
 * Itens do menu "/": os padrões do BlockNote para o nosso schema (sem mídia), menos "Emoji" (o seletor
 * de emoji está desligado; o item abriria um menu que não existe), mais os blocos do AxeNotes. O item do
 * React não tem `key`, então o filtro e a posição são pelo título do dicionário.
 */
export function slashMenuItems(editor: AxnEditor, query: string): DefaultReactSuggestionItem[] {
  const hidden = new Set([editorDictionary.slash_menu.emoji.title])
  const items = getDefaultReactSlashMenuItems(editor).filter((item) => !hidden.has(item.title))
  for (const { after, item } of axnItems(editor)) {
    const index = items.findIndex((existing) => existing.title === after)
    items.splice(index === -1 ? items.length : index + 1, 0, item)
  }
  return filterSuggestionItems(items, query)
}
