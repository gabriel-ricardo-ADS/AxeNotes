import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pagePath } from '@/features/pages/routes'
import { PageSearchPanel } from '@/features/search/components/PageSearchPanel'
import type { SearchItem } from '@/features/search/components/SearchOption'
import { useSearchShortcut } from '@/features/search/hooks/use-search-shortcut'
import { useVisualViewport } from '@/features/search/hooks/use-visual-viewport'
import { useSearchStore } from '@/features/search/search-store'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { t } from '@/i18n'

/** Para onde o foco volta ao fechar: quem abriu; se sumiu (gaveta fechada), o ☰; por último o conteúdo. */
function restoreFocus(opener: HTMLElement | null) {
  const target =
    opener?.isConnected === true && opener !== document.body
      ? opener
      : (document.querySelector<HTMLElement>('[data-search-return]') ??
        document.getElementById('conteudo'))
  target?.focus()
}

/** Classes do diálogo de busca de páginas (busca e seletor de link): no iOS, acima do teclado. */
export const PAGE_SEARCH_DIALOG_CLASS =
  'top-[calc(var(--vv-top,0px)+max(env(safe-area-inset-top),0.5rem))] max-h-[calc(var(--vv-height,100dvh)-1rem)] w-[min(40rem,calc(100vw-1rem))] translate-y-0 md:top-[12vh] md:max-h-[min(70dvh,32rem)]'

/**
 * Diálogo de busca (Ctrl/Cmd+K e botão "Buscar"). Montado UMA vez no layout: o botão da sidebar, o da gaveta
 * e o atalho abrem o mesmo. Combobox + listbox: o foco fica no campo e a opção ativa vai em
 * `aria-activedescendant`.
 */
export function SearchDialog() {
  useSearchShortcut()
  const open = useSearchStore((state) => state.open)
  const closeSearch = useSearchStore((state) => state.closeSearch)
  const [content, setContent] = useState<HTMLElement | null>(null)
  useVisualViewport(content, open)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSearch()
      }}
    >
      <DialogContent
        ref={setContent}
        data-search-dialog=""
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus(useSearchStore.getState().opener)
        }}
        className={PAGE_SEARCH_DIALOG_CLASS}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('search.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('search.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <SearchBody />
      </DialogContent>
    </Dialog>
  )
}

/** Conteúdo do diálogo: a busca com o termo guardado na store; escolher abre a página. */
function SearchBody() {
  const navigate = useNavigate()
  const term = useSearchStore((state) => state.term)
  const setTerm = useSearchStore((state) => state.setTerm)
  const closeSearch = useSearchStore((state) => state.closeSearch)
  const notifyPick = useSearchStore((state) => state.notifyPick)
  const homeId = useWorkspace().data?.homePageId ?? null

  const pick = (item: SearchItem) => {
    // A página inicial vive em "/" (mantém o item "Página inicial" ativo na sidebar).
    void navigate(item.id === homeId ? '/' : pagePath(item.id))
    notifyPick()
    closeSearch()
  }

  return (
    <PageSearchPanel
      term={term}
      onTermChange={setTerm}
      onPick={pick}
      inputLabel={t('search.inputLabel')}
    />
  )
}
