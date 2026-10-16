import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import {
  insertPage,
  updatePage,
  type NewPage,
  type PagePatch,
} from '@/features/workspace/api/pages'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import type { PageIcon } from '@/features/workspace/page-icon'
import { workspaceKeys } from '@/features/workspace/query-keys'
import { keyAtEnd, planMove } from '@/features/workspace/tree'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import type { PageRow } from '@/features/workspace/types'
import { t } from '@/i18n'

/** Escritas em `pages` rodam uma de cada vez, na ordem: renomear logo depois de criar espera o insert. */
const WRITE_SCOPE = { id: 'pages-write' }

const TITLE_MAX = 500

interface UpdateInput {
  id: string
  patch: PagePatch
  /** Salvamento ao sair da página: envia com `keepalive`, usando este token. */
  keepaliveToken?: string
}

interface UpdateContext {
  previous: PageRow | null
  /** Como a linha ficou logo depois da atualização otimista. */
  optimistic: PageRow | null
}

function applyPatch(row: PageRow, patch: PagePatch, now: string): PageRow {
  const touchesContent = patch.title !== undefined || patch.icon !== undefined
  return {
    ...row,
    ...(patch.parentId !== undefined && { parentId: patch.parentId }),
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.icon !== undefined && { icon: patch.icon }),
    ...(patch.sortKey !== undefined && { sortKey: patch.sortKey }),
    // O banco atualiza last_edited_at quando título ou ícone mudam; o cache acompanha.
    ...(touchesContent && { lastEditedAt: now }),
  }
}

/** Só desfaz os campos que esta escrita mexeu, e só se ninguém os mudou depois dela. */
function rollbackRow(current: PageRow, optimistic: PageRow, previous: PageRow, patch: PagePatch) {
  const next = { ...current }
  if (patch.parentId !== undefined && current.parentId === optimistic.parentId) {
    next.parentId = previous.parentId
  }
  if (patch.sortKey !== undefined && current.sortKey === optimistic.sortKey) {
    next.sortKey = previous.sortKey
  }
  if (patch.title !== undefined && current.title === optimistic.title) next.title = previous.title
  if (patch.icon !== undefined && current.icon === optimistic.icon) next.icon = previous.icon
  if (current.lastEditedAt === optimistic.lastEditedAt) next.lastEditedAt = previous.lastEditedAt
  return next
}

/**
 * Criar, renomear, trocar o ícone e mover páginas, com atualização otimista sobre a lista em cache.
 * Falha = a lista volta ao que era (só o que esta escrita tinha mudado), a lista é recarregada do
 * servidor e o aviso em pt-BR vai para a árvore. Título e ícone NÃO recarregam a lista a cada
 * salvamento (o cache já tem o valor); criar e mover reconciliam com o servidor ao terminar.
 */
