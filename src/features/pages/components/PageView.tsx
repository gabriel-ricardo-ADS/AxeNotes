import { SmilePlusIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { DESKTOP_QUERY } from '@/app/layout/AppLayout'
import { TopBarPortal } from '@/app/layout/top-bar-slot'
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton'
import { useRecordVisit } from '@/features/recents/hooks/use-record-visit'
import { Breadcrumb } from '@/features/pages/components/Breadcrumb'
import { PageMenu } from '@/features/pages/components/PageMenu'
import { PageTitle } from '@/features/pages/components/PageTitle'
import { wantsTitleFocus } from '@/features/pages/routes'
import { IconPickerDialog } from '@/features/workspace/components/IconPickerDialog'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { ancestorsOf, canTrash } from '@/features/workspace/tree'
import { canEdit as canEditWorkspace, type PageRow } from '@/features/workspace/types'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useNow } from '@/hooks/use-now'
import { t } from '@/i18n'
import { formatEditedAgo } from '@/lib/relative-time'

/** Página aberta: breadcrumb no topo, ícone, título editável, "Editada há…" e o corpo (editor na Fase 2). */
export function PageView({ page }: { page: PageRow }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const now = useNow()
  const workspace = useWorkspace().data
  const rows = usePages().data
  const { setPageIcon } = usePageMutations()
  const [pickingIcon, setPickingIcon] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useRecordVisit(page.id)

  const editable = workspace ? canEditWorkspace(workspace) : false
  const ancestors = useMemo(() => ancestorsOf(rows ?? [], page.id), [rows, page.id])
  const trashable = canTrash(rows ?? [], workspace?.homePageId ?? null, page.id, editable)

  // A navegação de "nova página" pede foco no título; consome o aviso para não repetir ao voltar.
  const [focusTitle] = useState(() => wantsTitleFocus(location.state))
  useEffect(() => {
    if (wantsTitleFocus(location.state)) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  const edited = (
    <p className="shrink-0 text-meta text-muted-foreground">
      {formatEditedAgo(page.lastEditedAt, now)}
    </p>
  )

  return (
    <>
      <TopBarPortal>
        <Breadcrumb ancestors={ancestors} page={page} compact={!isDesktop} />
        <div className="flex shrink-0 items-center gap-2">
          {isDesktop ? edited : null}
          <FavoriteButton pageId={page.id} onError={setActionError} />
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

        <p className="mt-10 text-muted-foreground">{t('page.bodyEmpty')}</p>
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
