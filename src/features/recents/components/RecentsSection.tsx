import { useMatch } from 'react-router'
import { useVisibleRecents } from '@/features/recents/hooks/use-visible-recents'
import { PageLinkRow } from '@/features/workspace/components/PageLinkRow'
import { SectionError, SectionLoading } from '@/features/workspace/components/SectionState'
import { t } from '@/i18n'

interface RecentsSectionProps {
  /** Chamado ao abrir uma página; a gaveta mobile usa para se fechar. */
  onNavigate?: () => void
}

/** Seção "Recentes" da sidebar: as últimas páginas abertas (sem a página inicial). */
export function RecentsSection({ onNavigate }: RecentsSectionProps) {
  const { pages: visible, loading, failed, retry } = useVisibleRecents()
  const match = useMatch('/p/:pageId')

  return (
    <section aria-labelledby="sidebar-recents">
      <h2 id="sidebar-recents" className="px-2 pb-1 text-meta font-medium text-muted-foreground">
        {t('layout.sidebar.recents')}
      </h2>

      {failed ? (
        <SectionError message={t('recents.loadError')} onRetry={retry} />
      ) : loading ? (
        <SectionLoading label={t('recents.loading')} />
      ) : visible.length === 0 ? (
        <p className="px-2 text-muted-foreground">{t('layout.sidebar.recentsEmpty')}</p>
      ) : (
        <ul aria-label={t('recents.listLabel')} className="flex flex-col gap-0.5">
          {visible.map((page) => (
            <PageLinkRow
              key={page.id}
              page={page}
              isCurrent={page.id === match?.params.pageId}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
