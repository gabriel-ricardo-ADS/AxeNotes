// Lógica pura da árvore de páginas (sem React nem Supabase): montar e ordenar por `sort_key`, validar e
// planejar "mover", decidir se pode ir para a lixeira. É o que os testes de `tree.test.ts` cobrem.
// Ver docs/CODEMAP.md §3.7.
import { keyAtIndex } from '@/lib/fractional-index'
import type { PageRow } from '@/features/workspace/types'

export interface PageNode {
  page: PageRow
  children: PageNode[]
}

export interface FlatItem {
  page: PageRow
  /** Nível a partir de 1 (aria-level). */
  level: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
}

/**
 * Ordem dos irmãos: `sort_key` com comparação simples de string (a coluna é `collate "C"`, bytes),
 * NUNCA `localeCompare`; empate pelo id, para a ordem ser igual em todos os aparelhos.
 */
export function comparePages(a: PageRow, b: PageRow): number {
  if (a.sortKey < b.sortKey) return -1
  if (a.sortKey > b.sortKey) return 1
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/**
 * Pai "de exibição": a página inicial não é um item da seção Páginas, então os filhos dela
 * aparecem como raízes; quem aponta para um pai que não está na lista (não deveria acontecer)
 * também vira raiz, para nunca ficar invisível.
 */
function displayParent(
  page: PageRow,
  ids: ReadonlySet<string>,
  homeId: string | null,
): string | null {
  if (page.parentId === null || page.parentId === homeId) return null
  return ids.has(page.parentId) ? page.parentId : null
}

function groupByDisplayParent(rows: readonly PageRow[], homeId: string | null) {
  const ids = new Set(rows.map((row) => row.id))
  const groups = new Map<string | null, PageRow[]>()
  for (const row of rows) {
    if (row.id === homeId) continue
    const parent = displayParent(row, ids, homeId)
    const list = groups.get(parent)
    if (list) list.push(row)
    else groups.set(parent, [row])
  }
  for (const list of groups.values()) list.sort(comparePages)
  return groups
}

/** Árvore da seção "Páginas": raízes ordenadas, sem a página inicial. */
export function buildPageTree(rows: readonly PageRow[], homeId: string | null): PageNode[] {
  const groups = groupByDisplayParent(rows, homeId)
  const build = (parent: string | null, seen: ReadonlySet<string>): PageNode[] =>
    (groups.get(parent) ?? [])
      .filter((page) => !seen.has(page.id))
      .map((page) => ({ page, children: build(page.id, new Set([...seen, page.id])) }))
  return build(null, new Set())
}

/** Linhas visíveis (de cima para baixo), respeitando o que está expandido. */
export function flattenVisible(
  tree: readonly PageNode[],
  expanded: ReadonlySet<string>,
): FlatItem[] {
  const items: FlatItem[] = []
  const walk = (nodes: readonly PageNode[], level: number, parentId: string | null) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0
      const isOpen = hasChildren && expanded.has(node.page.id)
      items.push({ page: node.page, level, parentId, hasChildren, expanded: isOpen })
      if (isOpen) walk(node.children, level + 1, node.page.id)
    }
  }
  walk(tree, 1, null)
  return items
}

/** Ancestrais reais (parent_id), do topo até o pai; pára se a cadeia sumir ou girar. */
export function ancestorsOf(rows: readonly PageRow[], id: string): PageRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const chain: PageRow[] = []
  const seen = new Set<string>([id])
  let current = byId.get(id)?.parentId ?? null
  while (current !== null && !seen.has(current)) {
    const parent = byId.get(current)
    if (!parent) break
    chain.unshift(parent)
    seen.add(current)
    current = parent.parentId
  }
  return chain
}

/** Ids de todas as descendentes (filhas, netas…) de uma página, por parent_id. */
export function descendantIds(rows: readonly PageRow[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const row of rows) {
    if (row.parentId === null) continue
    const list = childrenOf.get(row.parentId)
    if (list) list.push(row.id)
    else childrenOf.set(row.parentId, [row.id])
  }
  const result = new Set<string>()
  const stack = [...(childrenOf.get(id) ?? [])]
  while (stack.length > 0) {
    const next = stack.pop()
    if (next === undefined || result.has(next)) continue
    result.add(next)
    stack.push(...(childrenOf.get(next) ?? []))
  }
  return result
}

