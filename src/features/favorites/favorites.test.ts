import {
  compareFavorites,
  favoriteKeyAtEnd,
  sortFavorites,
  visibleFavorites,
} from '@/features/favorites/favorites'
import type { PageRow } from '@/features/workspace/types'

const page = (id: string, title = id): PageRow => ({
  id,
  parentId: null,
  title,
  icon: null,
  sortKey: 'a0',
  lastEditedAt: '2026-10-10T12:00:00Z',
})

describe('compareFavorites', () => {
  it('orders by sort_key as plain strings (bytes), never by locale', () => {
    // "Z" < "a" em bytes; localeCompare poria "a" antes de "Z".
    expect(compareFavorites({ pageId: 'x', sortKey: 'Z' }, { pageId: 'y', sortKey: 'a' })).toBe(-1)
    expect(compareFavorites({ pageId: 'x', sortKey: 'a' }, { pageId: 'y', sortKey: 'Z' })).toBe(1)
  })

  it('breaks ties by page id so every device shows the same order', () => {
    const a = { pageId: 'a', sortKey: 'a0' }
    const b = { pageId: 'b', sortKey: 'a0' }
    expect(sortFavorites([b, a])).toEqual([a, b])
    expect(compareFavorites(a, { ...a })).toBe(0)
  })
})

describe('favoriteKeyAtEnd', () => {
  it('starts a new list with a first key', () => {
    expect(favoriteKeyAtEnd([])).toBe('a0')
  })

  it('returns a key after every existing one, even when the list is unsorted', () => {
    const entries = [
      { pageId: 'b', sortKey: 'a1' },
      { pageId: 'a', sortKey: 'a0' },
    ]
    const key = favoriteKeyAtEnd(entries)
    expect(key > 'a1').toBe(true)
  })

  it('counts favorites whose pages are hidden too (they keep their place)', () => {
    const key = favoriteKeyAtEnd([{ pageId: 'in-trash', sortKey: 'a5' }])
    expect(key > 'a5').toBe(true)
  })
})

describe('visibleFavorites', () => {
  it('lists pages in favorite order and leaves out the ones not in the page list', () => {
    const entries = [
      { pageId: 'b', sortKey: 'a1' },
      { pageId: 'gone', sortKey: 'a0' },
      { pageId: 'a', sortKey: 'a2' },
    ]
    const result = visibleFavorites(entries, [page('a'), page('b')])
    expect(result.map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('brings a favorite back when its page returns to the list (restored from the trash)', () => {
    const entries = [{ pageId: 'a', sortKey: 'a0' }]
    expect(visibleFavorites(entries, [])).toEqual([])
    expect(visibleFavorites(entries, [page('a')]).map((row) => row.id)).toEqual(['a'])
  })
})
