// Y.Doc de uma página + seu banco IndexedDB (`axenotes-page-<id>`, y-indexeddb). Se o IndexedDB falhar,
// o doc segue só em memória. Depois de carregar o aparelho, inicia o `ContentSync` (o envio ao
// servidor fica em supabase-sync.ts). Ver docs/CODEMAP.md §3.11.
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import type {
  ContentSync,
  ContentSyncOptions,
  ContentSyncSession,
} from '@/features/sync/content-sync'
import { supabaseSync } from '@/features/sync/supabase-sync'
import { pageDbName, rememberOpenedDatabase } from '@/lib/idb-names'
import { onBeforeStorageClear } from '@/lib/reset-client-state'

/** Fragmento do Y.Doc onde o BlockNote grava os blocos (o mesmo nome da documentação do BlockNote). */
const PAGE_FRAGMENT = 'document-store'

/** Abrir e carregar o banco da página não pode prender a tela: depois disso, só memória. */
export const LOCAL_LOAD_TIMEOUT_MS = 8000

/** `local` = salvo no IndexedDB do aparelho; `memory` = o IndexedDB falhou e nada fica no aparelho (o servidor ainda recebe). */
export type PageDocStorage = 'local' | 'memory'

/** Y.Doc de uma página aberta, com o banco local e a sessão de sincronização. */
export interface PageDoc {
  pageId: string
  doc: Y.Doc
  fragment: Y.XmlFragment
  /** Resolve depois de carregar o conteúdo do aparelho, ou ao cair para memória. Nunca rejeita. */
  ready: Promise<PageDocStorage>
  /** Sincronização com o servidor; existe a partir de `ready` (null depois de fechado). */
  readonly session: ContentSyncSession | null
  /** Fecha o banco e destrói o Y.Doc. Pode ser chamado mais de uma vez. */
  destroy: () => Promise<void>
}

const openDocs = new Set<PageDoc>()

// No logout, fecha os docs abertos antes de apagar os bancos (conexão aberta bloqueia o delete).
onBeforeStorageClear(async () => {
  await Promise.all([...openDocs].map((pageDoc) => pageDoc.destroy()))
})

/**
 * Y.Doc de uma página, persistido num banco IndexedDB só dela (`axenotes-page-<id>`) e sincronizado
 * com o servidor por `sync` depois de carregar o que está no aparelho. Se o IndexedDB não existir,
 * falhar (modo privado, cota, erro do navegador) ou não responder a tempo, o doc segue só em memória
 * (e ainda sincroniza): o editor avisa, mas nunca vira tela de erro.
 */
export function openPageDoc(
  pageId: string,
  sync: ContentSync = supabaseSync,
  options: ContentSyncOptions = { canWrite: false },
): PageDoc {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(PAGE_FRAGMENT)
  let persistence: IndexeddbPersistence | null = null
  let destroyed = false
  /** Caiu para memória (ou foi fechado): um banco que abra atrasado não pode mais se ligar ao doc. */
  let gaveUp = false
  let session: ContentSyncSession | null = null

  const ready = withTimeout(
    loadFromDevice(
      pageId,
      doc,
      () => gaveUp || destroyed,
      (started) => {
        persistence = started
      },
    ),
    LOCAL_LOAD_TIMEOUT_MS,
  )
    .then((): PageDocStorage => 'local')
    .catch((): PageDocStorage => {
      gaveUp = true
      const failed = persistence
      persistence = null
      void failed?.destroy().catch(() => undefined)
      return 'memory'
    })
    .then((storage) => {
      if (!destroyed) session = sync.start(pageId, doc, options)
      return storage
    })

  const pageDoc: PageDoc = {
    pageId,
    doc,
    fragment,
    ready,
    get session() {
      return destroyed ? null : session
    },
    destroy: async () => {
      if (destroyed) return
      destroyed = true
      openDocs.delete(pageDoc)
      const current = session
      session = null
      await current?.stop()
      const local = persistence
      persistence = null
      // `db.close()` espera as gravações em andamento terminarem.
      await local?.destroy().catch(() => undefined)
      doc.destroy()
    },
  }
  openDocs.add(pageDoc)
  return pageDoc
}

/** Quantos docs estão abertos agora (para testes de vazamento). */
export function openPageDocCount(): number {
  return openDocs.size
}

/**
 * Abre o banco antes de entregá-lo ao y-indexeddb: o y-indexeddb não trata a falha ao abrir (vira
 * "unhandled rejection" e `whenSynced` nunca resolve). A abertura de teste cria as mesmas stores que o
 * y-indexeddb 9 cria (`updates` com chave automática e `custom`), então ele abre o banco já pronto.
 */
async function loadFromDevice(
  pageId: string,
  doc: Y.Doc,
  stopped: () => boolean,
  onStarted: (persistence: IndexeddbPersistence) => void,
): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('no_indexeddb')
  const name = pageDbName(pageId)
  await prepareDatabase(name)
  rememberOpenedDatabase(name)
  if (stopped()) return
  const persistence = new IndexeddbPersistence(name, doc)
  onStarted(persistence)
  await persistence.whenSynced
}

function prepareDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('updates')) {
        db.createObjectStore('updates', { autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('custom')) db.createObjectStore('custom')
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('indexeddb_open_failed'))
    }
    request.onblocked = () => {
      reject(new Error('indexeddb_blocked'))
    }
  })
}

function withTimeout(task: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('indexeddb_timeout'))
    }, ms)
    task.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('indexeddb_failed'))
      },
    )
  })
}
