import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { pagePath } from '@/features/pages/routes'
import { IconPickerDialog } from '@/features/workspace/components/IconPickerDialog'
import { MovePageDialog } from '@/features/workspace/components/MovePageDialog'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import {
  PageTreeItem,
  type DropPosition,
} from '@/features/workspace/components/PageTreeItem'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import {
  ancestorsOf,
  descendantIds,
  flattenVisible,
  siblingsOf,
  type FlatItem,
  type PageNode,
} from '@/features/workspace/tree'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import type { PageRow } from '@/features/workspace/types'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

const ROOT_END = '__root-end__'

interface DropTarget {
  overId: string
  position: DropPosition
}

interface PageTreeProps {
  tree: readonly PageNode[]
  rows: readonly PageRow[]
  homeId: string | null
  canEdit: boolean
  currentPageId: string | undefined
  /** Chamado ao abrir uma página; a gaveta mobile usa para se fechar. */
  onNavigate?: () => void
  onCreateChild: (parentId: string) => void
}

/** Escolhe a linha sob o CENTRO do item arrastado (serve igual para mouse, toque e teclado). */
const byRowCenter: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) => {
  const centerY = collisionRect.top + collisionRect.height / 2
  let best: { id: (typeof droppableContainers)[number]['id']; distance: number } | null = null
  for (const container of droppableContainers) {
    if (container.disabled) continue
    const rect = droppableRects.get(container.id)
    if (!rect) continue
    const distance =
      centerY < rect.top
        ? rect.top - centerY
        : centerY > rect.top + rect.height
          ? centerY - (rect.top + rect.height)
          : 0
    if (best === null || distance < best.distance) best = { id: container.id, distance }
  }
  return best === null ? [] : [{ id: best.id }]
}

function positionFor(overTop: number, overHeight: number, activeCenterY: number): DropPosition {
  const ratio = (activeCenterY - overTop) / Math.max(overHeight, 1)
  if (ratio < 0.3) return 'before'
  if (ratio > 0.7) return 'after'
  return 'inside'
}

function RootDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_END })
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={cn(
        'mt-1 rounded-tag px-2 text-meta text-faint',
        active ? 'min-h-8 border border-dashed py-1.5' : 'h-0 overflow-hidden',
        isOver && 'border-primary bg-primary/20 text-strong',
      )}
    >
      {active ? t('workspace.tree.dropToRoot') : null}
    </div>
  )
}

/**
 * Lista plana de `role="treeitem"` (com aria-level) para facilitar o foco e o arrastar. Teclado:
 * setas, Home/End, Enter abre, Espaço expande/recolhe, F2 renomeia, Shift+F10 abre o menu.
 * Mover sem arrastar: "Mover para…" no menu da linha.
 */
