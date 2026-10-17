import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  buildPageTree,
  canTrash,
  comparePages,
  descendantIds,
  fallbackAfterTrash,
  flattenVisible,
  keyAtEnd,
  planMove,
  siblingsOf,
  validateMove,
} from '@/features/workspace/tree'
import type { PageRow } from '@/features/workspace/types'

function page(id: string, parentId: string | null, sortKey: string, title = id): PageRow {
  return { id, parentId, title, icon: null, sortKey, lastEditedAt: '2026-10-16T12:00:00Z' }
}

// raiz: a (a0) ─ a1 (a0), a2 (a1)
//       b (a1)
//       c (a2) ─ c1 ─ c11
const rows: PageRow[] = [
  page('c', null, 'a2'),
  page('a2', 'a', 'a1'),
  page('a', null, 'a0'),
  page('c11', 'c1', 'a0'),
  page('b', null, 'a1'),
  page('a1', 'a', 'a0'),
  page('c1', 'c', 'a0'),
]

const ids = (nodes: { page: PageRow }[]) => nodes.map((node) => node.page.id)

describe('comparePages', () => {
  it('orders by sort_key with plain string comparison, not localeCompare', () => {
    // Em bytes "Zz" < "a0"; localeCompare (intl) ordena "a0" antes de "Zz".
    const upper = page('x', null, 'Zz')
    const lower = page('y', null, 'a0')
    expect(comparePages(upper, lower)).toBeLessThan(0)
    expect('Zz'.localeCompare('a0')).toBeGreaterThan(0)
    expect([lower, upper].sort(comparePages).map((p) => p.id)).toEqual(['x', 'y'])
  })

  it('breaks ties by id', () => {
    const first = page('1', null, 'a0')
    const second = page('2', null, 'a0')
    expect([second, first].sort(comparePages).map((p) => p.id)).toEqual(['1', '2'])
  })
})

describe('buildPageTree', () => {
  it('builds ordered roots and children', () => {
    const tree = buildPageTree(rows, null)

    expect(ids(tree)).toEqual(['a', 'b', 'c'])
    expect(ids(tree[0]?.children ?? [])).toEqual(['a1', 'a2'])
    expect(ids(tree[2]?.children[0]?.children ?? [])).toEqual(['c11'])
  })

  it('leaves the home page out and shows its children as roots', () => {
    const withHome = [page('home', null, 'a5'), page('h1', 'home', 'a0'), ...rows]

    const tree = buildPageTree(withHome, 'home')

    // a e h1 empatam em a0: o id desempata.
    expect(ids(tree)).toEqual(['a', 'h1', 'b', 'c'])
    expect(ids(tree)).not.toContain('home')
  })

  it('shows a page whose parent is missing as a root instead of losing it', () => {
    const tree = buildPageTree([page('orphan', 'gone', 'a0'), page('r', null, 'a1')], null)

    expect(ids(tree)).toEqual(['orphan', 'r'])
  })

  it('does not loop forever if a cycle ever got into the data', () => {
    const tree = buildPageTree([page('x', 'y', 'a0'), page('y', 'x', 'a0'), page('r', null, 'a1')], null)

    expect(ids(tree)).toContain('r')
  })
})

describe('flattenVisible', () => {
  const tree = buildPageTree(rows, null)

  it('shows only roots when nothing is expanded', () => {
    const flat = flattenVisible(tree, new Set())

    expect(flat.map((item) => item.page.id)).toEqual(['a', 'b', 'c'])
    expect(flat[0]).toMatchObject({ level: 1, hasChildren: true, expanded: false, parentId: null })
    expect(flat[1]).toMatchObject({ hasChildren: false, expanded: false })
  })

  it('shows children with their level under expanded nodes', () => {
    const flat = flattenVisible(tree, new Set(['a', 'c', 'c1']))

    expect(flat.map((item) => [item.page.id, item.level])).toEqual([
      ['a', 1],
      ['a1', 2],
      ['a2', 2],
      ['b', 1],
      ['c', 1],
      ['c1', 2],
      ['c11', 3],
    ])
    expect(flat[1]?.parentId).toBe('a')
  })

  it('ignores expansion of a node without children', () => {
    expect(flattenVisible(tree, new Set(['b'])).find((i) => i.page.id === 'b')?.expanded).toBe(false)
  })
})

describe('ancestorsOf / descendantIds', () => {
  it('returns the chain from the top to the parent', () => {
    expect(ancestorsOf(rows, 'c11').map((p) => p.id)).toEqual(['c', 'c1'])
    expect(ancestorsOf(rows, 'a')).toEqual([])
    expect(ancestorsOf(rows, 'nope')).toEqual([])
  })

  it('stops on a broken or circular chain', () => {
    const loop = [page('x', 'y', 'a0'), page('y', 'x', 'a0')]
    expect(ancestorsOf(loop, 'x').map((p) => p.id)).toEqual(['y'])
    expect(ancestorsOf([page('z', 'gone', 'a0')], 'z')).toEqual([])
  })

  it('collects all descendants', () => {
    expect([...descendantIds(rows, 'c')].sort()).toEqual(['c1', 'c11'])
    expect(descendantIds(rows, 'b').size).toBe(0)
  })
})

