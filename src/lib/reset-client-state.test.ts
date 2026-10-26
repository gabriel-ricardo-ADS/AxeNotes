import { QueryClient } from '@tanstack/react-query'
import type { MockInstance } from 'vitest'
import { useSearchStore } from '@/features/search/search-store'
import { indexedDbSyncMeta } from '@/features/sync/sync-meta'
import { forgetOpenedDatabases, pageDbName, rememberOpenedDatabase } from '@/lib/idb-names'
import { claimLocalData, readLocalDataOwner } from '@/lib/local-data-owner'
import {
  clientStateResetInProgress,
  KNOWN_IDB_DATABASES,
  onBeforeStorageClear,
  resetClientState,
} from '@/lib/reset-client-state'

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
  forgetOpenedDatabases()
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

  it('without indexedDB.databases(), also deletes the page databases listed in axenotes-sync', async () => {
    await indexedDbSyncMeta.setState('antiga', 'clean', 1)
    await indexedDbSyncMeta.setState('suja', 'dirty', 1)
    const real = indexedDB
    const deleteDatabase = vi.fn(() => fakeDeleteRequest())
    vi.stubGlobal('indexedDB', { open: real.open.bind(real), deleteDatabase })

    await resetClientState(new QueryClient())

    expect(deleteDatabase.mock.calls).toEqual(
      expect.arrayContaining([['axenotes-sync'], ['axenotes-page-antiga'], ['axenotes-page-suja']]),
    )
  })

  it('without indexedDB.databases(), also deletes the page databases opened in this tab', async () => {
    const deleteDatabase = vi.fn(() => fakeDeleteRequest())
    vi.stubGlobal('indexedDB', { deleteDatabase })
    rememberOpenedDatabase(pageDbName('p1'))
    rememberOpenedDatabase(pageDbName('p2'))

    await resetClientState(new QueryClient())

    expect(deleteDatabase.mock.calls).toEqual(
      expect.arrayContaining([['axenotes-page-p1'], ['axenotes-page-p2']]),
    )
    // Os nomes saem do registro junto com os bancos (os de nome fixo continuam na lista).
    deleteDatabase.mockClear()
    await resetClientState(new QueryClient())
    expect(deleteDatabase.mock.calls).toEqual(KNOWN_IDB_DATABASES.map((name) => [name]))
  })

  it('runs the before-clear tasks before deleting, and a failing task does not stop the logout', async () => {
    const order: string[] = []
    const deleteDatabase = vi.fn(() => {
      order.push('delete')
      return fakeDeleteRequest()
    })
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(() => Promise.resolve([{ name: 'axenotes-page-p1' }])),
      deleteDatabase,
    })
    const closeDocs = onBeforeStorageClear(async () => {
      await Promise.resolve()
      order.push('close docs')
    })
    const failing = onBeforeStorageClear(() => Promise.reject(new Error('falhou')))

    await resetClientState(new QueryClient())
    closeDocs()
    failing()

    expect(order).toEqual(['close docs', 'delete'])
    expect(errorLog).toHaveBeenCalledWith(
      'Falha ao preparar a limpeza do IndexedDB no logout',
      expect.anything(),
    )
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

  it('forgets the local data owner once IndexedDB is gone', async () => {
    claimLocalData('user-a')

    await resetClientState(new QueryClient())

    expect(readLocalDataOwner()).toBeNull()
  })

  it('keeps the local data owner when IndexedDB could not be deleted', async () => {
    claimLocalData('user-a')
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(() => Promise.resolve([{ name: 'axenotes-a' }])),
      deleteDatabase: vi.fn(() => fakeDeleteRequest('error')),
    })

    await resetClientState(new QueryClient())

    // A próxima conta diferente que entrar dispara a limpeza de novo.
    expect(readLocalDataOwner()).toBe('user-a')
  })

  it('runs once when called again while a reset is in progress', async () => {
    const databases = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('indexedDB', { databases, deleteDatabase: vi.fn() })
    const queryClient = new QueryClient()
    const clear = vi.spyOn(queryClient, 'clear')

    const first = resetClientState(queryClient)
    const second = resetClientState(queryClient)

    expect(second).toBe(first)
    expect(clientStateResetInProgress()).toBe(first)
    await Promise.all([first, second])
    expect(clientStateResetInProgress()).toBeNull()
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
