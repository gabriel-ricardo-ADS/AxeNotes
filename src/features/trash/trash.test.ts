import { describe, expect, it } from 'vitest'
import { trashErrorMessage } from '@/features/trash/messages'
import {
  buildTrashRoots,
  mapTrashError,
  separateCount,
  TrashActionError,
  type TrashedPage,
} from '@/features/trash/trash'
import type { PageRow } from '@/features/workspace/types'

const T1 = '2026-10-10T10:00:00.123456+00:00'
const T2 = '2026-10-12T10:00:00.123456+00:00'
const T3 = '2026-10-14T10:00:00.123456+00:00'

function trashed(id: string, parentId: string | null, trashedAt: string, title = id): TrashedPage {
  return { id, parentId, title, icon: null, trashedAt }
}

function live(id: string, title = id): PageRow {
  return { id, parentId: null, title, icon: null, sortKey: 'a0', lastEditedAt: T1 }
}

const ids = (roots: { page: TrashedPage }[]) => roots.map((root) => root.page.id)

describe('buildTrashRoots', () => {
  it('lists a page whose parent is not in the trash, and counts what left with it', () => {
    const roots = buildTrashRoots(
      [trashed('a', 'viva', T1), trashed('a1', 'a', T1), trashed('a11', 'a1', T1)],
      [live('viva', 'Pai vivo')],
      null,
    )
    expect(ids(roots)).toEqual(['a'])
    expect(roots[0]?.sameStampCount).toBe(2)
    expect(roots[0]?.descendantCount).toBe(2)
    expect(roots[0]?.origin).toEqual({ kind: 'page', title: 'Pai vivo', trashed: false })
  })

  it('hides subpages trashed together with their parent', () => {
    const roots = buildTrashRoots([trashed('a', null, T1), trashed('a1', 'a', T1)], [], null)
    expect(ids(roots)).toEqual(['a'])
  })

  it('shows a child trashed BEFORE its parent as its own root, and does not count it in the parent', () => {
    // filho (T1) foi lixeado antes; depois o pai (T2) levou o resto.
    const roots = buildTrashRoots(
      [
        trashed('pai', null, T2),
        trashed('filho', 'pai', T1),
        trashed('irma', 'pai', T2),
        trashed('neto', 'filho', T1),
      ],
      [],
      null,
    )
    expect(ids(roots)).toEqual(['pai', 'filho'])
    const [pai, filho] = roots
    expect(pai?.sameStampCount).toBe(1) // só a irmã
    expect(pai?.descendantCount).toBe(3) // irmã, filho e neto: o FK apaga todos
    expect(pai && separateCount(pai)).toBe(2)
    expect(filho?.sameStampCount).toBe(1) // o neto saiu junto com o filho
    expect(filho?.origin).toEqual({ kind: 'page', title: 'pai', trashed: true })
  })

  it('keeps the child as a root after the parent is restored (parent no longer in the trash)', () => {
    const roots = buildTrashRoots([trashed('filho', 'pai', T1)], [live('pai', 'Pai')], null)
    expect(ids(roots)).toEqual(['filho'])
    expect(roots[0]?.origin).toEqual({ kind: 'page', title: 'Pai', trashed: false })
  })

  it('compares the stamps as exact text, so microsecond differences count', () => {
    const near = '2026-10-10T10:00:00.123457+00:00' // 1 µs depois de T1
    const roots = buildTrashRoots([trashed('a', null, T1), trashed('b', 'a', near)], [], null)
    expect(ids(roots)).toEqual(['b', 'a'])
    expect(roots.find((root) => root.page.id === 'a')?.sameStampCount).toBe(0)
  })

  it('orders the newest first and breaks ties by id', () => {
    const roots = buildTrashRoots(
      [trashed('b', null, T2), trashed('c', null, T3), trashed('a', null, T2)],
      [],
      null,
    )
    expect(ids(roots)).toEqual(['c', 'a', 'b'])
  })

  it('treats the origin of a top-level page and of a child of the home page as the main level', () => {
    const roots = buildTrashRoots([trashed('x', null, T1), trashed('y', 'home', T1)], [], 'home')
    expect(roots.map((root) => root.origin)).toEqual([{ kind: 'root' }, { kind: 'root' }])
  })

  it('has an unknown origin while the live pages are not loaded, or when the parent is nowhere', () => {
    expect(buildTrashRoots([trashed('x', 'p', T1)], undefined, null)[0]?.origin).toEqual({
      kind: 'unknown',
    })
    expect(buildTrashRoots([trashed('x', 'p', T1)], [], null)[0]?.origin).toEqual({
      kind: 'unknown',
    })
  })

  it('returns nothing for an empty trash and survives a parent cycle', () => {
    expect(buildTrashRoots([], [], null)).toEqual([])
    // ciclo inesperado: ninguém é raiz, e nada entra em laço infinito
    expect(buildTrashRoots([trashed('a', 'b', T1), trashed('b', 'a', T1)], [], null)).toEqual([])
  })
})

describe('mapTrashError', () => {
  it('recognizes a parent that is still in the trash', () => {
    expect(mapTrashError({ code: '23514', message: 'parent_trashed' })).toBe('parent_trashed')
    expect(mapTrashError({ message: 'parent_trashed' })).toBe('parent_trashed')
  })

  it('recognizes missing permission', () => {
    expect(mapTrashError({ code: '42501', message: 'forbidden' })).toBe('forbidden')
  })

  it('classifies anything else, including network failures, as unknown', () => {
    expect(mapTrashError({ code: '08006', message: 'connection failure' })).toBe('unknown')
    expect(mapTrashError(new TypeError('Failed to fetch'))).toBe('unknown')
    expect(mapTrashError(null)).toBe('unknown')
    expect(mapTrashError('boom')).toBe('unknown')
  })

  it('keeps the kind of an error that was already classified', () => {
    expect(mapTrashError(new TrashActionError('forbidden'))).toBe('forbidden')
  })
})

describe('trashErrorMessage', () => {
  it('explains a parent that is still in the trash only when restoring', () => {
    const error = new TrashActionError('parent_trashed')
    expect(trashErrorMessage('restore', error)).toBe(
      'A página pai ainda está na lixeira. Restaure a página pai primeiro.',
    )
    expect(trashErrorMessage('trash', error)).toBe(
      'Não foi possível mover a página para a lixeira. Tente novamente.',
    )
  })

  it('has its own message for missing permission and a generic one per action', () => {
    expect(trashErrorMessage('delete', new TrashActionError('forbidden'))).toBe(
      'Você não tem permissão para fazer isso neste workspace.',
    )
    expect(trashErrorMessage('restore', new Error('x'))).toBe(
      'Não foi possível restaurar a página. Tente novamente.',
    )
    expect(trashErrorMessage('delete', new TrashActionError('unknown'))).toContain(
      'Não foi possível excluir a página.',
    )
  })
})
