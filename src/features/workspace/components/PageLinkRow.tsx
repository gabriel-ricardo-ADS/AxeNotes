import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { pagePath } from '@/features/pages/routes'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { rowActionsClass } from '@/features/workspace/components/row-styles'
import type { PageRow } from '@/features/workspace/types'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface PageLinkRowProps {
  page: PageRow
  /** É a página aberta na tela. */
  isCurrent: boolean
  /** Chamado ao abrir a página; a gaveta mobile usa para se fechar. */
  onNavigate?: (() => void) | undefined
  /** Botões à direita da linha (aparecem ao passar o mouse; no toque ficam sempre visíveis). */
  actions?: ReactNode
}

/** Linha simples de página (ícone + título) das seções Favoritos e Recentes. */
export function PageLinkRow({ page, isCurrent, onNavigate, actions }: PageLinkRowProps) {
  return (
    <li
      className={cn(
        'group/row relative flex min-h-8 items-center rounded-tag pr-1 text-muted-foreground transition-colors duration-(--duration-ui) hover:bg-hover pointer-coarse:min-h-11 max-md:min-h-11',
        isCurrent && 'bg-hover font-medium text-strong',
      )}
    >
      <Link
        to={pagePath(page.id)}
        {...(isCurrent && { 'aria-current': 'page' as const })}
        onClick={onNavigate}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 self-stretch rounded-tag px-2 outline-none focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11 max-md:min-h-11"
      >
        <PageIconView icon={page.icon} />
        <span className="truncate">{page.title || t('workspace.tree.untitled')}</span>
      </Link>
      {actions === undefined ? null : <span className={rowActionsClass}>{actions}</span>}
    </li>
  )
}
