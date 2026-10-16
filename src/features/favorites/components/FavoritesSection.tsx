import { StarIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useMatch } from 'react-router'
import { useFavoriteMutations } from '@/features/favorites/hooks/use-favorite-mutations'
import { useFavorites } from '@/features/favorites/hooks/use-favorites'
import { visibleFavorites } from '@/features/favorites/favorites'
import { PageLinkRow } from '@/features/workspace/components/PageLinkRow'
import { rowButtonClass } from '@/features/workspace/components/row-styles'
import { SectionError, SectionLoading } from '@/features/workspace/components/SectionState'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { t } from '@/i18n'

interface FavoritesSectionProps {
  /** Chamado ao abrir uma página; a gaveta mobile usa para se fechar. */
  onNavigate?: () => void
}

/** Seção "Favoritos" da sidebar: as páginas que o usuário marcou com a estrela, na ordem de inclusão. */
export function FavoritesSection({ onNavigate }: FavoritesSectionProps) {
  const favorites = useFavorites()
  const pages = usePages()
  const { toggleFavorite } = useFavoriteMutations()
  const match = useMatch('/p/:pageId')

  const visible = useMemo(
    () => visibleFavorites(favorites.data ?? [], pages.data ?? []),
    [favorites.data, pages.data],
  )

  const failed = favorites.isError || pages.isError
  const loading =
    !failed && (favorites.isPending || (pages.isPending && pages.fetchStatus !== 'idle'))

  return (
    <section aria-labelledby="sidebar-favorites">
      <h2 id="sidebar-favorites" className="px-2 pb-1 text-meta font-medium text-muted-foreground">
        {t('layout.sidebar.favorites')}
      </h2>

      {failed ? (
        <SectionError
          message={t('favorites.loadError')}
          onRetry={() => {
            void favorites.refetch()
            void pages.refetch()
          }}
        />
      ) : loading ? (
        <SectionLoading label={t('favorites.loading')} />
      ) : visible.length === 0 ? (
        <p className="px-2 text-muted-foreground">{t('layout.sidebar.favoritesEmpty')}</p>
      ) : (
        <ul aria-label={t('favorites.listLabel')} className="flex flex-col gap-0.5">
          {visible.map((page) => {
            const title = page.title || t('workspace.tree.untitled')
            return (
              <PageLinkRow
                key={page.id}
                page={page}
                isCurrent={page.id === match?.params.pageId}
                onNavigate={onNavigate}
                actions={
                  <button
                    type="button"
                    aria-label={t('favorites.removeNamed', { title })}
                    onClick={() => {
                      void toggleFavorite(page.id)
                    }}
                    className={rowButtonClass}
                  >
                    <StarIcon className="size-4 fill-current" aria-hidden="true" />
                  </button>
                }
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
