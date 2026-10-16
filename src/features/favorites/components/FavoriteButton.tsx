import { StarIcon } from 'lucide-react'
import { useFavoriteMutations } from '@/features/favorites/hooks/use-favorite-mutations'
import { useFavorites } from '@/features/favorites/hooks/use-favorites'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  pageId: string
  /** Recebe a mensagem (pt-BR) quando favoritar ou desfavoritar falha; a tela decide onde mostrar. */
  onError: (message: string) => void
}

/** Estrela da página: alterna o favorito do usuário. Qualquer papel pode (é dado por usuário). */
export function FavoriteButton({ pageId, onError }: FavoriteButtonProps) {
  const favorites = useFavorites()
  const { toggleFavorite } = useFavoriteMutations()

  const isFavorite = favorites.data?.some((entry) => entry.pageId === pageId) ?? false

  return (
    <button
      type="button"
      aria-pressed={isFavorite}
      aria-label={t(isFavorite ? 'favorites.remove' : 'favorites.add')}
      disabled={favorites.data === undefined}
      onClick={() => {
        const wasFavorite = isFavorite
        void toggleFavorite(pageId, { silent: true }).then((ok) => {
          if (!ok) onError(t(wasFavorite ? 'favorites.errors.remove' : 'favorites.errors.add'))
        })
      }}
      className="flex size-11 shrink-0 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover hover:text-strong disabled:opacity-50 md:size-8"
    >
      <StarIcon
        className={cn('size-4', isFavorite && 'fill-current text-yellow')}
        aria-hidden="true"
      />
    </button>
  )
}
