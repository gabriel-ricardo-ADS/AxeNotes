import { SmilePlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { DESKTOP_QUERY } from '@/app/layout/AppLayout'
import { TopBarPortal } from '@/app/layout/top-bar-slot'
import { Breadcrumb } from '@/features/pages/components/Breadcrumb'
import { PageTitle } from '@/features/pages/components/PageTitle'
import { wantsTitleFocus } from '@/features/pages/routes'
import { IconPickerDialog } from '@/features/workspace/components/IconPickerDialog'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { ancestorsOf } from '@/features/workspace/tree'
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

  const editable = workspace ? canEditWorkspace(workspace) : false
  const ancestors = useMemo(() => ancestorsOf(rows ?? [], page.id), [rows, page.id])

  // A navegação de "nova página" pede foco no título; consome o aviso para não repetir ao voltar.
  const focusTitle = wantsTitleFocus(location.state)
  useEffect(() => {
    if (focusTitle) void navigate(location.pathname, { replace: true, state: null })
  }, [focusTitle, location.pathname, navigate])

  const edited = (
    <p className="shrink-0 text-meta text-muted-foreground">
      {formatEditedAgo(page.lastEditedAt, now)}
    </p>
  )

  return (
    <>
      <TopBarPortal>
        <Breadcrumb ancestors={ancestors} page={page} compact={!isDesktop} />
        {isDesktop ? edited : null}
      </TopBarPortal>

      <article className="mx-auto w-full max-w-content px-6 py-8 md:px-16 md:py-12">
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
