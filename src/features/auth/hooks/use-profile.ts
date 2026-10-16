import { useQuery } from '@tanstack/react-query'
import { fetchProfile } from '@/features/auth/api/profile'
import { useAuth } from '@/features/auth/auth-context'

/** Perfil (nome de exibição) do usuário logado. */
export function useProfile() {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId ?? ''),
    enabled: userId !== undefined,
  })
}
