import { z } from 'zod'
import { RECENTS_KEPT, type RecentEntry } from '@/features/recents/recents'
import { supabase } from '@/lib/supabase'

const recentRowSchema = z.object({ page_id: z.string(), visited_at: z.string() })

/** As visitas mais recentes do usuário (até o teto guardado), a mais nova primeiro. */
export async function fetchRecents(userId: string): Promise<RecentEntry[]> {
  const { data, error } = await supabase
    .from('user_recents')
    .select('page_id, visited_at')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(RECENTS_KEPT)
  if (error) throw new Error('recents_fetch_failed')
  return (data as unknown[]).map((raw) => {
    const row = recentRowSchema.parse(raw)
    return { pageId: row.page_id, visitedAt: row.visited_at }
  })
}

/**
 * Registra a visita (upsert em `(user_id, page_id)`). `visited_at` vai SEMPRE no payload: o
 * PostgREST só atualiza as colunas enviadas, então sem ele a linha existente não seria renovada.
 */
export async function recordVisit(pageId: string, visitedAt: string): Promise<void> {
  const { error } = await supabase
    .from('user_recents')
    .upsert({ page_id: pageId, visited_at: visitedAt }, { onConflict: 'user_id,page_id' })
  if (error) throw new Error('recents_record_failed')
}

/** Apaga as visitas MAIS ANTIGAS que `cutoff` (as que passam do teto). Só as do próprio usuário. */
export async function trimRecents(userId: string, cutoff: string): Promise<void> {
  const { error } = await supabase
    .from('user_recents')
    .delete()
    .eq('user_id', userId)
    .lt('visited_at', cutoff)
  if (error) throw new Error('recents_trim_failed')
}
