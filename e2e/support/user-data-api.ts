// Leitura, pela API, dos dados POR USUÁRIO (favoritos e recentes) do usuário de teste 1, para os e2e
// conferirem o que o app gravou. Só lê; a limpeza é feita pela exclusão das páginas de teste, que leva
// as linhas junto (FK em cascata).
import type { ApiSession } from './pages-api'

export async function favoritePageIds(session: ApiSession): Promise<string[]> {
  const { data, error } = await session.client
    .from('user_favorites')
    .select('page_id')
    .eq('user_id', session.userId)
  if (error) throw new Error('Não foi possível ler os favoritos do usuário de teste.')
  return data.map((row) => row.page_id)
}

/** Páginas visitadas, da mais recente para a mais antiga. */
export async function recentPageIds(session: ApiSession): Promise<string[]> {
  const { data, error } = await session.client
    .from('user_recents')
    .select('page_id')
    .eq('user_id', session.userId)
    .order('visited_at', { ascending: false })
  if (error) throw new Error('Não foi possível ler os recentes do usuário de teste.')
  return data.map((row) => row.page_id)
}

export async function homePageIdOf(session: ApiSession): Promise<string | null> {
  const { data, error } = await session.client
    .from('workspaces')
    .select('home_page_id')
    .eq('id', session.workspaceId)
    .maybeSingle()
  if (error) throw new Error('Não foi possível ler o workspace do usuário de teste.')
  return data?.home_page_id ?? null
}