export function PageTree({
  tree,
  rows,
  homeId,
  canEdit,
  currentPageId,
  onNavigate,
  onCreateChild,
}: PageTreeProps) {
  const navigate = useNavigate()
  const expanded = useTreeUiStore((state) => state.expanded)
  const toggle = useTreeUiStore((state) => state.toggle)
  const expand = useTreeUiStore((state) => state.expand)
  const { renamePage, setPageIcon, movePage } = usePageMutations()

  const listRef = useRef<HTMLUListElement | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [moving, setMoving] = useState<PageRow | null>(null)
  const [iconFor, setIconFor] = useState<PageRow | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const flat = useMemo(() => flattenVisible(tree, expanded), [tree, expanded])
  const siblingsCount = useMemo(() => {
    const counts = new Map<string | null, number>()
    for (const item of flat) counts.set(item.parentId, (counts.get(item.parentId) ?? 0) + 1)
    return counts
  }, [flat])
  const positionInParent = useMemo(() => {
    const seen = new Map<string | null, number>()
    return new Map(
      flat.map((item) => {
        const next = (seen.get(item.parentId) ?? 0) + 1
        seen.set(item.parentId, next)
        return [item.page.id, next] as const
      }),
    )
  }, [flat])

  // Abrir uma página (ou chegar nela por link) mostra o caminho até ela na árvore.
  const lastRevealed = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (currentPageId === undefined || lastRevealed.current === currentPageId) return
    if (!rows.some((row) => row.id === currentPageId)) return
    lastRevealed.current = currentPageId
    for (const ancestor of ancestorsOf(rows, currentPageId)) expand(ancestor.id)
  }, [currentPageId, rows, expand])

  const effectiveActiveId =
    [activeId, currentPageId].find((id) => id !== null && flat.some((i) => i.page.id === id)) ??
    flat[0]?.page.id

  function focusItem(id: string) {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>('[data-page-id]')
    Array.from(nodes ?? [])
      .find((node) => node.dataset.pageId === id)
      ?.focus()
  }

  function openPage(id: string) {
    void navigate(pagePath(id))
    onNavigate?.()
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLLIElement>,
    item: FlatItem,
    openMenu: () => void,
  ) {
    const index = flat.findIndex((entry) => entry.page.id === item.page.id)
    const focusAt = (position: number) => {
      const target = flat[position]
      if (target) focusItem(target.page.id)
    }

    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1)
        break
      case 'ArrowUp':
        focusAt(index - 1)
        break
      case 'Home':
        focusAt(0)
        break
      case 'End':
        focusAt(flat.length - 1)
        break
      case 'ArrowRight':
        if (!item.hasChildren) return
        if (item.expanded) focusAt(index + 1)
        else toggle(item.page.id)
        break
      case 'ArrowLeft':
        if (item.expanded) toggle(item.page.id)
        else if (item.parentId !== null) focusItem(item.parentId)
        else return
        break
      case 'Enter':
        openPage(item.page.id)
        break
      case ' ':
        if (item.hasChildren) toggle(item.page.id)
        else openPage(item.page.id)
        break
      case 'F2':
        if (!canEdit) return
        useTreeUiStore.getState().startRename(item.page.id)
        break
      case 'ContextMenu':
        if (!canEdit) return
        openMenu()
        break
      case 'F10':
        if (!canEdit || !event.shiftKey) return
        openMenu()
        break
      default:
        return
    }
    event.preventDefault()
  }

  // Arrastar -----------------------------------------------------------------------------------

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Segurar 250 ms para arrastar; antes disso o dedo rola a sidebar normalmente.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const draggedSubtree = useMemo(() => {
    if (draggingId === null) return new Set<string>()
    return new Set([draggingId, ...descendantIds(rows, draggingId)])
  }, [draggingId, rows])

  const titleOf = (id: string | number) => {
    const title = rows.find((row) => row.id === id)?.title
    return title === undefined || title === '' ? t('workspace.tree.untitled') : title
  }

  function resolveDrop(draggedId: string, target: DropTarget) {
    if (target.overId === ROOT_END) {
      return { parentId: null, index: siblingsOf(rows, homeId, null, draggedId).length }
    }
    const over = flat.find((item) => item.page.id === target.overId)
    if (!over) return null

    if (target.position === 'inside') {
      return {
        parentId: over.page.id,
        index: siblingsOf(rows, homeId, over.page.id, draggedId).length,
      }
    }
    if (target.position === 'after' && over.hasChildren && over.expanded) {
      return { parentId: over.page.id, index: 0 }
    }
    const siblings = siblingsOf(rows, homeId, over.parentId, draggedId)
    const at = siblings.findIndex((row) => row.id === over.page.id)
    if (at < 0) return null
    return { parentId: over.parentId, index: target.position === 'after' ? at + 1 : at }
  }

  function updateDropTarget(event: DragMoveEvent) {
    const { over, active } = event
    const activeRect = active.rect.current.translated
    if (!over || !activeRect) {
      setDropTarget(null)
      return
    }
    const overId = String(over.id)
    const position =
      overId === ROOT_END
        ? 'inside'
        : positionFor(over.rect.top, over.rect.height, activeRect.top + activeRect.height / 2)
    setDropTarget((current) =>
      current?.overId === overId && current.position === position ? current : { overId, position },
    )
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id)
    const target = dropTarget
    setDraggingId(null)
    setDropTarget(null)
    if (target === null || !event.over) return
    const destination = resolveDrop(draggedId, target)
    if (destination) void movePage(draggedId, destination.parentId, destination.index)
  }

  function cancelDrag() {
    setDraggingId(null)
    setDropTarget(null)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={byRowCenter}
        onDragStart={handleDragStart}
        onDragMove={updateDropTarget}
        onDragEnd={handleDragEnd}
        onDragCancel={cancelDrag}
        accessibility={{
          screenReaderInstructions: { draggable: t('workspace.drag.instructions') },
          announcements: {
            onDragStart: ({ active }) => t('workspace.drag.picked', { title: titleOf(active.id) }),
            onDragOver: ({ active, over }) =>
              over && String(over.id) !== ROOT_END
                ? t('workspace.drag.over', { title: titleOf(active.id), target: titleOf(over.id) })
                : undefined,
            onDragEnd: ({ active }) => t('workspace.drag.dropped', { title: titleOf(active.id) }),
            onDragCancel: () => t('workspace.drag.cancelled'),
          },
        }}
      >
        <ul
          ref={listRef}
          role="tree"
          aria-label={t('workspace.tree.treeLabel')}
          className="flex flex-col gap-0.5"
        >
          {flat.map((item) => (
            <PageTreeItem
              key={item.page.id}
              item={item}
              posInSet={positionInParent.get(item.page.id) ?? 1}
              setSize={siblingsCount.get(item.parentId) ?? 1}
              isCurrent={item.page.id === currentPageId}
              isActive={item.page.id === effectiveActiveId}
              canEdit={canEdit}
              dropDisabled={draggedSubtree.has(item.page.id)}
              dropIndicator={dropTarget?.overId === item.page.id ? dropTarget.position : null}
              onActivate={setActiveId}
              onToggle={toggle}
              onOpen={() => {
                onNavigate?.()
              }}
              onCreateChild={onCreateChild}
              onRename={(id, title) => void renamePage(id, title)}
              onChangeIcon={(id) => {
                setIconFor(rows.find((row) => row.id === id) ?? null)
              }}
              onMove={(id) => {
                setMoving(rows.find((row) => row.id === id) ?? null)
              }}
              onKeyDown={handleKeyDown}
            />
          ))}
        </ul>
        {canEdit ? <RootDropZone active={draggingId !== null} /> : null}

        <DragOverlay dropAnimation={null}>
          {draggingId === null ? null : (
            <div className="flex items-center gap-2 rounded-card border bg-popover px-2 py-1.5 text-ui text-strong shadow-lg">
              <PageIconView icon={rows.find((row) => row.id === draggingId)?.icon ?? null} />
              <span className="truncate">{titleOf(draggingId)}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <MovePageDialog
        page={moving}
        rows={rows}
        homeId={homeId}
        onClose={() => {
          setMoving(null)
        }}
        onMove={(pageId, parentId) => {
          setMoving(null)
          const count = siblingsOf(rows, homeId, parentId, pageId).length
          void movePage(pageId, parentId, count)
        }}
      />
      <IconPickerDialog
        open={iconFor !== null}
        onOpenChange={(open) => {
          if (!open) setIconFor(null)
        }}
        hasIcon={iconFor?.icon != null}
        onSelect={(icon) => {
          if (iconFor) void setPageIcon(iconFor.id, icon)
        }}
      />
    </>
  )
}
