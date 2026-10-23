import { QueryClient } from '@tanstack/react-query'
import {
  LOCAL_EDITED_INTERVAL_MS,
  markPageEditedLocally,
  touchLastEdited,
} from '@/features/workspace/last-edited'
import { workspaceKeys } from '@/features/workspace/query-keys'
import type { PageRow } from '@/features/workspace/types'

const T0 = Date.parse('2026-10-22T12:00:00Z')

const row = (id: string, lastEditedAt: number): PageRow => ({
  id,
  parentId: null,
  title: id,
  icon: null,
  sortKey: 'a0',
  lastEditedAt: new Date(lastEditedAt).toISOString(),
})

describe('touchLastEdited', () => {
  it('atualiza só a página e só se o valor guardado tem 60 s ou mais', () => {
    const rows = [row('a', T0), row('b', T0)]
    expect(touchLastEdited(rows, 'a', T0 + LOCAL_EDITED_INTERVAL_MS - 1)).toBe(rows)
    const next = touchLastEdited(rows, 'a', T0 + LOCAL_EDITED_INTERVAL_MS)
    expect(next).not.toBe(rows)
    expect(next[0]?.lastEditedAt).toBe(new Date(T0 + LOCAL_EDITED_INTERVAL_MS).toISOString())
    expect(next[1]).toBe(rows[1])
  })

  it('página fora da lista: nada muda', () => {
    const rows = [row('a', T0)]
    expect(touchLastEdited(rows, 'x', T0 + 10 * LOCAL_EDITED_INTERVAL_MS)).toBe(rows)
  })
})

describe('markPageEditedLocally', () => {
  it('atualiza o cache sem buscar a página de novo, no máximo uma vez a cada 60 s', () => {
    const client = new QueryClient()
    const key = workspaceKeys.pages('w1')
    client.setQueryData<PageRow[]>(key, [row('a', T0 - 2 * LOCAL_EDITED_INTERVAL_MS)])
    const fetchQuery = vi.spyOn(client, 'fetchQuery')
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    markPageEditedLocally(client, 'w1', 'a', T0)
    const first = client.getQueryData<PageRow[]>(key)
    expect(first?.[0]?.lastEditedAt).toBe(new Date(T0).toISOString())

    // Envios seguidos (a cada 1–5 s de digitação) não mexem no cache nem buscam nada.
    markPageEditedLocally(client, 'w1', 'a', T0 + 5000)
    expect(client.getQueryData<PageRow[]>(key)).toBe(first)
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })
})
