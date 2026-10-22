import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { recordVisit, trimRecents } from '@/features/recents/api/recents'
import { recentKeys } from '@/features/recents/query-keys'
import {
  shouldRecord,
  trimCutoff,
  withVisit,
  type LastVisitWrite,
  type RecentEntry,
} from '@/features/recents/recents'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'

/** Última visita gravada neste aparelho (uma só: basta para barrar a mesma página repetida). */
let lastWrite: LastVisitWrite | null = null

/** Só para os testes: esquece a última gravação. */
export function resetVisitGuard() {
  lastWrite = null
}

/**
 * Registra que o usuário abriu esta página. Chame SÓ de uma tela que já encontrou a página (a RLS
 * barra o resto, mas inexistente/sem acesso nem chegam aqui). `null` não grava (página na lixeira).
 * A página inicial não entra. A lista em cache sobe a página na hora; a gravação falhar é silencioso (a lista só é recarregada).
 */
export function useRecordVisit(pageId: string | null) {
  const queryClient = useQueryClient()
  const userId = useAuth().session?.user.id
  const homePageId = useWorkspace().data?.homePageId

  useEffect(() => {
    if (pageId === null || userId === undefined || homePageId === undefined) return
    if (pageId === homePageId) return
    const key = `${userId}:${pageId}`
    const now = Date.now()
    if (!shouldRecord(lastWrite, key, now)) return
    lastWrite = { key, at: now }

    const listKey = recentKeys.list(userId)
    const visitedAt = new Date(now).toISOString()
    queryClient.setQueryData<RecentEntry[]>(listKey, (rows) =>
      rows ? withVisit(rows, pageId, visitedAt) : rows,
    )

    void (async () => {
      try {
        await recordVisit(pageId, visitedAt)
      } catch {
        lastWrite = null
        void queryClient.invalidateQueries({ queryKey: listKey })
        return
      }
      const cached = queryClient.getQueryData<RecentEntry[]>(listKey)
      // A lista ainda não tinha chegado (ou chegou sem esta visita): confere com o servidor.
      if (!cached?.some((row) => row.pageId === pageId)) {
        void queryClient.invalidateQueries({ queryKey: listKey })
        return
      }
      const cutoff = trimCutoff(cached)
      if (cutoff === null) return
      try {
        await trimRecents(userId, cutoff)
      } catch {
        // Limpeza é best effort: o excesso é apagado numa próxima visita.
      }
    })()
  }, [queryClient, userId, homePageId, pageId])
}
