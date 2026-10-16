import {
  RECENTS_KEPT,
  RECENTS_SHOWN,
  RECENT_REPEAT_MS,
  compareRecents,
  shouldRecord,
  trimCutoff,
  visibleRecents,
  withVisit,
  type RecentEntry,
} from '@/features/recents/recents'
import type { PageRow } from '@/features/workspace/types'

const page = (id: string): PageRow => ({
  id,
  parentId: null,
  title: id,
  icon: null,
  sortKey: 'a0',
  lastEditedAt: '2026-10-10T12:00:00Z',
})

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, seconds)).toISOString()
const entry = (pageId: string, seconds: number): RecentEntry => ({ pageId, visitedAt: at(seconds) })

describe('compareRecents', () => {
  it('puts the latest visit first, comparing instants (not the text of the timestamp)', () => {
    // O servidor devolve "+00:00" e o cliente grava "Z": como texto, a ordem ficaria errada.
    const server = { pageId: 'a', visitedAt: '2026-10-01T00:00:10.000000+00:00' }
    const client = { pageId: 'b', visitedAt: '2026-10-01T00:00:05.000Z' }
    expect([client, server].sort(compareRecents).map((row) => row.pageId)).toEqual(['a', 'b'])
  })

  it('breaks ties by page id', () => {
    expect([entry('b', 1), entry('a', 1)].sort(compareRecents).map((row) => row.pageId)).toEqual([
      'a',
      'b',
    ])
  })
})

describe('visibleRecents', () => {
  it('lists the latest pages, leaving out the home page and pages not in the list', () => {
    const entries = [entry('old', 1), entry('home', 9), entry('trashed', 8), entry('new', 5)]
    const result = visibleRecents(entries, [page('old'), page('home'), page('new')], 'home')
    expect(result.map((row) => row.id)).toEqual(['new', 'old'])
  })

  it('shows at most 8 by default, filling the list after skipping hidden pages', () => {
    const entries = Array.from({ length: 20 }, (_, index) => entry(`p${String(index)}`, index))
    const pages = entries.filter((_, index) => index !== 19).map((row) => page(row.pageId))
    const result = visibleRecents(entries, pages, null)
    expect(result).toHaveLength(RECENTS_SHOWN)
    expect(result[0]?.id).toBe('p18')
  })
})

describe('withVisit', () => {
  it('moves a page already in the list to the top, without duplicating it', () => {
    const result = withVisit([entry('a', 1), entry('b', 2)], 'a', at(9))
    expect(result.map((row) => row.pageId)).toEqual(['a', 'b'])
    expect(result[0]?.visitedAt).toBe(at(9))
  })

  it('keeps at most RECENTS_KEPT entries, dropping the oldest', () => {
    const entries = Array.from({ length: RECENTS_KEPT }, (_, index) =>
      entry(`p${String(index)}`, index + 1),
    )
    const result = withVisit(entries, 'novo', at(999))
    expect(result).toHaveLength(RECENTS_KEPT)
    expect(result[0]?.pageId).toBe('novo')
    expect(result.some((row) => row.pageId === 'p0')).toBe(false)
  })
})

describe('trimCutoff', () => {
  it('is null while there is still room', () => {
    const entries = Array.from({ length: RECENTS_KEPT - 1 }, (_, index) =>
      entry(`p${String(index)}`, index),
    )
    expect(trimCutoff(entries)).toBeNull()
  })

  it('is the visit time of the last entry that still fits when the list is full', () => {
    const entries = Array.from({ length: RECENTS_KEPT }, (_, index) =>
      entry(`p${String(index)}`, index + 1),
    )
    expect(trimCutoff(entries)).toBe(at(1))
  })
})

describe('shouldRecord', () => {
  const key = 'user-1:page-a'

  it('records the first visit', () => {
    expect(shouldRecord(null, key, 1_000)).toBe(true)
  })

  it('ignores the same page again within the repeat window', () => {
    expect(shouldRecord({ key, at: 1_000 }, key, 1_000 + RECENT_REPEAT_MS - 1)).toBe(false)
  })

  it('records the same page again after the window', () => {
    expect(shouldRecord({ key, at: 1_000 }, key, 1_000 + RECENT_REPEAT_MS)).toBe(true)
  })

  it('records A → B → A: going to another page resets the guard', () => {
    const afterB = { key: 'user-1:page-b', at: 2_000 }
    expect(shouldRecord(afterB, key, 3_000)).toBe(true)
  })

  it('does not mistake another user for the same visit', () => {
    expect(shouldRecord({ key: 'user-2:page-a', at: 1_000 }, key, 1_001)).toBe(true)
  })

  it('records when the clock went backwards', () => {
    expect(shouldRecord({ key, at: 5_000 }, key, 1_000)).toBe(true)
  })
})
