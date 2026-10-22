import { useQueryClient } from '@tanstack/react-query'
import { SmilePlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { DESKTOP_QUERY } from '@/app/layout/AppLayout'
import { TopBarPortal } from '@/app/layout/top-bar-slot'
import { loadPageEditor } from '@/features/editor/load-page-editor'
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton'
import { useRecordVisit } from '@/features/recents/hooks/use-record-visit'
import { Breadcrumb } from '@/features/pages/components/Breadcrumb'
import { PageMenu } from '@/features/pages/components/PageMenu'
import { PageTitle } from '@/features/pages/components/PageTitle'
import { wantsTitleFocus } from '@/features/pages/routes'
import { IconPickerDialog } from '@/features/workspace/components/IconPickerDialog'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { markPageEditedLocally } from '@/features/workspace/last-edited'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { ancestorsOf, canTrash } from '@/features/workspace/tree'
import { canEdit as canEditWorkspace, type PageRow } from '@/features/workspace/types'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useNow } from '@/hooks/use-now'
import { t } from '@/i18n'
import { lazyWithReload } from '@/lib/lazy-with-reload'
import { formatEditedAgo } from '@/lib/relative-time'

// BlockNote e Yjs ficam num chunk próprio (a entrada e o app logado não crescem). O AppLayout já o
// adianta em tempo ocioso; se a página abrir antes disso, o download começa aqui.
const PageEditor = lazyWithReload(loadPageEditor)

interface PageViewProps {
  page: PageRow
  /** Página na lixeira: abre só para leitura, com aviso. */
  trashed?: boolean
}

/**
 * Página aberta: breadcrumb no topo, ícone, título, "Editada há…" com o status do salvamento ao lado
 * (o editor o desenha no `statusSlot`, para o código de sincronização ficar no chunk do editor) e o
 * editor de blocos.
 */
export function PageView({ page, trashed = false }: PageViewProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const now = useNow()
  const workspace = useWorkspace().data
  const rows = usePages().data
  const { setPageIcon } = usePageMutations()
  const [pickingIcon, setPickingIcon] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null)
  const queryClient = useQueryClient()
  const workspaceId = workspace?.id
  const onContentSaved = useCallback(() => {
    markPageEditedLocally(queryClient, workspaceId, page.id, Date.now())
  }, [queryClient, workspaceId, page.id])

  useRecordVisit(trashed ? null : page.id)

  const editable = !trashed && (workspace ? canEditWorkspace(workspace) : false)
  const ancestors = useMemo(() => ancestorsOf(rows ?? [], page.id), [rows, page.id])
  const trashable =
    !trashed && canTrash(rows ?? [], workspace?.homePageId ?? null, page.id, editable)

  // A navegação de "nova página" pede foco no título; consome o aviso para não repetir ao voltar.
  const [focusTitle] = useState(() => wantsTitleFocus(location.state))
  useEffect(() => {
    if (wantsTitleFocus(location.state)) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  const edited = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <p className="shrink-0 text-meta text-muted-foreground">
        {formatEditedAgo(page.lastEditedAt, now)}
      </p>
      <span ref={setStatusSlot} className="flex min-w-0" />
    </div>
  )

  return (
    <>
      <TopBarPortal>
        <Breadcrumb ancestors={ancestors} page={page} compact={!isDesktop} />
        <div className="flex shrink-0 items-center gap-2">
          {isDesktop ? edited : null}
          {trashed ? null : <FavoriteButton pageId={page.id} onError={setActionError} />}
          {trashable ? (
            <PageMenu
              pageId={page.id}
              onStart={() => {
                setActionError(null)
              }}
              onError={setActionError}
            />
          ) : null}
        </div>
      </TopBarPortal>

      <article className="mx-auto w-full max-w-content px-6 py-8 md:px-16 md:py-12">
        {trashed ? (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tag bg-red-block px-3 py-2 text-ui text-strong"
          >
            <Trash2Icon className="size-4 shrink-0 text-red" aria-hidden="true" />
            <p className="flex-1">{t('page.trashedNotice')}</p>
            <Link
              to="/lixeira"
              className="inline-flex min-h-11 items-center rounded-tag px-2 font-medium underline md:min-h-8"
            >
              {t('page.trashedOpenTrash')}
            </Link>
          </div>
        ) : null}
        {actionError === null ? null : (
          <div
            role="alert"
            className="mb-4 flex items-start gap-1 rounded-tag bg-red-block py-1 pr-1 pl-3 text-ui text-red"
          >
            <p className="flex-1 py-1">{actionError}</p>
            <button
              type="button"
              aria-label={t('common.dismiss')}
              onClick={() => {
                setActionError(null)
              }}
              className="flex size-11 shrink-0 items-center justify-center rounded-tag hover:bg-hover md:size-8"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setPickingIcon(true)
            }}
            aria-label={t(page.icon ? 'page.iconChange' : 'page.iconAdd')}
            className="mb-3 flex min-h-11 items-center gap-2 rounded-tag px-1 text-muted-foreground hover:bg-hover hover:text-strong md:min-h-9"
          >
            {page.icon ? (
              <PageIconView icon={page.icon} className="size-14 text-5xl md:size-16 md:text-6xl" />
            ) : (
              <>
                <SmilePlusIcon className="size-4" aria-hidden="true" />
                <span className="text-ui">{t('page.iconAdd')}</span>
              </>
            )}
          </button>
        ) : page.icon ? (
          <PageIconView icon={page.icon} className="mb-3 size-14 text-5xl md:size-16 md:text-6xl" />
        ) : null}

        <PageTitle
          pageId={page.id}
          title={page.title}
          editable={editable}
          focusOnMount={focusTitle}
        />
        {isDesktop ? null : <div className="mt-2">{edited}</div>}

        <Suspense
          fallback={<p className="mt-6 text-ui text-muted-foreground">{t('editor.loading')}</p>}
        >
          <PageEditor
            pageId={page.id}
            editable={editable}
            statusSlot={statusSlot}
            onContentSaved={onContentSaved}
          />
        </Suspense>
      </article>

      <IconPickerDialog
        open={pickingIcon}
        onOpenChange={setPickingIcon}
        hasIcon={page.icon !== null}
        onSelect={(icon) => {
          void setPageIcon(page.id, icon)
        }}
      />
    </>
  )
}
