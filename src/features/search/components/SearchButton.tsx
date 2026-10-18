import { SearchIcon } from 'lucide-react'
import { detectMac } from '@/features/search/search'
import { useSearchStore } from '@/features/search/search-store'
import { t } from '@/i18n'

/** Botão "Buscar" da sidebar e da gaveta: o único caminho no mobile, onde não há teclado. */
export function SearchButton() {
  const isMac = detectMac(navigator)

  return (
    <button
      type="button"
      // Passa o próprio botão: o Safari não dá foco ao botão tocado, então `activeElement` seria o body.
      onClick={(event) => {
        useSearchStore.getState().openSearch(event.currentTarget)
      }}
      aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      className="flex min-h-11 w-full items-center gap-2 rounded-tag px-2 text-muted-foreground transition-colors duration-(--duration-ui) hover:bg-hover md:min-h-8"
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">{t('search.button')}</span>
      <kbd aria-hidden="true" className="hidden font-sans text-meta text-faint pointer-fine:inline">
        {isMac ? t('search.shortcutMac') : t('search.shortcutOther')}
      </kbd>
    </button>
  )
}
