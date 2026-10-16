import { beforeEach, describe, expect, it, vi } from 'vitest'
import { insertPage, trashAndDeletePage } from '@/features/workspace/api/pages'
import { fetchHomePageId, setHomePageIfEmpty } from '@/features/workspace/api/workspace'
import { ensureHomePage } from '@/features/workspace/home'

vi.mock('@/features/workspace/api/pages', () => ({
  insertPage: vi.fn(),
  trashAndDeletePage: vi.fn(),
}))
vi.mock('@/features/workspace/api/workspace', () => ({
  fetchHomePageId: vi.fn(),
  setHomePageIfEmpty: vi.fn(),
}))

const fetchHome = vi.mocked(fetchHomePageId)
const setHome = vi.mocked(setHomePageIfEmpty)
const insert = vi.mocked(insertPage)
const discard = vi.mocked(trashAndDeletePage)

let counter = 0
/** Cada teste usa um workspace novo: a deduplicação por workspace não vaza entre testes. */
function workspaceId() {
  counter += 1
  return `ws-${String(counter)}`
}

beforeEach(() => {
  vi.resetAllMocks()
  insert.mockResolvedValue()
  discard.mockResolvedValue()
})

describe('ensureHomePage', () => {
  it('returns the existing home page without creating anything', async () => {
    fetchHome.mockResolvedValue('home-existente')

    await expect(ensureHomePage(workspaceId(), 'user-1')).resolves.toBe('home-existente')

    expect(insert).not.toHaveBeenCalled()
    expect(setHome).not.toHaveBeenCalled()
  })

  it('creates "Página inicial" at the root and records it as the home page', async () => {
    const ws = workspaceId()
    fetchHome.mockResolvedValue(null)
    setHome.mockResolvedValue(true)

    const id = await ensureHomePage(ws, 'user-1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: ws,
      parentId: null,
      title: 'Página inicial',
      icon: null,
      createdBy: 'user-1',
    })
    expect(id).toBe(insert.mock.calls[0]?.[0].id)
    expect(setHome).toHaveBeenCalledWith(ws, id)
    expect(discard).not.toHaveBeenCalled()
  })

  it('shares one creation between simultaneous calls (StrictMode, remounts)', async () => {
    fetchHome.mockResolvedValue(null)
    setHome.mockResolvedValue(true)
    const ws = workspaceId()

    const [first, second] = await Promise.all([
      ensureHomePage(ws, 'user-1'),
      ensureHomePage(ws, 'user-1'),
    ])

    expect(insert).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('when another tab won the race, deletes only its own page and returns the winner', async () => {
    fetchHome.mockResolvedValueOnce(null).mockResolvedValueOnce('home-da-outra-aba')
    setHome.mockResolvedValue(false)

    const id = await ensureHomePage(workspaceId(), 'user-1')

    expect(id).toBe('home-da-outra-aba')
    expect(discard).toHaveBeenCalledTimes(1)
    expect(discard).toHaveBeenCalledWith(insert.mock.calls[0]?.[0].id)
    expect(discard).not.toHaveBeenCalledWith('home-da-outra-aba')
  })

  it('never deletes the page that is the current home, even if the update reported no change', async () => {
    let created = ''
    insert.mockImplementation((page) => {
      created = page.id
      return Promise.resolve()
    })
    fetchHome.mockResolvedValueOnce(null).mockImplementationOnce(() => Promise.resolve(created))
    setHome.mockResolvedValue(false)

    const id = await ensureHomePage(workspaceId(), 'user-1')

    expect(id).toBe(created)
    expect(discard).not.toHaveBeenCalled()
  })

  it('removes its own unused page and returns null when nobody has a home page', async () => {
    fetchHome.mockResolvedValue(null)
    setHome.mockResolvedValue(false)

    await expect(ensureHomePage(workspaceId(), 'user-1')).resolves.toBeNull()

    expect(discard).toHaveBeenCalledWith(insert.mock.calls[0]?.[0].id)
  })

  it('does not fail if cleaning up the losing page fails', async () => {
    fetchHome.mockResolvedValueOnce(null).mockResolvedValueOnce('vencedora')
    setHome.mockResolvedValue(false)
    discard.mockRejectedValue(new Error('pages_trash_failed'))

    await expect(ensureHomePage(workspaceId(), 'user-1')).resolves.toBe('vencedora')
  })

  it('propagates an insert failure and allows trying again', async () => {
    const ws = workspaceId()
    fetchHome.mockResolvedValue(null)
    insert.mockRejectedValueOnce(new Error('pages_insert_failed'))

    await expect(ensureHomePage(ws, 'user-1')).rejects.toThrow('pages_insert_failed')

    setHome.mockResolvedValue(true)
    await expect(ensureHomePage(ws, 'user-1')).resolves.toEqual(expect.any(String))
  })
})
