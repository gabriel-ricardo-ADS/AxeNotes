import { SYNC_META_DB, SYNC_META_STORE } from '@/lib/idb-names'

/**
 * Metadados da sincronização por página, num banco IndexedDB de nome fixo (`axenotes-sync`,
 * registrado em `KNOWN_IDB_DATABASES`). Compartilhado entre as abas: o "Sair" de uma aba enxerga o
 * pendente das outras. Estados:
 * - `clean`: o servidor tem tudo o que o aparelho tem;
 * - `dirty`: há edição local ainda não confirmada pelo servidor (o conteúdo está no banco da página);
 * - `blocked`: o servidor recusou (leitor, sem acesso ou lixeira). Não conta como pendente, não é
 *   reenviada em segundo plano e volta a `dirty` quando a página abre de novo com permissão de escrita.
 */
const STORE = SYNC_META_STORE

export type SyncMetaState = 'clean' | 'dirty' | 'blocked'

export interface SyncMetaRecord {
  pageId: string
  /** Epoch ms da última abertura neste aparelho (base do despejo de 30 dias). */
  lastOpenedAt: number
  state: SyncMetaState
}

export interface OpeningInfo {
  canWrite: boolean
  hasLocalContent: boolean
}

/** Estado do registro ao abrir a página (regra de `markOpened`). */
export function stateOnOpen(
  current: SyncMetaState | undefined,
  { canWrite, hasLocalContent }: OpeningInfo,
): SyncMetaState {
  if (current === undefined) return hasLocalContent ? 'dirty' : 'clean'
  if (current === 'blocked' && canWrite) return 'dirty'
  return current
}

export interface SyncMeta {
  /**
   * Anota a abertura. Página sem registro entra `dirty` se já tem conteúdo no aparelho (ex.: do 2a),
   * senão `clean`; página `blocked` aberta com permissão de escrita volta a `dirty`.
   */
  markOpened: (pageId: string, now: number, opening: OpeningInfo) => Promise<void>
  setState: (pageId: string, state: SyncMetaState, now: number) => Promise<void>
  list: () => Promise<SyncMetaRecord[]>
  forget: (pageId: string) => Promise<void>
}

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no_indexeddb'))
      return
    }
    const request = indexedDB.open(SYNC_META_DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'pageId' })
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('sync_meta_open_failed'))
    }
    request.onblocked = () => {
      reject(new Error('sync_meta_blocked'))
    }
  })
}

/** Abre, roda uma transação e fecha (conexão aberta bloquearia o `deleteDatabase` do logout). */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest | undefined,
  read?: (request: IDBRequest) => T,
): Promise<T | undefined> {
  const db = await openMetaDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => {
        resolve(request && read ? read(request) : undefined)
      }
      tx.onerror = () => {
        reject(tx.error ?? new Error('sync_meta_failed'))
      }
      tx.onabort = () => {
        reject(tx.error ?? new Error('sync_meta_aborted'))
      }
    })
  } finally {
    db.close()
  }
}

function isRecord(value: unknown): value is SyncMetaRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.pageId === 'string' &&
    typeof record.lastOpenedAt === 'number' &&
    (record.state === 'clean' || record.state === 'dirty' || record.state === 'blocked')
  )
}

/** Lê, transforma e grava um registro na mesma transação. */
function update(
  pageId: string,
  change: (current: SyncMetaRecord | undefined) => SyncMetaRecord,
): Promise<void> {
  return withStore('readwrite', (store) => {
    const request = store.get(pageId)
    request.onsuccess = () => {
      const current: unknown = request.result
      store.put(change(isRecord(current) ? current : undefined))
    }
    return undefined
  }).then(() => undefined)
}

/** As gravações de uma mesma página saem na ordem em que foram pedidas. */
const chains = new Map<string, Promise<void>>()

function serialized(pageId: string, task: () => Promise<void>): Promise<void> {
  const next = (chains.get(pageId) ?? Promise.resolve()).then(task, task)
  const settled = next.catch(() => undefined)
  chains.set(pageId, settled)
  void settled.then(() => {
    if (chains.get(pageId) === settled) chains.delete(pageId)
  })
  return next
}

export const indexedDbSyncMeta: SyncMeta = {
  markOpened: (pageId, now, opening) =>
    serialized(pageId, () =>
      update(pageId, (current) => ({
        pageId,
        lastOpenedAt: now,
        state: stateOnOpen(current?.state, opening),
      })),
    ),
  setState: (pageId, state, now) =>
    serialized(pageId, () =>
      update(pageId, (current) => ({ pageId, lastOpenedAt: current?.lastOpenedAt ?? now, state })),
    ),
  list: async () => {
    // Espera as gravações já pedidas (ex.: o `clean` do último envio) para não ler um estado velho.
    await Promise.all([...chains.values()])
    const rows = await withStore(
      'readonly',
      (store) => store.getAll(),
      (request) => request.result as unknown[],
    )
    return (rows ?? []).filter(isRecord)
  },
  forget: (pageId) =>
    serialized(pageId, () =>
      withStore('readwrite', (store) => {
        store.delete(pageId)
        return undefined
      }).then(() => undefined),
    ),
}