describe('validateMove', () => {
  it('allows moving to the root and to unrelated pages', () => {
    expect(validateMove(rows, 'c1', null)).toBe('ok')
    expect(validateMove(rows, 'c1', 'a')).toBe('ok')
    expect(validateMove(rows, 'c', 'a')).toBe('ok')
  })

  it('refuses moving into itself', () => {
    expect(validateMove(rows, 'c', 'c')).toBe('self')
  })

  it('refuses moving into a descendant, however deep', () => {
    expect(validateMove(rows, 'c', 'c1')).toBe('descendant')
    expect(validateMove(rows, 'c', 'c11')).toBe('descendant')
  })
})

describe('siblingsOf / keyAtEnd', () => {
  it('lists siblings in display order, excluding one', () => {
    expect(siblingsOf(rows, null, null).map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(siblingsOf(rows, null, null, 'b').map((p) => p.id)).toEqual(['a', 'c'])
    expect(siblingsOf(rows, null, 'a').map((p) => p.id)).toEqual(['a1', 'a2'])
  })

  it('creates a key after the last sibling, also in an empty parent', () => {
    expect(keyAtEnd(rows, null, null) > 'a2').toBe(true)
    expect(keyAtEnd(rows, null, 'a') > 'a1').toBe(true)
    expect(keyAtEnd(rows, null, 'b').length).toBeGreaterThan(0)
  })
})

describe('planMove', () => {
  it('puts a page between two siblings of another parent', () => {
    const plan = planMove(rows, null, 'b', 'a', 1)

    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.parentId).toBe('a')
      expect(plan.sortKey > 'a0' && plan.sortKey < 'a1').toBe(true)
      expect(plan.unchanged).toBe(false)
    }
  })

  it('moves to the end of the root', () => {
    const plan = planMove(rows, null, 'a', null, 99)

    expect(plan.ok && plan.sortKey > 'a2').toBe(true)
  })

  it('detects a move that changes nothing', () => {
    const plan = planMove(rows, null, 'b', null, 1)

    expect(plan).toMatchObject({ ok: true, unchanged: true })
  })

  it('refuses a position between two siblings with the same sort_key instead of a no-op key', () => {
    // x e y empatam em a0 (desempate pelo id): não existe chave entre eles.
    const tied = [page('x', null, 'a0'), page('y', null, 'a0'), page('z', null, 'a1')]

    expect(planMove(tied, null, 'z', null, 1)).toEqual({ ok: false, reason: 'tie' })
    // No começo, no fim e dentro de outro pai não há empate entre os vizinhos.
    expect(planMove(tied, null, 'z', null, 0)).toMatchObject({ ok: true })
    expect(planMove(tied, null, 'x', null, 99)).toMatchObject({ ok: true })
  })

  it('refuses own node and descendants, and unknown pages', () => {
    expect(planMove(rows, null, 'c', 'c', 0)).toEqual({ ok: false, reason: 'self' })
    expect(planMove(rows, null, 'c', 'c11', 0)).toEqual({ ok: false, reason: 'descendant' })
    expect(planMove(rows, null, 'nope', null, 0)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('canTrash', () => {
  it('lets an editor trash a normal page', () => {
    expect(canTrash(rows, 'h', 'a', true)).toBe(true)
  })

  it('never offers the action to a viewer', () => {
    expect(canTrash(rows, 'h', 'a', false)).toBe(false)
  })

  it('never offers it for the home page, nor for a page that contains it', () => {
    const withHome: PageRow[] = [...rows, page('h', 'c11', 'a0')]
    expect(canTrash(withHome, 'h', 'h', true)).toBe(false)
    expect(canTrash(withHome, 'h', 'c', true)).toBe(false) // c ─ c1 ─ c11 ─ h
    expect(canTrash(withHome, 'h', 'c11', true)).toBe(false)
    expect(canTrash(withHome, 'h', 'a', true)).toBe(true)
  })

  it('works when the workspace has no home page yet', () => {
    expect(canTrash(rows, null, 'c', true)).toBe(true)
  })
})

describe('fallbackAfterTrash', () => {
  const withHome: PageRow[] = [...rows, page('h', null, 'a9'), page('under-home', 'h', 'a0')]

  it('goes to the parent page', () => {
    expect(fallbackAfterTrash(rows, null, 'c11')).toBe('c1')
  })

  it('goes to "/" (null) for a root and for a child of the home page', () => {
    expect(fallbackAfterTrash(rows, null, 'c')).toBeNull()
    expect(fallbackAfterTrash(withHome, 'h', 'under-home')).toBeNull()
  })

  it('goes to "/" when the page is not in the list', () => {
    expect(fallbackAfterTrash(rows, null, 'nao-existe')).toBeNull()
  })
})
