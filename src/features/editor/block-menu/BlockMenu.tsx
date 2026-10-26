import { Popover } from 'radix-ui'
import { useEffect, useMemo, useRef } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  buildBlockMenu,
  type BlockCommand,
  type BLOCK_COLORS,
} from '@/features/editor/block-menu/block-menu'
import { transformTargets } from '@/features/editor/block-menu/block-actions'
import { BlockMenuPanel } from '@/features/editor/block-menu/BlockMenuPanel'
import type { AxnEditor } from '@/features/editor/schema'
import { t } from '@/i18n'

/** Qual bloco o menu está mostrando e onde ancorar (a alça ⋮⋮ ou o próprio bloco, pelo teclado). */
export interface BlockMenuTarget {
  blockId: string
  anchor: HTMLElement
  /** Abre direto numa subtela ("Transformar em" da barra do toque). */
  view?: 'transform'
  /** Ao fechar, o foco volta ao editor (false quando o menu veio de um toque: ver BlockMenuOpenOptions). */
  returnFocus?: boolean
}

interface BlockMenuProps {
  editor: AxnEditor
  target: BlockMenuTarget | null
  onClose: () => void
  onCommand: (blockId: string, command: BlockCommand) => void
  /** Ponteiro grosso (toque): bottom sheet em vez de popover. */
  touch: boolean
  apple: boolean
}

function typeLabel(type: string): string {
  switch (type) {
    case 'divider':
      return t('editor.blockMenu.types.divider')
    case 'table':
      return t('editor.blockMenu.types.table')
    case 'pageLink':
      return t('editor.blockMenu.types.pageLink')
    default:
      return t('editor.blockMenu.types.other')
  }
}

/**
 * O menu do bloco (⋮⋮): popover ao lado da alça no desktop; bottom sheet no toque (iPad, celular).
 * Ao fechar, o foco volta ao editor.
 */
export function BlockMenu({ editor, target, onClose, onCommand, touch, apple }: BlockMenuProps) {
  const block = target ? editor.getBlock(target.blockId) : undefined
  // O alvo já é null quando o Radix pede o foco de volta (fechar limpa o alvo antes da animação).
  const returnFocus = useRef(true)
  useEffect(() => {
    if (target) returnFocus.current = target.returnFocus !== false
  }, [target])
  const model = useMemo(() => {
    if (!block) return null
    const colors = editor.dictionary.color_picker.colors
    return buildBlockMenu({
      block: { type: block.type, props: block.props },
      contentType: editor.schema.blockSchema[block.type].content,
      targets: transformTargets(editor),
      typeLabel,
      apple,
      labels: {
        transform: t('editor.blockMenu.transform'),
        color: t('editor.blockMenu.color'),
        textColor: editor.dictionary.color_picker.text_title,
        backgroundColor: editor.dictionary.color_picker.background_title,
        copyLink: t('editor.blockMenu.copyLink'),
        duplicate: t('editor.blockMenu.duplicate'),
        remove: t('editor.blockMenu.remove'),
        colorNames: {
          ...colors,
          default: t('editor.blockMenu.defaultColor'),
        } satisfies Record<(typeof BLOCK_COLORS)[number], string>,
      },
    })
  }, [block, editor, apple])

  const open = target !== null && model !== null
  const onOpenChange = (next: boolean) => {
    if (!next) onClose()
  }
  const run = (command: BlockCommand) => {
    if (!target) return
    onClose()
    onCommand(target.blockId, command)
  }
  const focusEditor = (event: Event) => {
    event.preventDefault()
    if (returnFocus.current) editor.focus()
  }

  const panel = model ? (
    <BlockMenuPanel
      // Outro bloco (ou outra subtela) = menu do zero (sem busca nem submenu do anterior).
      key={`${target?.blockId ?? ''}:${target?.view ?? ''}`}
      initialSubmenu={target?.view}
      title={model.title}
      entries={model.entries}
      onCommand={run}
      apple={apple}
      touch={touch}
      focusOnOpen={!touch}
    />
  ) : null

  if (touch) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
          }}
          onCloseAutoFocus={focusEditor}
          className="bg-popover pt-2"
        >
          <SheetTitle className="sr-only">{t('editor.blockMenu.label')}</SheetTitle>
          <SheetDescription className="sr-only">{model?.title}</SheetDescription>
          <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-hover" />
          {panel}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor virtualRef={{ current: target?.anchor ?? null }} />
      <Popover.Portal>
        <Popover.Content
          side="left"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-label={t('editor.blockMenu.label')}
          onCloseAutoFocus={focusEditor}
          className="z-50 flex max-h-[min(var(--radix-popover-content-available-height),26rem)] w-64 flex-col overflow-hidden rounded-card border bg-popover text-popover-foreground shadow-lg"
        >
          {panel}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
