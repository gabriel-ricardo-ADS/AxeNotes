import { useQuery } from '@tanstack/react-query'
import { fetchTrashedPages } from '@/features/trash/api/trash'
import { trashKeys } from '@/features/trash/query-keys'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'

/** Páginas do workspace que estão na lixeira (as raízes são derivadas por `buildTrashRoots`). */
export function useTrash() {
  const workspaceId = useWorkspace().data?.id

  return useQuery({
    queryKey: trashKeys.list(workspaceId),
    queryFn: () => fetchTrashedPages(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  })
}
