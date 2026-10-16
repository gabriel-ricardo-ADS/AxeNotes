import { useQuery } from '@tanstack/react-query'
import { fetchPage, fetchPages } from '@/features/workspace/api/pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { workspaceKeys } from '@/features/workspace/query-keys'
import type { PageRow } from '@/features/workspace/types'

/** Todas as páginas do workspace fora da lixeira (a árvore é montada no cliente a partir daqui). */
export function usePages() {
  const workspaceId = useWorkspace().data?.id

  return useQuery({
    queryKey: workspaceKeys.pages(workspaceId),
    queryFn: () => fetchPages(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  })
}

export type PageLookup =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notFound' }
  | { status: 'found'; page: PageRow }

/**
 * Procura a página na lista já carregada; se não estiver lá (criada em outra aba, por exemplo),
 * confirma com uma consulta pontual. Inexistente, na lixeira e sem acesso dão o MESMO resultado
 * (`notFound`), para a tela não revelar quais páginas existem.
 */
export function usePage(pageId: string | undefined): { lookup: PageLookup; retry: () => void } {
  const pages = usePages()
  const inList = pageId === undefined ? undefined : pages.data?.find((row) => row.id === pageId)

  const single = useQuery({
    queryKey: workspaceKeys.page(pageId ?? ''),
    queryFn: () => fetchPage(pageId ?? ''),
    enabled: pageId !== undefined && pages.isSuccess && inList === undefined,
    retry: false,
  })

  const retry = () => {
    void pages.refetch()
    void single.refetch()
  }

  if (pageId === undefined) return { lookup: { status: 'notFound' }, retry }
  if (inList) return { lookup: { status: 'found', page: inList }, retry }
  if (pages.isError || single.isError) return { lookup: { status: 'error' }, retry }
  if (!pages.isSuccess || single.isPending) return { lookup: { status: 'loading' }, retry }
  if (single.data) return { lookup: { status: 'found', page: single.data }, retry }
  return { lookup: { status: 'notFound' }, retry }
}
