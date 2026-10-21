import { useMemo } from 'react'
import { useRecents } from '@/features/recents/hooks/use-recents'
import { visibleRecents } from '@/features/recents/recents'
import { usePages } from '@/features/workspace/hooks/use-pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import type { PageRow } from '@/features/workspace/types'

export interface VisibleRecents {
  /** Os recentes para mostrar (sem a página inicial, a lixeira e o que o usuário não alcança). */
  pages: PageRow[]
  loading: boolean
  failed: boolean
  /** Recarrega as visitas, o workspace e a lista de páginas. */
  retry: () => void
}

/**
 * Os recentes que a sidebar e a busca mostram: visitas do usuário cruzadas com as páginas vivas
 * (`usePages`), sem a página inicial, limitadas a RECENTS_SHOWN.
 */
export function useVisibleRecents(): VisibleRecents {
  const recents = useRecents()
  const pages = usePages()
  const workspace = useWorkspace()
  const homeId = workspace.data?.homePageId ?? null

  const visible = useMemo(
    () => visibleRecents(recents.data ?? [], pages.data ?? [], homeId),
    [recents.data, pages.data, homeId],
  )

  // Sem workspace as páginas ficam paradas (`idle`): um erro dele sem dados é falha, não "lista vazia".
  // Workspace `null` (usuário sem workspace) não é falha: não há páginas e o vazio está certo.
  const workspaceFailed = workspace.isError && workspace.data === undefined
  const failed = recents.isError || pages.isError || workspaceFailed
  const loading =
    !failed &&
    (recents.isPending ||
      (workspace.isPending && workspace.fetchStatus !== 'idle') ||
      (pages.isPending && pages.fetchStatus !== 'idle'))

  return {
    pages: visible,
    loading,
    failed,
    retry: () => {
      void recents.refetch()
      // Sem workspace as páginas estão paradas (refazê-las consultaria com id vazio): ao carregar, elas rodam sozinhas.
      if (workspace.data) void pages.refetch()
      else void workspace.refetch()
    },
  }
}
