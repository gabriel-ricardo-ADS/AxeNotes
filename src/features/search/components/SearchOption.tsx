import { PageIconView } from '@/features/workspace/components/PageIconView'
import type { PageIcon } from '@/features/workspace/page-icon'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

export interface SearchItem {
  id: string
  title: string
  icon: PageIcon | null
}

interface SearchOptionProps {
  id: string
  item: SearchItem
  /** Caminho curto da página (ancestrais), quando se sabe. */
  path: string | null
  active: boolean
  onPick: () => void
  onActivate: () => void
}

/**
 * Uma opção do listbox da busca. O foco de verdade fica no campo (aria-activedescendant); o teclado
 * é tratado lá, então a opção só reage a clique/toque e ao ponteiro do mouse.
 */
export function SearchOption({ id, item, path, active, onPick, onActivate }: SearchOptionProps) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- o teclado (↑ ↓ Enter) é tratado no campo do combobox
    <li
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      // O campo mantém o foco: sem isto o toque tira o foco dele e o teclado do iOS fecha antes do clique.
      onMouseDown={(event) => {
        event.preventDefault()
      }}
      onClick={onPick}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse' && !active) onActivate()
      }}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-tag px-2 py-1 text-ui text-muted-foreground md:min-h-9 md:py-0',
        active && 'bg-hover text-strong',
      )}
    >
      <PageIconView icon={item.icon} />
      {/* Mobile: o caminho vai numa segunda linha (o título não pode ser cortado por ele); desktop: ao lado. */}
      <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2">
        <span className="truncate md:min-w-0 md:flex-1">
          {item.title || t('workspace.tree.untitled')}
        </span>
        {path === null ? null : (
          <span className="truncate text-meta text-faint md:max-w-[45%] md:shrink-0">{path}</span>
        )}
      </span>
    </li>
  )
}
