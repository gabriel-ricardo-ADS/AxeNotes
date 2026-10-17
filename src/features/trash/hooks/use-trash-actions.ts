import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deletePagePermanently, restorePage } from '@/features/trash/api/trash'
import { trashErrorMessage } from '@/features/trash/messages'
import { trashKeys } from '@/features/trash/query-keys'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { workspaceKeys } from '@/features/workspace/query-keys'

export type TrashRowAction = 'restore' | 'delete'

/**
 * Restaurar e excluir definitivamente. SEM otimismo: a linha só sai quando o servidor confirma e a
 * lista é recarregada. Enquanto isso a linha fica "ocupada" (`busy`). O erro vai para `error`, que a
 * tela mostra num aviso dentro dela (a gaveta mobile está fechada e esconderia a sidebar).
 */
export function useTrashActions() {
  const queryClient = useQueryClient()
  const workspaceId = useWorkspace().data?.id
  const [busy, setBusy] = useState<ReadonlyMap<string, TrashRowAction>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const invalidatePages = () =>
    queryClient.invalidateQueries({ queryKey: workspaceKeys.pages(workspaceId) })
  const invalidateTrash = () =>
    queryClient.invalidateQueries({ queryKey: trashKeys.list(workspaceId) })

  function setBusyFor(id: string, action: TrashRowAction | null) {
    setBusy((current) => {
      const next = new Map(current)
      if (action === null) next.delete(id)
      else next.set(id, action)
      return next
    })
  }

  /** Devolve se deu certo. Sucesso: páginas e lixeira são recarregadas UMA vez cada. */
  async function restore(id: string): Promise<boolean> {
    setError(null)
    setBusyFor(id, 'restore')
    try {
      await restorePage(id)
      await Promise.all([invalidatePages(), invalidateTrash()])
      return true
    } catch (failure) {
      setError(trashErrorMessage('restore', failure))
      return false
    } finally {
      setBusyFor(id, null)
    }
  }

  /** Devolve se deu certo. Qualquer erro recarrega a lista: ela pode estar desatualizada. */
  async function deleteForever(id: string): Promise<boolean> {
    setError(null)
    setBusyFor(id, 'delete')
    try {
      await deletePagePermanently(id)
      await invalidateTrash()
      return true
    } catch (failure) {
      setError(trashErrorMessage('delete', failure))
      await invalidateTrash()
      return false
    } finally {
      setBusyFor(id, null)
    }
  }

  return {
    busy,
    error,
    clearError: () => {
      setError(null)
    },
    restore,
    deleteForever,
  }
}
