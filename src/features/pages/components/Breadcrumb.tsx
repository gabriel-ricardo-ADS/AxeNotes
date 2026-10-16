import { Link } from 'react-router'
import { pagePath } from '@/features/pages/routes'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import type { PageRow } from '@/features/workspace/types'
import { t } from '@/i18n'

interface BreadcrumbProps {
  /** Do topo até o pai. */
  ancestors: readonly PageRow[]
  page: PageRow
  /** Mobile: só o pai e a página atual (o resto some atrás de "…"). */
  compact: boolean
}

type Part = PageRow | { hidden: readonly PageRow[] }

const titleOf = (page: PageRow) => (page.title === '' ? t('workspace.tree.untitled') : page.title)

function partsFor(ancestors: readonly PageRow[], compact: boolean): Part[] {
  if (compact) {
    return ancestors.length > 1
      ? [{ hidden: ancestors.slice(0, -1) }, ...ancestors.slice(-1)]
      : [...ancestors]
  }
  return ancestors.length > 4
    ? [...ancestors.slice(0, 1), { hidden: ancestors.slice(1, -3) }, ...ancestors.slice(-3)]
    : [...ancestors]
}

/** Caminho da página com ícones. Muito fundo vira "primeiro / … / últimos"; no mobile, só o pai. */
export function Breadcrumb({ ancestors, page, compact }: BreadcrumbProps) {
  return (
    <nav aria-label={t('page.breadcrumbLabel')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-ui text-muted-foreground">
        {partsFor(ancestors, compact).map((part) =>
          'hidden' in part ? (
            <li key="more" className="flex shrink-0 items-center gap-1">
              <span
                role="img"
                aria-label={t('page.breadcrumbMore')}
                title={part.hidden.map(titleOf).join(' / ')}
              >
                …
              </span>
              <span aria-hidden="true">/</span>
            </li>
          ) : (
            <li key={part.id} className="flex min-w-0 items-center gap-1">
              <Link
                to={pagePath(part.id)}
                className="flex min-h-8 min-w-0 items-center gap-1 rounded-tag px-1 hover:bg-hover hover:text-strong pointer-coarse:min-h-11"
              >
                <PageIconView icon={part.icon} />
                <span className="max-w-32 truncate md:max-w-40">{titleOf(part)}</span>
              </Link>
              <span aria-hidden="true">/</span>
            </li>
          ),
        )}
        <li className="flex min-w-0 items-center gap-1 px-1 text-strong" aria-current="page">
          <PageIconView icon={page.icon} />
          <span className="max-w-40 truncate md:max-w-64">{titleOf(page)}</span>
        </li>
      </ol>
    </nav>
  )
}
