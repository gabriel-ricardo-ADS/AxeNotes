import type { QueryClient } from '@tanstack/react-query'
import { workspaceKeys } from '@/features/workspace/query-keys'
import type { PageRow } from '@/features/workspace/types'

/** O servidor só regrava `pages.last_edited_at` a cada 60 s; o cache local segue o mesmo ritmo. */
export const LOCAL_EDITED_INTERVAL_MS = 60_000

/**
 * "Editada há…" depois de um envio do conteúdo, sem buscar a página de novo: atualiza `lastEditedAt`
 * no cache da lista se o valor guardado tiver mais de LOCAL_EDITED_INTERVAL_MS (devolve a mesma lista
 * quando não muda nada, para não re-renderizar a árvore a cada envio).
 */
export function touchLastEdited(rows: PageRow[], pageId: string, now: number): PageRow[] {
  const index = rows.findIndex((row) => row.id === pageId)
  const row = rows[index]
  if (!row || now - Date.parse(row.lastEditedAt) < LOCAL_EDITED_INTERVAL_MS) return rows
  const next = [...rows]
  next[index] = { ...row, lastEditedAt: new Date(now).toISOString() }
  return next
}

export function markPageEditedLocally(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  pageId: string,
  now: number,
): void {
  queryClient.setQueryData<PageRow[]>(workspaceKeys.pages(workspaceId), (rows) =>
    rows ? touchLastEdited(rows, pageId, now) : rows,
  )
}
