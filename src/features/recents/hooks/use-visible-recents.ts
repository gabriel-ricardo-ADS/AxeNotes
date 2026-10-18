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
  /** Recarrega as visitas e a lista de páginas. */
  retry: () => void
}

/**
 * Os recentes que a sidebar e a busca mostram: visitas do usuário cruzadas com as páginas vivas
 * (`usePages`), sem a página inicial, limitadas a RECENTS_SHOWN.
 */
export function useVisibleRecents(): VisibleRecents {
  const recents = useRecents()
  const pages = usePages()
  const homeId = useWorkspace().data?.homePageId ?? null

  const visible = useMemo(
    () => visibleRecents(recents.data ?? [], pages.data ?? [], homeId),
    [recents.data, pages.data, homeId],
  )

  const failed = recents.isError || pages.isError
  const loading =
    !failed && (recents.isPending || (pages.isPending && pages.fetchStatus !== 'idle'))

  return {
    pages: visible,
    loading,
    failed,
    retry: () => {
      void recents.refetch()
      void pages.refetch()
    },
  }
}
