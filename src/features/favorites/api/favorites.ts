import { z } from 'zod'
import type { FavoriteEntry } from '@/features/favorites/favorites'
import { supabase } from '@/lib/supabase'

const favoriteRowSchema = z.object({ page_id: z.string(), sort_key: z.string() })

/** A RLS já limita a linhas do próprio usuário; o filtro por `user_id` deixa a intenção explícita. */
export async function fetchFavorites(userId: string): Promise<FavoriteEntry[]> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select('page_id, sort_key')
    .eq('user_id', userId)
    .order('sort_key', { ascending: true })
    .limit(1000)
  if (error) throw new Error('favorites_fetch_failed')
  return (data as unknown[]).map((raw) => {
    const row = favoriteRowSchema.parse(raw)
    return { pageId: row.page_id, sortKey: row.sort_key }
  })
}

/**
 * Favorita a página. `ON CONFLICT DO NOTHING`: favoritar de novo (outra aba, outro aparelho) é
 * sucesso e mantém a posição que já existia. `user_id` vem do default `auth.uid()` do banco.
 */
export async function addFavorite(entry: FavoriteEntry): Promise<void> {
  const { error } = await supabase
    .from('user_favorites')
    .upsert(
      { page_id: entry.pageId, sort_key: entry.sortKey },
      { onConflict: 'user_id,page_id', ignoreDuplicates: true },
    )
  if (error) throw new Error('favorites_add_failed')
}

/** Remove o favorito. Já não existir também é sucesso (o resultado é o mesmo). */
export async function removeFavorite(userId: string, pageId: string): Promise<void> {
  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('page_id', pageId)
  if (error) throw new Error('favorites_remove_failed')
}
