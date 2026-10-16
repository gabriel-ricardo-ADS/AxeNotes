import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ChevronRightIcon, EllipsisIcon, GripVerticalIcon, PlusIcon } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type KeyboardEventHandler, type Ref } from 'react'
import { Link } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { pagePath } from '@/features/pages/routes'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { rowActionsClass, rowButtonClass } from '@/features/workspace/components/row-styles'
import type { FlatItem } from '@/features/workspace/tree'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

export type DropPosition = 'before' | 'after' | 'inside'

export interface PageTreeItemProps {
  item: FlatItem
  posInSet: number
  setSize: number
  /** É a página aberta na tela. */
  isCurrent: boolean
  /** É a linha com tabindex 0 (roving tabindex). */
  isActive: boolean
  canEdit: boolean
  /** É favorita do usuário. `null`: a lista de favoritos ainda não chegou (a ação fica desabilitada). */
  isFavorite: boolean | null
  /** Fora do alvo de soltar: a página arrastada e as descendentes dela. */
  dropDisabled: boolean
  dropIndicator: DropPosition | null
  onActivate: (id: string) => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onCreateChild: (id: string) => void
  onRename: (id: string, title: string) => void
  onChangeIcon: (id: string) => void
  onMove: (id: string) => void
  onToggleFavorite: (id: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>, item: FlatItem, openMenu: () => void) => void
}

const actionsClass = rowActionsClass
const smallButton = rowButtonClass

export function PageTreeItem(props: PageTreeItemProps) {
  const { item, isCurrent, isActive, canEdit, dropIndicator } = props
  const { page } = item
  const title = page.title || t('workspace.tree.untitled')

  const renaming = useTreeUiStore((state) => state.renamingId === page.id)
  const stopRename = useTreeUiStore((state) => state.stopRename)
  const [menuOpen, setMenuOpen] = useState(false)
  const rowRef = useRef<HTMLLIElement | null>(null)
  const renameDone = useRef(false)

  const dragDisabled = !canEdit || renaming
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({ id: page.id, disabled: dragDisabled })
  const { setNodeRef: setDropRef } = useDroppable({ id: page.id, disabled: props.dropDisabled })

  const setRefs: Ref<HTMLLIElement> = (node) => {
    rowRef.current = node
    setDragRef(node)
    setDropRef(node)
  }

  // Mouse e toque arrastam pela linha toda; o teclado só pela alça (Enter/Espaço da linha são da árvore).
  const { onKeyDown, ...pointerListeners } = listeners ?? {}
  const keyboardDrag = onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined
  const tabIndex = isActive ? 0 : -1

  function finishRename(value: string, save: boolean) {
    if (renameDone.current) return
    renameDone.current = true
    stopRename()
    if (save) {
      const next = value.trim()
      if (next !== page.title) props.onRename(page.id, next)
    }
    rowRef.current?.focus()
  }

  return (
    <li
      ref={setRefs}
      role="treeitem"
      aria-level={item.level}
      aria-posinset={props.posInSet}
      aria-setsize={props.setSize}
      aria-expanded={item.hasChildren ? item.expanded : undefined}
      aria-selected={isCurrent}
      aria-label={title}
      tabIndex={tabIndex}
      data-page-id={page.id}
      onFocus={() => {
        props.onActivate(page.id)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        props.onKeyDown(event, item, () => {
          setMenuOpen(true)
        })
      }}
      {...(renaming ? {} : pointerListeners)}
      style={{ paddingInlineStart: `${String(item.level * 0.75 - 0.5)}rem` }}
      className={cn(
        'group/row relative flex min-h-8 items-center rounded-tag pr-1 text-muted-foreground transition-colors duration-(--duration-ui) outline-none select-none [-webkit-touch-callout:none] hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11 max-md:min-h-11',
        isCurrent && 'bg-hover font-medium text-strong',
        isDragging && 'opacity-40',
        dropIndicator === 'before' && 'shadow-[inset_0_2px_0_0_var(--accent)]',
        dropIndicator === 'after' && 'shadow-[inset_0_-2px_0_0_var(--accent)]',
        dropIndicator === 'inside' && 'bg-primary/20 ring-1 ring-primary',
      )}
    >
      {item.hasChildren ? (
        <button
          type="button"
          tabIndex={tabIndex}
          aria-label={t(item.expanded ? 'workspace.tree.collapse' : 'workspace.tree.expand', {
            title,
          })}
          onClick={() => {
            props.onToggle(page.id)
          }}
          className={smallButton}
        >
          <ChevronRightIcon
            className={cn(
              'size-4 transition-transform duration-(--duration-ui)',
              item.expanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
      ) : (
        <span aria-hidden="true" className="w-9 shrink-0 md:w-6 md:pointer-coarse:w-9" />
      )}

      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          <PageIconView icon={page.icon} />
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- o campo nasce da ação "Renomear"
            autoFocus
            aria-label={t('workspace.tree.renameField')}
            defaultValue={page.title}
            maxLength={500}
            onFocus={(event) => {
              renameDone.current = false
              event.currentTarget.select()
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                finishRename(event.currentTarget.value, true)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                finishRename('', false)
              }
            }}
            onBlur={(event) => {
              finishRename(event.currentTarget.value, true)
            }}
            className="min-h-8 min-w-0 flex-1 rounded-tag border border-ring bg-background px-1 text-strong outline-none pointer-coarse:min-h-10"
          />
        </span>
      ) : (
        <Link
          to={pagePath(page.id)}
          tabIndex={-1}
          draggable={false}
          onClick={() => {
            props.onOpen(page.id)
          }}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 self-stretch pl-1 pointer-coarse:min-h-11 max-md:min-h-11"
        >
          <PageIconView icon={page.icon} />
          <span className="truncate">{title}</span>
        </Link>
      )}

      {!renaming ? (
        <span data-open={menuOpen} className={actionsClass}>
          {canEdit ? (
            <>
              <button
                ref={setActivatorNodeRef}
                {...attributes}
                onKeyDown={keyboardDrag}
                tabIndex={tabIndex}
                aria-label={t('workspace.tree.dragHandle', { title })}
                className={cn(smallButton, 'hidden cursor-grab [@media(hover:hover)]:flex')}
              >
                <GripVerticalIcon className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                tabIndex={tabIndex}
                aria-label={t('workspace.tree.newChild', { title })}
                onClick={() => {
                  props.onCreateChild(page.id)
                }}
                className={smallButton}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
              </button>
            </>
          ) : null}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={tabIndex}
                aria-label={t('workspace.tree.menu', { title })}
                className={smallButton}
              >
                <EllipsisIcon className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                // Quem abriu um campo ou diálogo já tem o foco certo; o resto volta para a linha.
                event.preventDefault()
                if (!useTreeUiStore.getState().renamingId) rowRef.current?.focus()
              }}
            >
              <DropdownMenuItem
                disabled={props.isFavorite === null}
                onSelect={() => {
                  props.onToggleFavorite(page.id)
                }}
              >
                {t(
                  props.isFavorite === true
                    ? 'workspace.tree.unfavorite'
                    : 'workspace.tree.favorite',
                )}
              </DropdownMenuItem>
              {canEdit ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      renameDone.current = false
                      useTreeUiStore.getState().startRename(page.id)
                    }}
                  >
                    {t('workspace.tree.rename')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      props.onChangeIcon(page.id)
                    }}
                  >
                    {t('workspace.tree.changeIcon')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      props.onMove(page.id)
                    }}
                  >
                    {t('workspace.tree.moveTo')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
    </li>
  )
}
