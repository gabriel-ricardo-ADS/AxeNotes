import type { PageIcon } from '@/features/workspace/page-icon'
import type { PageRow } from '@/features/workspace/types'

/** Página na lixeira como a tela `/lixeira` a enxerga (só o necessário). */
export interface TrashedPage {
  id: string
  parentId: string | null
  title: string
  icon: PageIcon | null
  /** ISO 8601 de `pages.trashed_at`. Toda a subárvore lixeada junta recebe o MESMO valor. */
  trashedAt: string
}

/** De onde a página saiu. `unknown`: o pai não está em nenhuma das listas (ainda carregando). */
export type TrashOrigin =
  { kind: 'root' } | { kind: 'page'; title: string; trashed: boolean } | { kind: 'unknown' }

export interface TrashRoot {
  page: TrashedPage
  /** Descendentes lixeados JUNTO com a raiz (mesmo `trashed_at`): o "+N subpáginas" da linha. */
  sameStampCount: number
  /** Todos os descendentes na lixeira: é o que "Excluir definitivamente" apaga (o FK leva todos). */
  descendantCount: number
  origin: TrashOrigin
}

/** Quantos descendentes foram lixeados em outro momento e aparecem como raízes à parte. */
export function separateCount(root: TrashRoot): number {
  return root.descendantCount - root.sameStampCount
}

function childrenByParent(pages: readonly TrashedPage[]): Map<string, TrashedPage[]> {
  const children = new Map<string, TrashedPage[]>()
  for (const page of pages) {
    if (page.parentId === null) continue
    const list = children.get(page.parentId)
    if (list) list.push(page)
    else children.set(page.parentId, [page])
  }
  return children
}

/** Descendentes de `rootId` seguindo `accept`; protegido contra ciclos. */
function countDescendants(
  children: ReadonlyMap<string, TrashedPage[]>,
  rootId: string,
  accept: (page: TrashedPage) => boolean,
): number {
  const seen = new Set<string>([rootId])
  const stack = [rootId]
  let count = 0
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id) || !accept(child)) continue
      seen.add(child.id)
      count += 1
      stack.push(child.id)
    }
  }
  return count
}

function originOf(
  page: TrashedPage,
  trashedById: ReadonlyMap<string, TrashedPage>,
  liveById: ReadonlyMap<string, PageRow> | null,
  homeId: string | null,
): TrashOrigin {
  // A página inicial não é um item da árvore: quem está sob ela aparece como raiz (igual à sidebar).
  if (page.parentId === null || page.parentId === homeId) return { kind: 'root' }
  const trashedParent = trashedById.get(page.parentId)
  if (trashedParent) return { kind: 'page', title: trashedParent.title, trashed: true }
  const liveParent = liveById?.get(page.parentId)
  if (liveParent) return { kind: 'page', title: liveParent.title, trashed: false }
  return { kind: 'unknown' }
}

/**
 * Raízes da lixeira (DECISÃO-026): página na lixeira cujo pai NÃO está na lixeira, ou cujo `trashed_at`
 * é diferente do `trashed_at` do pai (filho lixeado antes do pai continua visível). Mais recentes
 * primeiro, desempate pelo id. Os carimbos vêm da mesma coluna e do mesmo formato, por isso a
 * comparação é por texto igual (nunca `Date.parse`, que perderia os microssegundos).
 *
 * `live`: páginas fora da lixeira, só para dar nome à origem; `undefined` enquanto não carregaram.
 */
export function buildTrashRoots(
  trashed: readonly TrashedPage[],
  live: readonly PageRow[] | undefined,
  homeId: string | null,
): TrashRoot[] {
  const trashedById = new Map(trashed.map((page) => [page.id, page]))
  const liveById = live === undefined ? null : new Map(live.map((page) => [page.id, page]))
  const children = childrenByParent(trashed)

  return trashed
    .filter((page) => {
      const parent = page.parentId === null ? undefined : trashedById.get(page.parentId)
      return parent?.trashedAt !== page.trashedAt
    })
    .map((page) => ({
      page,
      sameStampCount: countDescendants(
        children,
        page.id,
        (child) => child.trashedAt === page.trashedAt,
      ),
      descendantCount: countDescendants(children, page.id, () => true),
      origin: originOf(page, trashedById, liveById, homeId),
    }))
    .sort((a, b) => {
      if (a.page.trashedAt !== b.page.trashedAt) return a.page.trashedAt < b.page.trashedAt ? 1 : -1
      return a.page.id < b.page.id ? -1 : a.page.id > b.page.id ? 1 : 0
    })
}

// Erros -------------------------------------------------------------------------------------------

/** `gone`: a ação não atingiu nenhuma linha (a página já foi restaurada ou excluída em outro lugar). */
export type TrashErrorKind = 'parent_trashed' | 'forbidden' | 'gone' | 'unknown'

/** Erro das ações da lixeira, já classificado (a API nunca deixa vazar o erro cru do Postgres). */
export class TrashActionError extends Error {
  readonly kind: TrashErrorKind

  constructor(kind: TrashErrorKind) {
    super(`trash_${kind}`)
    this.name = 'TrashActionError'
    this.kind = kind
  }
}

/**
 * Classifica o erro do PostgREST/Postgres: `23514` ou `parent_trashed` (restaurar sob um pai que ainda
 * está na lixeira) e `42501` (sem permissão: papel de leitor, ou a RLS não enxerga a página).
 */
export function mapTrashError(error: unknown): TrashErrorKind {
  if (error instanceof TrashActionError) return error.kind
  if (typeof error !== 'object' || error === null) return 'unknown'
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === '23514' || (typeof message === 'string' && message.includes('parent_trashed'))) {
    return 'parent_trashed'
  }
  if (code === '42501') return 'forbidden'
  return 'unknown'
}
