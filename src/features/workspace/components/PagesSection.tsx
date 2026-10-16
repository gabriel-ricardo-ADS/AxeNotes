import { PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useMatch, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { FOCUS_TITLE_STATE, pagePath } from '@/features/pages/routes'
import { PageTree } from '@/features/workspace/components/PageTree'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { buildPageTree } from '@/features/workspace/tree'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { canEdit as canEditWorkspace } from '@/features/workspace/types'
import { t } from '@/i18n'

interface PagesSectionProps {
  /** Chamado ao abrir uma página; a gaveta mobile usa para se fechar. */
  onNavigate?: () => void
}

/** Seção "Páginas" da sidebar: a árvore do workspace, com criar, renomear, ícone e mover. */
export function PagesSection({ onNavigate }: PagesSectionProps) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const workspace = useWorkspace()
  const pages = usePages()
  const { createPage } = usePageMutations()
  const notice = useTreeUiStore((state) => state.notice)
  const setNotice = useTreeUiStore((state) => state.setNotice)
  const bindUser = useTreeUiStore((state) => state.bindUser)
  const match = useMatch('/p/:pageId')

  const userId = session?.user.id
  useEffect(() => {
    bindUser(userId)
  }, [bindUser, userId])

  const homeId = workspace.data?.homePageId ?? null
  const rows = useMemo(() => pages.data ?? [], [pages.data])
  const tree = useMemo(() => buildPageTree(rows, homeId), [rows, homeId])
  const canEdit = workspace.data ? canEditWorkspace(workspace.data) : false

  async function handleCreate(parentId: string | null) {
    setNotice(null)
    const id = await createPage(parentId)
    if (id === null) return
    void navigate(pagePath(id), { state: FOCUS_TITLE_STATE })
    onNavigate?.()
  }

  const failed = workspace.isError || pages.isError
  const loading = !failed && (workspace.isPending || (pages.isPending && pages.fetchStatus !== 'idle'))

  return (
    <section aria-labelledby="sidebar-pages">
      <div className="flex items-center justify-between pr-1 pl-2">
        <h2 id="sidebar-pages" className="pb-1 text-meta font-medium text-muted-foreground">
          {t('workspace.tree.sectionTitle')}
        </h2>
        {canEdit ? (
          <button
            type="button"
            aria-label={t('workspace.tree.newRoot')}
            onClick={() => {
              void handleCreate(null)
            }}
            className="flex h-11 w-9 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover hover:text-strong md:h-7 md:w-7 md:pointer-coarse:h-11 md:pointer-coarse:w-9"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {notice === null ? null : (
        <div
          role="alert"
          className="mb-1 flex items-start gap-1 rounded-tag bg-red-block py-1 pr-1 pl-2 text-meta text-red"
        >
          <p className="flex-1 py-1">{notice}</p>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={() => {
              setNotice(null)
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-tag hover:bg-hover"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {failed ? (
        <div className="px-2">
          <p role="alert" className="text-muted-foreground">
            {t('workspace.tree.loadError')}
          </p>
          <Button
            variant="ghost"
            size="inline"
            onClick={() => {
              void workspace.refetch()
              void pages.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : loading ? (
        <div role="status" className="flex flex-col gap-2 px-2 py-1">
          <span className="sr-only">{t('workspace.tree.loading')}</span>
          {[0, 1, 2].map((key) => (
            <span key={key} aria-hidden="true" className="h-4 w-4/5 rounded-tag bg-hover" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <p className="px-2 text-muted-foreground">{t('workspace.tree.empty')}</p>
      ) : (
        <PageTree
          tree={tree}
          rows={rows}
          homeId={homeId}
          canEdit={canEdit}
          currentPageId={match?.params.pageId}
          onNavigate={onNavigate}
          onCreateChild={(parentId) => {
            void handleCreate(parentId)
          }}
        />
      )}
    </section>
  )
}
