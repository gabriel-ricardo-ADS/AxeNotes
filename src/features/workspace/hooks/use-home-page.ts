import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { ensureHomePage } from '@/features/workspace/home'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { workspaceKeys } from '@/features/workspace/query-keys'
import type { WorkspaceInfo } from '@/features/workspace/types'

/** Situação da página inicial: carregando, erro (com `retry`), inexistente ou pronta. */
export type HomePageState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  /** O workspace não tem página inicial e este usuário não pode criá-la (só o owner grava). */
  | { status: 'missing' }
  | { status: 'ready'; pageId: string }

/**
 * Página inicial do workspace. Se `home_page_id` ainda é nulo, o owner cria "Página inicial" na hora
 * (sob demanda); quem não é owner só vê a tela de "sem página inicial".
 */
export function useHomePage(): HomePageState {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const workspaceQuery = useWorkspace()
  const workspace = workspaceQuery.data
  const userId = session?.user.id

  const needsCreation = workspace?.homePageId === null && workspace.role === 'owner'

  const creation = useQuery({
    queryKey: workspaceKeys.home(workspace?.id),
    queryFn: async () => {
      const pageId = await ensureHomePage(workspace?.id ?? '', userId ?? '')
      if (workspace && pageId !== null) {
        const updated: WorkspaceInfo = { ...workspace, homePageId: pageId }
        queryClient.setQueryData(workspaceKeys.workspace(userId), updated)
        await queryClient.invalidateQueries({ queryKey: workspaceKeys.pages(workspace.id) })
      }
      return pageId
    },
    enabled: needsCreation && userId !== undefined,
    retry: false,
    // Sem cache entre usos: se a página inicial um dia for apagada, a criação roda de novo.
    staleTime: 0,
  })

  if (workspaceQuery.isError) {
    return { status: 'error', retry: () => void workspaceQuery.refetch() }
  }
  if (workspaceQuery.isPending) return { status: 'loading' }
  if (workspace === null || workspace === undefined) return { status: 'missing' }
  if (workspace.homePageId !== null) return { status: 'ready', pageId: workspace.homePageId }
  if (!needsCreation) return { status: 'missing' }

  if (creation.isError) return { status: 'error', retry: () => void creation.refetch() }
  if (creation.isSuccess && !creation.isFetching) {
    return creation.data === null
      ? { status: 'missing' }
      : { status: 'ready', pageId: creation.data }
  }
  return { status: 'loading' }
}
