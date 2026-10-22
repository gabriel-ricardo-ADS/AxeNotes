import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { pagePath } from '@/features/pages/routes'
import type { TrashRowAction } from '@/features/trash/hooks/use-trash-actions'
import { separateCount, type TrashOrigin, type TrashRoot } from '@/features/trash/trash'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { t } from '@/i18n'
import { formatTrashedAgo } from '@/lib/relative-time'

interface TrashRowProps {
  root: TrashRoot
  now: Date
  /** Editor/owner: o leitor só vê a lista. */
  canEdit: boolean
  /** Ação em andamento nesta linha (a linha inteira fica desabilitada). */
  busy: TrashRowAction | undefined
  onRestore: (id: string) => void
  onDelete: (root: TrashRoot) => void
}

function originText(origin: TrashOrigin): string | null {
  switch (origin.kind) {
    case 'root':
      return t('trash.originRoot')
    case 'page': {
      const title = origin.title || t('workspace.tree.untitled')
      return t(origin.trashed ? 'trash.originPageTrashed' : 'trash.originPage', { title })
    }
    case 'unknown':
      return null
  }
}

function subpagesText(root: TrashRoot): string | null {
  if (root.sameStampCount === 0) return null
  return root.sameStampCount === 1
    ? t('trash.subpagesOne')
    : t('trash.subpagesMany', { count: root.sameStampCount })
}

/** Uma raiz da lixeira: ícone, título, "Excluída há X · +N subpáginas", origem e as ações. */
export function TrashRow({ root, now, canEdit, busy, onRestore, onDelete }: TrashRowProps) {
  const { page } = root
  const title = page.title || t('workspace.tree.untitled')
  const meta = [formatTrashedAgo(page.trashedAt, now), subpagesText(root)]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
  const origin = originText(root.origin)

  return (
    <li
      data-separate={separateCount(root) > 0 ? 'true' : undefined}
      className="flex flex-col gap-2 rounded-card border p-3 lg:flex-row lg:items-center lg:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <PageIconView icon={page.icon} className="mt-1" />
        <div className="min-w-0">
          {/* Abre a página só para leitura (dá para conferir o conteúdo antes de restaurar). */}
          <Link
            to={pagePath(page.id)}
            className="block truncate rounded-tag font-medium text-strong hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {title}
          </Link>
          <p className="text-meta text-muted-foreground">{meta}</p>
          {origin === null ? null : (
            <p className="truncate text-meta text-muted-foreground">{origin}</p>
          )}
        </div>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="border"
            disabled={busy !== undefined}
            aria-label={t('trash.restoreNamed', { title })}
            onClick={() => {
              onRestore(page.id)
            }}
          >
            {busy === 'restore' ? t('trash.restoring') : t('trash.restore')}
          </Button>
          <Button
            variant="ghost"
            className="border text-danger"
            disabled={busy !== undefined}
            aria-label={t('trash.deleteNamed', { title })}
            onClick={() => {
              onDelete(root)
            }}
          >
            {t('trash.deleteForever')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}