export function usePageMutations() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const workspace = useWorkspace().data
  const setNotice = useTreeUiStore((state) => state.setNotice)
  const expand = useTreeUiStore((state) => state.expand)

  const pagesKey = workspaceKeys.pages(workspace?.id)
  const readPages = () => queryClient.getQueryData<PageRow[]>(pagesKey) ?? []
  const writePages = (update: (rows: PageRow[]) => PageRow[]) => {
    queryClient.setQueryData<PageRow[]>(pagesKey, (rows) => (rows ? update(rows) : rows))
  }
  const reconcile = () => queryClient.invalidateQueries({ queryKey: pagesKey })

  const createMutation = useMutation({
    scope: WRITE_SCOPE,
    mutationFn: insertPage,
    onMutate: async (page: NewPage) => {
      await queryClient.cancelQueries({ queryKey: pagesKey })
      const row: PageRow = {
        id: page.id,
        parentId: page.parentId,
        title: page.title,
        icon: page.icon,
        sortKey: page.sortKey,
        lastEditedAt: new Date().toISOString(),
      }
      writePages((rows) => [...rows, row])
    },
    onError: (_error, page) => {
      writePages((rows) => rows.filter((row) => row.id !== page.id))
      void reconcile()
    },
    onSuccess: () => {
      void reconcile()
    },
  })

  const updateMutation = useMutation({
    scope: WRITE_SCOPE,
    mutationFn: ({ id, patch, keepaliveToken }: UpdateInput) =>
      updatePage(id, patch, keepaliveToken === undefined ? undefined : { keepaliveToken }),
    onMutate: async ({ id, patch }: UpdateInput): Promise<UpdateContext> => {
      await queryClient.cancelQueries({ queryKey: pagesKey })
      const previous = readPages().find((row) => row.id === id) ?? null
      const optimistic = previous ? applyPatch(previous, patch, new Date().toISOString()) : null
      if (optimistic) writePages((rows) => rows.map((row) => (row.id === id ? optimistic : row)))
      return { previous, optimistic }
    },
    onError: (_error, { id, patch }, context) => {
      const { previous, optimistic } = context ?? { previous: null, optimistic: null }
      if (previous && optimistic) {
        writePages((rows) =>
          rows.map((row) => (row.id === id ? rollbackRow(row, optimistic, previous, patch) : row)),
        )
      }
      void reconcile()
    },
    onSuccess: (_data, { patch }) => {
      // Mover muda a ordem entre irmãos: confere com o servidor. Título e ícone não precisam.
      if (patch.parentId !== undefined || patch.sortKey !== undefined) void reconcile()
    },
  })

  /** Cria uma página (raiz com `parentId` null) no fim dos irmãos. Devolve o id, ou null se falhar. */
  async function createPage(parentId: string | null): Promise<string | null> {
    const userId = session?.user.id
    if (!workspace || userId === undefined) return null

    const id = crypto.randomUUID()
    if (parentId !== null) expand(parentId)
    try {
      await createMutation.mutateAsync({
        id,
        workspaceId: workspace.id,
        parentId,
        title: '',
        icon: null,
        sortKey: keyAtEnd(readPages(), workspace.homePageId, parentId),
        createdBy: userId,
      })
      return id
    } catch {
      setNotice(t('workspace.errors.create'))
      return null
    }
  }

  async function runUpdate(input: UpdateInput, errorMessage: string, silent: boolean) {
    try {
      await updateMutation.mutateAsync(input)
      return true
    } catch {
      if (!silent) setNotice(errorMessage)
      return false
    }
  }

  /**
   * `silent`: o chamador mostra o erro do jeito dele (o campo de título da página). `keepalive`: a
   * página está sendo fechada ou recarregada; o envio sobrevive a isso (se houver sessão).
   */
  function renamePage(
    id: string,
    title: string,
    options?: { silent?: boolean; keepalive?: boolean },
  ) {
    const keepaliveToken = options?.keepalive === true ? session?.access_token : undefined
    return runUpdate(
      {
        id,
        patch: { title: title.slice(0, TITLE_MAX) },
        ...(keepaliveToken !== undefined && { keepaliveToken }),
      },
      t('workspace.errors.rename'),
      options?.silent ?? false,
    )
  }

  function setPageIcon(id: string, icon: PageIcon | null) {
    return runUpdate({ id, patch: { icon } }, t('workspace.errors.icon'), false)
  }

  /** Move para `parentId` (null = raiz) na posição `index` entre os irmãos de destino. */
  async function movePage(id: string, parentId: string | null, index: number) {
    const plan = planMove(readPages(), workspace?.homePageId ?? null, id, parentId, index)
    if (!plan.ok) {
      const message = {
        missing: t('workspace.errors.move'),
        tie: t('workspace.errors.moveTie'),
        self: t('workspace.errors.moveInvalid'),
        descendant: t('workspace.errors.moveInvalid'),
      }[plan.reason]
      setNotice(message)
      return false
    }
    if (plan.unchanged) return true
    if (plan.parentId !== null) expand(plan.parentId)
    return runUpdate(
      { id, patch: { parentId: plan.parentId, sortKey: plan.sortKey } },
      t('workspace.errors.move'),
      false,
    )
  }

  return { createPage, renamePage, setPageIcon, movePage, reconcile }
}
