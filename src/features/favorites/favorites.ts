import { keyAtIndex } from '@/lib/fractional-index'
import type { PageRow } from '@/features/workspace/types'

/** Favorito do usuário: a página e a posição dele na lista (`user_favorites.sort_key`). */
export interface FavoriteEntry {
  pageId: string
  sortKey: string
}

/**
 * Ordem dos favoritos: `sort_key` com comparação simples de string (a coluna é `collate "C"`),
 * NUNCA `localeCompare`; empate pelo id da página, para a ordem ser a mesma em todo aparelho.
 */
export function compareFavorites(a: FavoriteEntry, b: FavoriteEntry): number {
  if (a.sortKey < b.sortKey) return -1
  if (a.sortKey > b.sortKey) return 1
  if (a.pageId < b.pageId) return -1
  if (a.pageId > b.pageId) return 1
  return 0
}

export function sortFavorites(entries: readonly FavoriteEntry[]): FavoriteEntry[] {
  return [...entries].sort(compareFavorites)
}

/**
 * Chave para um novo favorito no FIM da lista (todos os favoritos contam, inclusive os de páginas
 * que estão na lixeira e por isso não aparecem). Nesta tarefa só se inclui no fim: nunca nasce uma
 * chave ENTRE dois favoritos, então não há empate a tratar aqui (ver DECISÃO-025).
 */
export function favoriteKeyAtEnd(entries: readonly FavoriteEntry[]): string {
  const keys = sortFavorites(entries).map((entry) => entry.sortKey)
  return keyAtIndex(keys, keys.length)
}

/**
 * Páginas favoritas na ordem da lista. Favorito cuja página não está em `pages` (lixeira, apagada
 * ou sem acesso) fica de fora: a linha continua no banco, então restaurar a página o traz de volta.
 */
export function visibleFavorites(
  entries: readonly FavoriteEntry[],
  pages: readonly PageRow[],
): PageRow[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const result: PageRow[] = []
  for (const entry of sortFavorites(entries)) {
    const page = byId.get(entry.pageId)
    if (page) result.push(page)
  }
  return result
}
