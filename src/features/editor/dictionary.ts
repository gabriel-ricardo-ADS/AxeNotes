import type { Dictionary } from '@blocknote/core'
import { pt } from '@blocknote/core/locales'
import { t } from '@/i18n'

/** Dicionário pt do BlockNote com os placeholders do AxeNotes (textos em src/i18n/pt-BR.ts). */
export const editorDictionary: Dictionary = {
  ...pt,
  placeholders: {
    ...pt.placeholders,
    default: t('editor.placeholders.default'),
    heading: t('editor.placeholders.heading'),
    bulletListItem: t('editor.placeholders.list'),
    numberedListItem: t('editor.placeholders.list'),
    checkListItem: t('editor.placeholders.list'),
    toggleListItem: t('editor.placeholders.toggle'),
  },
}
