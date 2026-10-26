import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Link2Icon,
  PaletteIcon,
  Repeat2Icon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react'
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  filterMenu,
  type BlockCommand,
  type MenuEntry,
  type MenuIcon,
} from '@/features/editor/block-menu/block-menu'
import { matchBlockShortcut } from '@/features/editor/block-menu/block-shortcuts'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

const ICONS: Record<Exclude<MenuIcon, 'swatch'>, typeof CopyIcon> = {
  transform: Repeat2Icon,
  color: PaletteIcon,
  link: Link2Icon,
  duplicate: CopyIcon,
  remove: Trash2Icon,
  block: SquareIcon,
}

const COMMAND_BY_SHORTCUT = {
  duplicate: { kind: 'duplicate' },
  copyLink: { kind: 'copyLink' },
} as const satisfies Record<string, BlockCommand>

interface BlockMenuPanelProps {
  /** Tipo do bloco ("Texto", "Destaque"…), no topo da lista. */
  title: string
  entries: readonly MenuEntry[]
  onCommand: (command: BlockCommand) => void
  /** Mac/iPhone/iPad: atalhos com ⌘. */
  apple: boolean
  /** Toque: alvos de 44 px. */
  touch: boolean
  /** Foca o campo ao abrir (no toque não: o teclado subiria sem ninguém pedir). */
  focusOnOpen: boolean
}

function EntryIcon({ entry }: { entry: MenuEntry }) {
  if (entry.icon === 'swatch' && entry.swatch) {
    return (
      <span
        aria-hidden="true"
        className="axn-swatch"
        data-prop={entry.swatch.prop}
        data-color={entry.swatch.color}
      >
        A
      </span>
    )
  }
  const Icon = ICONS[entry.icon === 'swatch' ? 'block' : entry.icon]
  return <Icon className="size-4 shrink-0" aria-hidden="true" />
}

/**
 * Corpo do menu do bloco: campo "Pesquisar ações…" (combobox) e a lista (listbox). Submenus abrem no
 * mesmo lugar, como painéis em sequência (→ ou Enter entra, ← ou Backspace com o campo vazio volta), então
 * funcionam igual no popover do desktop e no bottom sheet do toque. Com texto digitado a lista achata os
 * subitens ("Transformar em › Título 1"). Esc fecha (o popover/sheet cuida).
 */
