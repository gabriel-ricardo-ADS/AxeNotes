import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { addFavorite, removeFavorite } from '@/features/favorites/api/favorites'
import { favoriteKeyAtEnd, type FavoriteEntry } from '@/features/favorites/favorites'
import { favoriteKeys } from '@/features/favorites/query-keys'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { t } from '@/i18n'

/** Escritas em `user_favorites` rodam uma de cada vez, na ordem: favoritar e desfavoritar rápido não se cruzam. */
const WRITE_SCOPE = { id: 'favorites-write' }

interface ToggleOptions {
  /** O chamador mostra o erro do jeito dele (a estrela na página); sem isso o aviso vai para a sidebar. */
  silent?: boolean
}

/**
 * Favoritar e desfavoritar, com atualização otimista sobre a lista em cache. Falha = só o item
 * mexido volta ao que era e a lista é recarregada. Sucesso NÃO recarrega nada (o cache já tem o valor).
 */
export function useFavoriteMutations() {
  const queryClient = useQueryClient()
  const userId = useAuth().session?.user.id
  const setNotice = useTreeUiStore((state) => state.setNotice)

  const key = favoriteKeys.list(userId)
  const read = () => queryClient.getQueryData<FavoriteEntry[]>(key)
  const write = (update: (rows: FavoriteEntry[]) => FavoriteEntry[]) => {
    queryClient.setQueryData<FavoriteEntry[]>(key, (rows) => (rows ? update(rows) : rows))
  }
  const reconcile = () => queryClient.invalidateQueries({ queryKey: key })

  const addMutation = useMutation({
    scope: WRITE_SCOPE,
    mutationFn: addFavorite,
    onMutate: async (entry: FavoriteEntry) => {
      await queryClient.cancelQueries({ queryKey: key })
      write((rows) => [...rows.filter((row) => row.pageId !== entry.pageId), entry])
    },
    onError: (_error, entry) => {
      // Só desfaz o que esta escrita pôs, e só se ninguém trocou a chave depois dela.
      write((rows) =>
        rows.filter((row) => !(row.pageId === entry.pageId && row.sortKey === entry.sortKey)),
      )
      void reconcile()
    },
  })

  const removeMutation = useMutation({
    scope: WRITE_SCOPE,
    mutationFn: (pageId: string) => removeFavorite(userId ?? '', pageId),
    onMutate: async (pageId: string) => {
      await queryClient.cancelQueries({ queryKey: key })
      const removed = read()?.find((row) => row.pageId === pageId) ?? null
      write((rows) => rows.filter((row) => row.pageId !== pageId))
      return { removed }
    },
    onError: (_error, pageId, context) => {
      const removed = context?.removed ?? null
      if (removed) {
        write((rows) => (rows.some((row) => row.pageId === pageId) ? rows : [...rows, removed]))
      }
      void reconcile()
    },
  })

  /**
   * Alterna o favorito. Devolve se deu certo. Sem a lista carregada não dá para saber o estado
   * atual, então não faz nada (a estrela fica desabilitada até a lista chegar).
   */
  async function toggleFavorite(pageId: string, options?: ToggleOptions): Promise<boolean> {
    const current = read()
    if (current === undefined || userId === undefined) return false
    const isFavorite = current.some((row) => row.pageId === pageId)
    try {
      if (isFavorite) {
        await removeMutation.mutateAsync(pageId)
      } else {
        await addMutation.mutateAsync({ pageId, sortKey: favoriteKeyAtEnd(current) })
      }
      return true
    } catch {
      if (options?.silent !== true) {
        setNotice(t(isFavorite ? 'favorites.errors.remove' : 'favorites.errors.add'))
      }
      return false
    }
  }

  return { toggleFavorite }
}
