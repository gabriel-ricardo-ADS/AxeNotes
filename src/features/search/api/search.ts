import { z } from 'zod'
import { SEARCH_LIMIT, type SearchResult } from '@/features/search/search'
import { parsePageIcon } from '@/features/workspace/page-icon'
import { supabase } from '@/lib/supabase'

const searchRowSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  title: z.string(),
  icon: z.unknown(),
  last_edited_at: z.string(),
})

/**
 * Busca por título com o RPC `search_pages`. O termo vai cru (já sem espaços nas pontas): acento, caixa,
 * `%`, `_`, `\` e a lixeira são tratados no servidor. O termo vai no corpo do POST, nunca na URL. `signal`
 * cancela o pedido quando o termo muda.
 */
export async function searchPages(
  workspaceId: string,
  term: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const request = supabase.rpc('search_pages', {
    p_workspace_id: workspaceId,
    p_query: term,
    p_limit: SEARCH_LIMIT,
  })
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw new Error('search_failed')
  return (data as unknown[]).map((raw) => {
    const row = searchRowSchema.parse(raw)
    return {
      id: row.id,
      parentId: row.parent_id,
      title: row.title,
      icon: parsePageIcon(row.icon),
      lastEditedAt: row.last_edited_at,
    }
  })
}
