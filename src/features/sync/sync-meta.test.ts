import { indexedDbSyncMeta, stateOnOpen } from '@/features/sync/sync-meta'

describe('stateOnOpen', () => {
  it('página nova: dirty se já tem conteúdo no aparelho, senão clean', () => {
    expect(stateOnOpen(undefined, { canWrite: true, hasLocalContent: true })).toBe('dirty')
    expect(stateOnOpen(undefined, { canWrite: true, hasLocalContent: false })).toBe('clean')
  })

  it('blocked volta a dirty só quando abre com permissão de escrita', () => {
    expect(stateOnOpen('blocked', { canWrite: true, hasLocalContent: true })).toBe('dirty')
    expect(stateOnOpen('blocked', { canWrite: false, hasLocalContent: true })).toBe('blocked')
  })

  it('clean e dirty ficam como estão', () => {
    expect(stateOnOpen('clean', { canWrite: true, hasLocalContent: true })).toBe('clean')
    expect(stateOnOpen('dirty', { canWrite: false, hasLocalContent: false })).toBe('dirty')
  })
})

describe('indexedDbSyncMeta (axenotes-sync)', () => {
  it('grava, lê e esquece registros, na ordem em que as gravações foram pedidas', async () => {
    const meta = indexedDbSyncMeta
    void meta.markOpened('p1', 1000, { canWrite: true, hasLocalContent: false })
    void meta.setState('p1', 'dirty', 2000)
    void meta.setState('p1', 'clean', 3000)
    void meta.setState('p2', 'blocked', 4000)

    // `list` espera as gravações pendentes.
    expect(await meta.list()).toEqual(
      expect.arrayContaining([
        { pageId: 'p1', lastOpenedAt: 1000, state: 'clean' },
        { pageId: 'p2', lastOpenedAt: 4000, state: 'blocked' },
      ]),
    )

    await meta.markOpened('p2', 5000, { canWrite: true, hasLocalContent: true })
    await meta.forget('p1')
    expect(await meta.list()).toEqual([{ pageId: 'p2', lastOpenedAt: 5000, state: 'dirty' }])
  })

  it('fecha a conexão depois de cada operação (não bloqueia o delete do logout)', async () => {
    await indexedDbSyncMeta.setState('p1', 'dirty', 1)
    const blocked = vi.fn()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('axenotes-sync')
      request.onblocked = blocked
      request.onsuccess = () => {
        resolve()
      }
      request.onerror = () => {
        reject(new Error('delete falhou'))
      }
    })
    expect(blocked).not.toHaveBeenCalled()
  })
})
