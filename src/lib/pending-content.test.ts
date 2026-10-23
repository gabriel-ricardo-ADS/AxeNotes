import { indexedDbSyncMeta } from '@/features/sync/sync-meta'
import { SYNC_META_DB } from '@/lib/idb-names'
import { flushPendingContent, registerPendingContentFlusher } from '@/lib/pending-content'
import { readSyncMetaEntries } from '@/lib/sync-meta-read'

const databaseNames = async () =>
  (await indexedDB.databases()).flatMap((info) => (info.name ? [info.name] : []))

describe('flushPendingContent', () => {
  it('usa o envio registrado pelo sync e devolve o que sobrou', async () => {
    const flush = vi.fn(() => Promise.resolve(2))
    const unregister = registerPendingContentFlusher(flush)
    try {
      expect(await flushPendingContent(5000)).toEqual({ pending: 2 })
      expect(flush).toHaveBeenCalledWith(5000)
    } finally {
      unregister()
    }
  })

  it('sem o sync carregado (ex.: offline sem o chunk do editor), conta as páginas dirty', async () => {
    await indexedDbSyncMeta.setState('a', 'dirty', 1)
    await indexedDbSyncMeta.setState('b', 'blocked', 1)
    await indexedDbSyncMeta.setState('c', 'clean', 1)
    await indexedDbSyncMeta.setState('d', 'dirty', 1)
    expect(await flushPendingContent(5000)).toEqual({ pending: 2 })
  })

  it('sem metadados: nada pendente, e o banco não é criado só por ler', async () => {
    expect(await flushPendingContent(5000)).toEqual({ pending: 0 })
    expect(await readSyncMetaEntries()).toEqual([])
    expect(await databaseNames()).not.toContain(SYNC_META_DB)
  })
})
