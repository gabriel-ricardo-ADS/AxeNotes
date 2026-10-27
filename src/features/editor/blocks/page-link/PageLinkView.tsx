import { FileXIcon } from 'lucide-react'
import { Link } from 'react-router'
import { isPageId } from '@/features/editor/blocks/page-link/page-link-id'
import { pagePath } from '@/features/pages/routes'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { usePage } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { t } from '@/i18n'

/**
 * Corpo do bloco "link para página": ícone e título ATUAIS da página (do cache do workspace, nunca
 * gravados no Y.Doc). Página na lixeira continua clicável (abre só para leitura); inexistente ou sem
 * acesso vira "Página indisponível", sem revelar qual dos dois.
 */
export function PageLinkView({ pageId }: { pageId: string }) {
  const valid = isPageId(pageId)
  const { lookup, retry } = usePage(valid ? pageId : undefined)
  const homeId = useWorkspace().data?.homePageId ?? null

  if (lookup.status === 'loading') {
    return (
      <span className="axn-page-link axn-page-link-muted" aria-busy="true">
        {t('editor.pageLink.loading')}
      </span>
    )
  }

  if (lookup.status === 'error') {
    return (
      <span className="axn-page-link axn-page-link-muted">
        <FileXIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>{t('editor.pageLink.error')}</span>
        <button type="button" className="axn-page-link-retry" onClick={retry}>
          {t('common.retry')}
        </button>
      </span>
    )
  }

  if (lookup.status === 'notFound') {
    return (
      <span className="axn-page-link axn-page-link-muted" aria-disabled="true">
        <FileXIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>{t('editor.pageLink.unavailable')}</span>
      </span>
    )
  }

  const { page, trashed } = lookup
  const title = page.title.trim() === '' ? t('workspace.tree.untitled') : page.title
  return (
    <Link
      to={page.id === homeId ? '/' : pagePath(page.id)}
      className="axn-page-link"
      data-trashed={trashed || undefined}
      aria-label={trashed ? t('editor.pageLink.trashedLabel', { title }) : undefined}
      draggable={false}
    >
      <PageIconView icon={page.icon} className="axn-page-link-icon size-5" />
      <span className="axn-page-link-title">{title}</span>
      {trashed ? (
        <span className="axn-page-link-tag" aria-hidden="true">
          {t('editor.pageLink.trashed')}
        </span>
      ) : null}
    </Link>
  )
}
