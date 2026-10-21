import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pagePath } from '@/features/pages/routes'
import { useVisibleRecents } from '@/features/recents/hooks/use-visible-recents'
import { SearchOption, type SearchItem } from '@/features/search/components/SearchOption'
import { useDebouncedValue } from '@/features/search/hooks/use-debounced-value'
import { useSearch } from '@/features/search/hooks/use-search'
import { useSearchShortcut } from '@/features/search/hooks/use-search-shortcut'
import { useVisualViewport } from '@/features/search/hooks/use-visual-viewport'
import {
  moveActive,
  normalizeTerm,
  resolveSearchMode,
  resultsAnnouncement,
  searchPath,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_LENGTH,
  type WorkspaceState,
} from '@/features/search/search'
import { useSearchStore } from '@/features/search/search-store'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { ancestorsOf } from '@/features/workspace/tree'
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

/**
 * Estado do workspace para a busca. Consulta parada (`idle`) sem dados nunca vai carregar: conta como `none`,
 * não como `pending` (mesmo critério de `usePages`).
 */
function workspaceStateOf(workspace: ReturnType<typeof useWorkspace>): WorkspaceState {
  if (workspace.data) return 'ready'
  if (workspace.data === null) return 'none'
  if (workspace.isError) return 'error'
  return workspace.isPending && workspace.fetchStatus !== 'idle' ? 'pending' : 'none'
}

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
        className="top-[calc(var(--vv-top,0px)+max(env(safe-area-inset-top),0.5rem))] max-h-[calc(var(--vv-height,100dvh)-1rem)] w-[min(40rem,calc(100vw-1rem))] translate-y-0 md:top-[12vh] md:max-h-[min(70dvh,32rem)]"
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

/** Conteúdo do diálogo: só existe com ele aberto, então as consultas só rodam aberto e o estado zera ao fechar. */
function SearchBody() {
  const listId = useId()
  const navigate = useNavigate()
  const term = useSearchStore((state) => state.term)
  const setTerm = useSearchStore((state) => state.setTerm)
  const closeSearch = useSearchStore((state) => state.closeSearch)
  const notifyPick = useSearchStore((state) => state.notifyPick)
  const workspace = useWorkspace()
  const homeId = workspace.data?.homePageId ?? null
  const workspaceState = workspaceStateOf(workspace)
  const pages = usePages()
  const recents = useVisibleRecents()
  const [activeId, setActiveId] = useState<string | null>(null)

  const normalized = normalizeTerm(term)
  const debounced = useDebouncedValue(normalized, SEARCH_DEBOUNCE_MS)
  const search = useSearch(debounced)

  const mode = resolveSearchMode({
    normalized,
    debounced,
    workspace: workspaceState,
    recents,
    search,
  })

  const items = useMemo<SearchItem[]>(() => {
    if (mode === 'recents') return recents.pages
    if (mode === 'results') return search.data ?? []
    return []
  }, [mode, recents.pages, search.data])

  // A opção ativa é a que o usuário escolheu; se ela não está na lista (outro termo), vale a primeira.
  const found = items.findIndex((item) => item.id === activeId)
  const activeIndex = items.length === 0 ? -1 : Math.max(found, 0)
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined
  const optionId = (item: SearchItem) => `${listId}-${item.id}`

  useEffect(() => {
    if (activeItem === undefined) return
    const element = document.getElementById(`${listId}-${activeItem.id}`)
    // jsdom (testes) não implementa scrollIntoView.
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' })
    }
  }, [listId, activeItem])

  const pathOf = (item: SearchItem): string | null =>
    pages.data === undefined ? null : searchPath(ancestorsOf(pages.data, item.id), homeId)

  const pick = (item: SearchItem) => {
    // A página inicial vive em "/" (mantém o item "Página inicial" ativo na sidebar).
    void navigate(item.id === homeId ? '/' : pagePath(item.id))
    notifyPick()
    closeSearch()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) return
      event.preventDefault()
      const next = items[moveActive(activeIndex, event.key, items.length)]
      if (next) setActiveId(next.id)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      // "Buscando…": ainda não há lista confiável para este termo, então Enter não faz nada.
      if (mode !== 'loading' && activeItem) pick(activeItem)
    }
  }

  const announcement = mode === 'results' ? resultsAnnouncement(items.length) : ''
  const hasOptions = items.length > 0
  const retry = () => {
    if (normalized === '') recents.retry()
    // Sem workspace a busca está desabilitada: recarrega o workspace e ela habilita sozinha.
    else if (workspaceState !== 'ready') void workspace.refetch()
    else void search.refetch()
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b px-3">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          data-search-input=""
          role="combobox"
          aria-label={t('search.inputLabel')}
          aria-expanded={hasOptions}
          aria-controls={hasOptions ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
          value={term}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={t('search.placeholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          onChange={(event) => {
            setTerm(event.target.value)
            setActiveId(null)
          }}
          onKeyDown={onKeyDown}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-body text-strong outline-none placeholder:text-faint"
        />
        <DialogClose className="flex size-11 shrink-0 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover md:size-8">
          <XIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">{t('common.close')}</span>
        </DialogClose>
      </div>

      {/* Sempre montada: leitores de tela só anunciam mudanças de uma região que já existia. */}
      <div role="status" className="sr-only">
        {announcement}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {mode === 'recents' ? (
          <h2 className="px-2 pb-1 text-meta font-medium text-muted-foreground">
            {t('search.recentsHeading')}
          </h2>
        ) : null}

        {mode === 'loading' ? (
          <p aria-hidden="true" className="px-2 py-2 text-ui text-muted-foreground">
            {t('search.loading')}
          </p>
        ) : mode === 'error' ? (
          <div className="px-2 py-1">
            <p role="alert" className="text-ui text-muted-foreground">
              {t('search.error')}
            </p>
            <Button variant="ghost" size="inline" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        ) : hasOptions ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={mode === 'recents' ? t('search.recentsLabel') : t('search.resultsLabel')}
            className="flex flex-col gap-0.5"
          >
            {items.map((item) => (
              <SearchOption
                key={item.id}
                id={optionId(item)}
                item={item}
                path={pathOf(item)}
                active={item.id === activeItem?.id}
                onPick={() => {
                  pick(item)
                }}
                onActivate={() => {
                  setActiveId(item.id)
                }}
              />
            ))}
          </ul>
        ) : (
          <p aria-hidden="true" className="px-2 py-2 text-ui text-muted-foreground">
            {mode === 'recents' ? t('search.recentsEmpty') : t('search.empty')}
          </p>
        )}
      </div>
    </>
  )
}
