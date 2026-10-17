import { XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DeleteForeverDialog } from '@/features/trash/components/DeleteForeverDialog'
import { TrashRow } from '@/features/trash/components/TrashRow'
import { useTrash } from '@/features/trash/hooks/use-trash'
import { useTrashActions } from '@/features/trash/hooks/use-trash-actions'
import { buildTrashRoots, type TrashRoot } from '@/features/trash/trash'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { canEdit as canEditWorkspace } from '@/features/workspace/types'
import { useNow } from '@/hooks/use-now'
import { t } from '@/i18n'

/** Rota /lixeira: as raízes da lixeira do workspace, com restaurar e excluir definitivamente. */
export function TrashPage() {
  const now = useNow()
  const workspace = useWorkspace()
  const trash = useTrash()
  const pages = usePages()
  const { busy, error, clearError, restore, deleteForever } = useTrashActions()
  const [deleting, setDeleting] = useState<TrashRoot | null>(null)

  const canEdit = workspace.data ? canEditWorkspace(workspace.data) : false
  const homeId = workspace.data?.homePageId ?? null
  const roots = useMemo(
    () => (trash.data ? buildTrashRoots(trash.data, pages.data, homeId) : []),
    [trash.data, pages.data, homeId],
  )

  const failed = workspace.isError || trash.isError
  const loading = !failed && (workspace.isPending || trash.isPending)

  async function confirmDelete(root: TrashRoot) {
    await deleteForever(root.page.id)
    setDeleting(null)
  }

  return (
    <article className="mx-auto w-full max-w-content px-6 py-8 md:px-16 md:py-12">
      <h1 className="text-title font-bold text-strong">{t('trash.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('trash.description')}</p>

      {error === null ? null : (
        <div
          role="alert"
          className="mt-6 flex items-start gap-1 rounded-tag bg-red-block py-1 pr-1 pl-3 text-ui text-red"
        >
          <p className="flex-1 py-1">{error}</p>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={clearError}
            className="flex size-11 shrink-0 items-center justify-center rounded-tag hover:bg-hover md:size-8"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-6">
        {failed ? (
          <div>
            <p role="alert" className="text-muted-foreground">
              {t('trash.loadError')}
            </p>
            <Button
              variant="ghost"
              size="inline"
              onClick={() => {
                void workspace.refetch()
                void trash.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : loading ? (
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">{t('trash.loading')}</span>
            {[0, 1, 2].map((key) => (
              <span key={key} aria-hidden="true" className="h-14 rounded-card bg-hover" />
            ))}
          </div>
        ) : roots.length === 0 ? (
          <p className="text-muted-foreground">{t('trash.empty')}</p>
        ) : (
          <ul aria-label={t('trash.listLabel')} className="flex flex-col gap-3">
            {roots.map((root) => (
              <TrashRow
                key={root.page.id}
                root={root}
                now={now}
                canEdit={canEdit}
                busy={busy.get(root.page.id)}
                onRestore={(id) => void restore(id)}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        )}
      </div>

      <DeleteForeverDialog
        root={deleting}
        deleting={deleting !== null && busy.get(deleting.page.id) === 'delete'}
        onConfirm={() => {
          if (deleting) void confirmDelete(deleting)
        }}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </article>
  )
}
