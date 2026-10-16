import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { fetchFavorites } from '@/features/favorites/api/favorites'
import { favoriteKeys } from '@/features/favorites/query-keys'

/** Favoritos do usuário logado (a posição de cada um); os títulos vêm de `usePages`. */
export function useFavorites() {
  const userId = useAuth().session?.user.id

  return useQuery({
    queryKey: favoriteKeys.list(userId),
    queryFn: () => fetchFavorites(userId ?? ''),
    enabled: userId !== undefined,
  })
}
