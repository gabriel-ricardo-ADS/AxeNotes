import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'
import { FilePlusIcon, Link2Icon, MessageSquareQuoteIcon } from 'lucide-react'
import { CALLOUT_DEFAULT_BACKGROUND } from '@/features/editor/blocks/callout/callout'
import { editorDictionary } from '@/features/editor/dictionary'
import type { AxnEditor } from '@/features/editor/schema'
import { t } from '@/i18n'

const ICON_SIZE = 18

/** O que os itens de página do "/" pedem ao app (sem eles, os itens não aparecem). */
export interface SlashMenuActions {
  /** "/" → "Página": cria a subpágina e o bloco que aponta para ela. */
  createSubpage: () => void
  /** "/" → "Link para página": abre o seletor de página. */
  linkToPage: () => void
}

/** Os itens do AxeNotes, que entram logo depois de um item padrão (pelo título). */
function axnItems(
  editor: AxnEditor,
  actions: SlashMenuActions | undefined,
): { after: string; item: DefaultReactSuggestionItem }[] {
  const basics = editorDictionary.slash_menu.quote.group
  const callout: DefaultReactSuggestionItem = {
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
  }
  const items = [{ after: editorDictionary.slash_menu.quote.title, item: callout }]
  if (!actions) return items

  return [
    ...items,
    {
      after: callout.title,
      item: {
        title: t('editor.slash.subpage'),
        subtext: t('editor.slash.subpageSubtext'),
        aliases: ['page', 'pagina', 'subpagina', 'subpage', 'nova pagina'],
        group: basics,
        icon: <FilePlusIcon size={ICON_SIZE} aria-hidden="true" />,
        onItemClick: actions.createSubpage,
      },
    },
    {
      after: t('editor.slash.subpage'),
      item: {
        title: t('editor.slash.pageLink'),
        subtext: t('editor.slash.pageLinkSubtext'),
        aliases: ['link', 'mention', 'mencionar', 'pagina', 'link to page'],
        group: basics,
        icon: <Link2Icon size={ICON_SIZE} aria-hidden="true" />,
        onItemClick: actions.linkToPage,
      },
    },
  ]
}

/**
 * Itens do menu "/": os padrões do BlockNote para o nosso schema (sem mídia), menos "Emoji" (o seletor
 * de emoji está desligado; o item abriria um menu que não existe), mais os blocos do AxeNotes. O item do
 * React não tem `key`, então o filtro e a posição são pelo título do dicionário.
 */
export function slashMenuItems(
  editor: AxnEditor,
  query: string,
  actions?: SlashMenuActions,
): DefaultReactSuggestionItem[] {
  const hidden = new Set([editorDictionary.slash_menu.emoji.title])
  const items = getDefaultReactSlashMenuItems(editor).filter((item) => !hidden.has(item.title))
  for (const { after, item } of axnItems(editor, actions)) {
    const index = items.findIndex((existing) => existing.title === after)
    items.splice(index === -1 ? items.length : index + 1, 0, item)
  }
  return filterSuggestionItems(items, query)
}
