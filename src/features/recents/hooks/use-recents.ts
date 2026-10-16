import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { fetchRecents } from '@/features/recents/api/recents'
import { recentKeys } from '@/features/recents/query-keys'

/** Visitas recentes do usuário logado; os títulos vêm de `usePages`. */
export function useRecents() {
  const userId = useAuth().session?.user.id

  return useQuery({
    queryKey: recentKeys.list(userId),
    queryFn: () => fetchRecents(userId ?? ''),
    enabled: userId !== undefined,
  })
}
