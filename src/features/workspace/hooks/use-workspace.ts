import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { fetchWorkspace } from '@/features/workspace/api/workspace'
import { workspaceKeys } from '@/features/workspace/query-keys'

/** Workspace do usuário logado (o pessoal) com o papel dele. `data` null = sem workspace. */
export function useWorkspace() {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: workspaceKeys.workspace(userId),
    queryFn: () => fetchWorkspace(userId ?? ''),
    enabled: userId !== undefined,
  })
}
