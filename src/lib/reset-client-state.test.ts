import { QueryClient } from '@tanstack/react-query'
import type { MockInstance } from 'vitest'
import { useSearchStore } from '@/features/search/search-store'
import { KNOWN_IDB_DATABASES, resetClientState } from '@/lib/reset-client-state'

/** Pedido de `deleteDatabase` que termina como o navegador faria (sucesso, bloqueado ou erro). */
function fakeDeleteRequest(outcome: 'success' | 'blocked' | 'error' = 'success') {
  const request: Partial<IDBOpenDBRequest> & { error: DOMException | null } = { error: null }
  queueMicrotask(() => {
    if (outcome === 'success')
      request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'))
    if (outcome === 'blocked') {
      request.onblocked?.call(
        request as IDBOpenDBRequest,
        new Event('blocked') as IDBVersionChangeEvent,
      )
    }
    if (outcome === 'error') {
      request.error = new DOMException('falha simulada')
      request.onerror?.call(request as IDBOpenDBRequest, new Event('error'))
    }
  })
  return request as IDBOpenDBRequest
}

function installServiceWorkers(registrations: { unregister: () => Promise<boolean> }[]) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn(() => Promise.resolve(registrations)) },
  })
}

let errorLog: MockInstance<typeof console.error>

beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  errorLog.mockRestore()
})

describe('resetClientState', () => {
  it('empties the query cache and resets the stores right away', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['pages', 'ws-a'], [{ id: 'p1', title: 'Leituras' }])
    useSearchStore.getState().openSearch(null)
    useSearchStore.getState().setTerm('leituras')

    const done = resetClientState(queryClient)

    // Síncrono: nada da conta anterior chega ao próximo render.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(useSearchStore.getState()).toMatchObject({ open: false, term: '' })
    await done
  })

  it('deletes every IndexedDB database, unregisters service workers and clears Cache Storage', async () => {
    const deleteDatabase = vi.fn(() => fakeDeleteRequest())
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(() => Promise.resolve([{ name: 'axenotes-a' }, { name: 'axenotes-b' }, {}])),
      deleteDatabase,
    })
    const unregister = vi.fn(() => Promise.resolve(true))
    installServiceWorkers([{ unregister }, { unregister }])
    const cacheDelete = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('caches', {
      keys: vi.fn(() => Promise.resolve(['shell', 'assets'])),
      delete: cacheDelete,
    })

    await resetClientState(new QueryClient())

    expect(deleteDatabase.mock.calls).toEqual([['axenotes-a'], ['axenotes-b']])
    expect(unregister).toHaveBeenCalledTimes(2)
    expect(cacheDelete.mock.calls).toEqual([['shell'], ['assets']])
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('falls back to the known database list without indexedDB.databases()', async () => {
    const deleteDatabase = vi.fn(() => fakeDeleteRequest())
    vi.stubGlobal('indexedDB', { deleteDatabase })

    await resetClientState(new QueryClient())

    expect(deleteDatabase.mock.calls).toEqual(KNOWN_IDB_DATABASES.map((name) => [name]))
  })

  it('does not hang when a database is blocked by another tab', async () => {
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(() => Promise.resolve([{ name: 'axenotes-a' }])),
      deleteDatabase: vi.fn(() => fakeDeleteRequest('blocked')),
    })

    await expect(resetClientState(new QueryClient())).resolves.toBeUndefined()
  })

  it('logs a failing step and still runs the others, without rejecting', async () => {
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(() => Promise.resolve([{ name: 'axenotes-a' }])),
      deleteDatabase: vi.fn(() => fakeDeleteRequest('error')),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(() => Promise.reject(new Error('sw indisponível'))) },
    })
    const cacheDelete = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('caches', { keys: vi.fn(() => Promise.resolve(['shell'])), delete: cacheDelete })

    await expect(resetClientState(new QueryClient())).resolves.toBeUndefined()

    expect(cacheDelete).toHaveBeenCalledWith('shell')
    expect(errorLog).toHaveBeenCalledTimes(2)
    expect(errorLog).toHaveBeenCalledWith('Falha ao limpar IndexedDB no logout', expect.anything())
    expect(errorLog).toHaveBeenCalledWith(
      'Falha ao limpar service worker no logout',
      expect.anything(),
    )
  })

  it('runs once when called again while a reset is in progress', async () => {
    const databases = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('indexedDB', { databases, deleteDatabase: vi.fn() })
    const queryClient = new QueryClient()
    const clear = vi.spyOn(queryClient, 'clear')

    const first = resetClientState(queryClient)
    const second = resetClientState(queryClient)

    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(clear).toHaveBeenCalledTimes(1)
    expect(databases).toHaveBeenCalledTimes(1)

    // Um logout novo, depois do anterior terminar, limpa de novo.
    await resetClientState(queryClient)
    expect(clear).toHaveBeenCalledTimes(2)
  })

  it('skips what the browser does not have (no IndexedDB, service worker or caches)', async () => {
    await expect(resetClientState(new QueryClient())).resolves.toBeUndefined()
    expect(errorLog).not.toHaveBeenCalled()
  })
})
