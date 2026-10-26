import { SYNC_META_DB, SYNC_META_STORE } from '@/lib/idb-names'

/** Um registro de `axenotes-sync` como a leitura crua o enxerga (só `pageId` e `state`). */
export interface SyncMetaEntry {
  pageId: string
  state: string
}

/**
 * Leitura crua dos metadados da sincronização (`axenotes-sync`), sem carregar o chunk do editor: o
 * "Sair" conta as páginas `dirty` e o logout acha os bancos de página mesmo sem `indexedDB.databases()`.
 * Não cria o banco se ele não existir; qualquer falha devolve lista vazia.
 */
export function readSyncMetaEntries(): Promise<SyncMetaEntry[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve([])
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(SYNC_META_DB)
    } catch {
      resolve([])
      return
    }
    // Banco inexistente: desfaz a criação em vez de deixar um banco vazio para trás.
    request.onupgradeneeded = () => {
      request.transaction?.abort()
    }
    request.onerror = () => {
      resolve([])
    }
    request.onblocked = () => {
      resolve([])
    }
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
        db.close()
        resolve([])
        return
      }
      const all = db.transaction(SYNC_META_STORE, 'readonly').objectStore(SYNC_META_STORE).getAll()
      all.onsuccess = () => {
        db.close()
        resolve(
          (all.result as unknown[]).flatMap((value) => {
            const entry = value as Partial<SyncMetaEntry>
            return typeof entry.pageId === 'string' && typeof entry.state === 'string'
              ? [{ pageId: entry.pageId, state: entry.state }]
              : []
          }),
        )
      }
      all.onerror = () => {
        db.close()
        resolve([])
      }
    }
  })
}
