import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router'
import { pagePath } from '@/features/pages/routes'
import { trashPage } from '@/features/trash/api/trash'
import { trashErrorMessage } from '@/features/trash/messages'
import { trashKeys } from '@/features/trash/query-keys'
import { PAGES_WRITE_SCOPE } from '@/features/workspace/hooks/use-page-mutations'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { workspaceKeys } from '@/features/workspace/query-keys'
import { descendantIds, fallbackAfterTrash } from '@/features/workspace/tree'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import type { PageRow } from '@/features/workspace/types'

/** Segurança: se a navegação não chegar a mudar a rota, a espera acaba em vez de travar a ação. */
const NAVIGATION_GUARD_MS = 1000

interface TrashOptions {
  /**
   * Espera o servidor aceitar ANTES de navegar e tirar a página da lista (menu da página: o erro aparece
   * na própria página, que continua na tela). Sem isso é otimista: sai da lista na hora e volta se falhar.
   */
  confirmFirst?: boolean
  /** Quem mostra o erro (a página). Sem isso o aviso vai para a `SidebarNotice`. */
  onError?: (message: string) => void
}

/**
 * Manda uma página (e as subpáginas) para a lixeira.
 *
 * Ordem quando a página aberta é a lixeada, ou está dentro dela: (1) `navigate(replace)` para a página-pai
 * (ou "/") e ESPERA a rota mudar; (2) só então cancela e remove do cache as consultas `['page', id]`
 * (antes disso a tela ainda as lê e mostraria "Página não encontrada"); (3) tira a subárvore da lista
 * `['pages', ws]`; (4) chama o RPC, na fila `pages-write` (depois de um renomear pendente). Falha no modo
 * otimista: devolve só as linhas que saíram, reconcilia com o servidor e avisa.
 */
export function useTrashPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const openPageId = useMatch('/p/:pageId')?.params.pageId
  const workspace = useWorkspace().data
  const setNotice = useTreeUiStore((state) => state.setNotice)

  const pagesKey = workspaceKeys.pages(workspace?.id)
  const readPages = () => queryClient.getQueryData<PageRow[]>(pagesKey) ?? []
  const writePages = (update: (rows: PageRow[]) => PageRow[]) => {
    queryClient.setQueryData<PageRow[]>(pagesKey, (rows) => (rows ? update(rows) : rows))
  }
  const reconcile = () => queryClient.invalidateQueries({ queryKey: pagesKey })
  // A lixeira ganhou linhas: quem já a abriu (ou abre logo depois, antes do RPC terminar) a recarrega.
  const refreshTrash = () =>
    queryClient.invalidateQueries({ queryKey: trashKeys.list(workspace?.id) })

  const mutation = useMutation({ scope: PAGES_WRITE_SCOPE, mutationFn: trashPage })

  // A rota só muda de fato depois do commit: quem espera é acordado por este efeito.
  const navigationDone = useRef<(() => void) | null>(null)
  useEffect(() => {
    navigationDone.current?.()
    navigationDone.current = null
  }, [location])

  function leaveTo(target: string): Promise<void> {
    return new Promise((resolve) => {
      const guard = window.setTimeout(resolve, NAVIGATION_GUARD_MS)
      navigationDone.current = () => {
        window.clearTimeout(guard)
        resolve()
      }
      void navigate(target, { replace: true })
    })
  }

  async function removeFromCache(ids: ReadonlySet<string>): Promise<PageRow[]> {
    await queryClient.cancelQueries({ queryKey: pagesKey })
    const removed = readPages().filter((row) => ids.has(row.id))
    writePages((rows) => rows.filter((row) => !ids.has(row.id)))
    await Promise.all([...ids].map((id) => queryClient.cancelQueries({ queryKey: workspaceKeys.page(id) })))
    for (const id of ids) queryClient.removeQueries({ queryKey: workspaceKeys.page(id) })
    return removed
  }

  /** Devolve se a página foi para a lixeira. */
  async function trash(id: string, options?: TrashOptions): Promise<boolean> {
    const rows = readPages()
    if (!rows.some((row) => row.id === id)) return false
    const homeId = workspace?.homePageId ?? null
    const subtree = new Set([id, ...descendantIds(rows, id)])
    const leaving = openPageId !== undefined && subtree.has(openPageId)
    const parentId = fallbackAfterTrash(rows, homeId, id)
    const target = parentId === null ? '/' : pagePath(parentId)
    const fail = (error: unknown) => {
      const message = trashErrorMessage('trash', error)
      if (options?.onError) options.onError(message)
      else setNotice(message)
    }

    if (options?.confirmFirst === true) {
      try {
        await mutation.mutateAsync(id)
      } catch (error) {
        fail(error)
        return false
      }
      if (leaving) await leaveTo(target)
      await removeFromCache(subtree)
      void reconcile()
      void refreshTrash()
      return true
    }

    if (leaving) await leaveTo(target)
    const removed = await removeFromCache(subtree)
    try {
      await mutation.mutateAsync(id)
    } catch (error) {
      writePages((current) => [
        ...current,
        ...removed.filter((row) => !current.some((other) => other.id === row.id)),
      ])
      void reconcile()
      fail(error)
      return false
    }
    void reconcile()
    void refreshTrash()
    return true
  }

  return { trashPage: trash }
}