export function BlockMenuPanel({
  title,
  entries,
  onCommand,
  apple,
  touch,
  focusOnOpen,
}: BlockMenuPanelProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [path, setPath] = useState<readonly MenuEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const submenu = path.at(-1)
  const items = useMemo(
    () => (query.trim() !== '' ? filterMenu(entries, query) : [...(submenu?.children ?? entries)]),
    [entries, query, submenu],
  )
  const found = items.findIndex((item) => item.id === activeId)
  const activeIndex = items.length === 0 ? -1 : Math.max(found, 0)
  const active = activeIndex >= 0 ? items[activeIndex] : undefined
  const optionId = (entry: MenuEntry) => `${listId}-${entry.id}`

  useEffect(() => {
    if (focusOnOpen) inputRef.current?.focus()
  }, [focusOnOpen])

  useEffect(() => {
    if (!active) return
    const element = document.getElementById(`${listId}-${active.id}`)
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' })
    }
  }, [listId, active])

  const enter = (entry: MenuEntry) => {
    setPath((current) => [...current, entry])
    setQuery('')
    setActiveId(null)
    // No toque o campo não ganha o foco: o teclado subiria sem ninguém pedir.
    if (focusOnOpen) inputRef.current?.focus({ preventScroll: true })
  }
  const back = () => {
    setPath((current) => current.slice(0, -1))
    setActiveId(submenu?.id ?? null)
  }
  const choose = (entry: MenuEntry) => {
    if (entry.children) enter(entry)
    else if (entry.command) onCommand(entry.command)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    const empty = query === ''
    const shortcut = matchBlockShortcut(event, apple)
    if (shortcut === 'duplicate' || shortcut === 'copyLink') {
      event.preventDefault()
      onCommand(COMMAND_BY_SHORTCUT[shortcut])
      return
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (items.length === 0) return
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        const next = items[(activeIndex + step + items.length) % items.length]
        if (next) setActiveId(next.id)
        return
      }
      case 'Enter':
        event.preventDefault()
        if (active) choose(active)
        return
      case 'ArrowRight':
        if (active?.children && (empty || event.currentTarget.selectionStart === query.length)) {
          event.preventDefault()
          enter(active)
        }
        return
      case 'ArrowLeft':
      case 'Backspace':
        if (empty && submenu) {
          event.preventDefault()
          back()
        }
        return
      case 'Delete':
        if (empty) {
          event.preventDefault()
          onCommand({ kind: 'remove' })
        }
        return
    }
  }

  const rowClass = cn(
    'flex w-full cursor-pointer items-center gap-2 rounded-tag px-2 text-left',
    touch ? 'min-h-11' : 'min-h-7',
  )

  return (
    // O tamanho do texto fica aqui: no cn() o tailwind-merge trata text-ui como cor e o descartaria.
    <div className="flex min-h-0 flex-col text-ui" data-block-menu="">
      <div className="shrink-0 p-1.5">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={t('editor.blockMenu.searchLabel')}
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionId(active) : undefined}
          value={query}
          placeholder={t('editor.blockMenu.searchPlaceholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveId(null)
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full rounded-tag border bg-background px-2 text-strong outline-none placeholder:text-faint focus-visible:border-[var(--accent)]',
            touch ? 'min-h-11' : 'min-h-8',
          )}
        />
      </div>

      {submenu && query === '' ? (
        <button
          type="button"
          onClick={back}
          className={cn(rowClass, 'mx-1.5 w-auto text-meta text-muted-foreground hover:bg-hover')}
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          {submenu.label}
          <span className="sr-only">{t('editor.blockMenu.back')}</span>
        </button>
      ) : query === '' ? (
        <p className="px-3.5 pt-1 pb-0.5 text-meta font-medium text-muted-foreground">{title}</p>
      ) : null}

      <div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
        {items.length === 0 ? (
          <p className="px-2 py-2 text-ui text-muted-foreground">{t('editor.blockMenu.empty')}</p>
        ) : (
          <ul
            id={listId}
            role="listbox"
            aria-label={submenu?.label ?? t('editor.blockMenu.listLabel')}
          >
            {items.map((entry) => {
              const isActive = entry.id === active?.id
              const name = entry.path ?? [entry.group, entry.label].filter(Boolean).join(' ')
              return (
                <Fragment key={entry.id}>
                  {entry.section === '' ? (
                    <li role="presentation" className="my-1 border-t" />
                  ) : entry.section ? (
                    <li
                      role="presentation"
                      className="px-2 pt-2 pb-0.5 text-meta font-medium text-muted-foreground"
                    >
                      {entry.section}
                    </li>
                  ) : null}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- o teclado é tratado no campo do combobox */}
                  <li
                    id={optionId(entry)}
                    role="option"
                    aria-selected={isActive}
                    aria-label={name}
                    aria-checked={entry.checked}
                    tabIndex={-1}
                    // O campo mantém o foco (e, no toque, o teclado não abre/fecha à toa).
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onClick={() => {
                      choose(entry)
                    }}
                    onPointerMove={(event) => {
                      if (event.pointerType === 'mouse' && !isActive) setActiveId(entry.id)
                    }}
                    className={cn(
                      rowClass,
                      isActive ? 'bg-hover text-strong' : 'text-foreground',
                      entry.command?.kind === 'remove' && isActive && 'text-red',
                    )}
                  >
                    <EntryIcon entry={entry} />
                    <span className="min-w-0 flex-1 truncate">{entry.path ?? entry.label}</span>
                    {entry.checked ? (
                      <CheckIcon className="size-4 shrink-0" aria-hidden="true" />
                    ) : null}
                    {entry.shortcut ? (
                      <kbd className="shrink-0 font-sans text-meta text-faint">
                        {entry.shortcut}
                      </kbd>
                    ) : null}
                    {entry.children ? (
                      <ChevronRightIcon className="size-4 shrink-0 text-faint" aria-hidden="true" />
                    ) : null}
                  </li>
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