export type MoveCheck = 'ok' | 'self' | 'descendant'

/** Mover para dentro dela mesma ou de uma descendente criaria um ciclo (o banco também barra). */
export function validateMove(
  rows: readonly PageRow[],
  id: string,
  newParentId: string | null,
): MoveCheck {
  if (newParentId === null) return 'ok'
  if (newParentId === id) return 'self'
  return descendantIds(rows, id).has(newParentId) ? 'descendant' : 'ok'
}

/** Irmãos como a árvore mostra, na ordem, sem `excludeId`. `parentId` null = raízes. */
export function siblingsOf(
  rows: readonly PageRow[],
  homeId: string | null,
  parentId: string | null,
  excludeId: string | null = null,
): PageRow[] {
  const list = groupByDisplayParent(rows, homeId).get(parentId) ?? []
  return list.filter((page) => page.id !== excludeId)
}

/** Chave para uma página nova no fim dos filhos de `parentId`. */
export function keyAtEnd(
  rows: readonly PageRow[],
  homeId: string | null,
  parentId: string | null,
): string {
  const siblings = siblingsOf(rows, homeId, parentId)
  return keyAtIndex(
    siblings.map((page) => page.sortKey),
    siblings.length,
  )
}

export type MovePlan =
  | { ok: true; unchanged: boolean; parentId: string | null; sortKey: string }
  | { ok: false; reason: 'self' | 'descendant' | 'missing' | 'tie' }

/**
 * Onde a página cai se for para a posição `index` (entre os irmãos de destino, já sem ela).
 * `parentId` null = raiz. `unchanged` indica que já está exatamente ali. `tie`: os dois vizinhos da
 * posição têm a mesma `sort_key` (empate desfeito só pelo id), então não existe chave entre eles sem
 * reescrever um vizinho; recusar é melhor que gravar uma chave que deixaria a ordem como estava.
 */
export function planMove(
  rows: readonly PageRow[],
  homeId: string | null,
  id: string,
  parentId: string | null,
  index: number,
): MovePlan {
  const page = rows.find((row) => row.id === id)
  if (!page) return { ok: false, reason: 'missing' }
  const check = validateMove(rows, id, parentId)
  if (check !== 'ok') return { ok: false, reason: check }

  const siblings = siblingsOf(rows, homeId, parentId, id)
  const at = Math.min(Math.max(index, 0), siblings.length)
  const currentParent = displayParent(page, new Set(rows.map((row) => row.id)), homeId)
  const currentIndex = siblingsOf(rows, homeId, currentParent).findIndex((row) => row.id === id)
  const unchanged = currentParent === parentId && currentIndex === at

  const keys = siblings.map((row) => row.sortKey)
  const before = keys[at - 1]
  const after = keys[at]
  if (!unchanged && before !== undefined && after !== undefined && before >= after) {
    return { ok: false, reason: 'tie' }
  }

  return { ok: true, unchanged, parentId, sortKey: keyAtIndex(keys, at) }
}

/**
 * Pode mandar para a lixeira? Só quem edita, e nunca a página inicial nem uma página que a contém
 * (o banco aceitaria; é o cliente que não oferece a ação, ver DECISÃO-026).
 */
export function canTrash(
  rows: readonly PageRow[],
  homeId: string | null,
  id: string,
  canEdit: boolean,
): boolean {
  if (!canEdit || id === homeId) return false
  return homeId === null || !descendantIds(rows, id).has(homeId)
}

/**
 * Para onde ir quando a página aberta deixa de existir por ter ido (ela ou uma ancestral) para a
 * lixeira: a página-pai de `trashedId`, ou "/" se for raiz ou filha da página inicial.
 */
export function fallbackAfterTrash(
  rows: readonly PageRow[],
  homeId: string | null,
  trashedId: string,
): string | null {
  const parentId = rows.find((row) => row.id === trashedId)?.parentId ?? null
  return parentId === null || parentId === homeId ? null : parentId
}
