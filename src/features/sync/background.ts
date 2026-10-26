// Manutenção do sync em segundo plano (uma vez por aba): reenvia páginas `dirty` já fechadas, registra
// bancos antigos sem metadados e despeja os que não abrem há 30 dias. Também registra o envio do
// "Sair" (`registerPendingContentFlusher`). Ver docs/CODEMAP.md §3.12 e §3.4.
import { currentSessionUserId } from '@/features/auth/api/auth'
import { openPageDoc } from '@/features/sync/page-doc'
import { openSyncSessions, PageSyncSession, supabaseSync } from '@/features/sync/supabase-sync'
import { indexedDbSyncMeta, type SyncMeta } from '@/features/sync/sync-meta'
import { pageDbName, pageIdFromDbName } from '@/lib/idb-names'
import { readLocalDataOwner } from '@/lib/local-data-owner'
import { registerPendingContentFlusher } from '@/lib/pending-content'

/** Banco de página sem abrir há mais que isto (e sem nada pendente) é apagado do aparelho. */
export const EVICT_AFTER_MS = 30 * 24 * 60 * 60 * 1000
/** Quantas páginas fechadas uma rodada em segundo plano reenvia (uma por vez). */
const RESYNC_BATCH = 10

/** Tudo que a manutenção em segundo plano usa de fora; os testes trocam por fakes. */
export interface BackgroundDeps {
  meta: SyncMeta
  now: () => number
  /** Abre a página sem editor, recebe/envia o que falta e fecha. */
  resyncPage: (pageId: string) => Promise<void>
  /** Nomes dos bancos IndexedDB da origem; `null` se o navegador não lista. */
  databaseNames: () => Promise<string[] | null>
  deleteDatabase: (name: string) => Promise<boolean>
  openPageIds: () => ReadonlySet<string>
  /** Usuário da sessão do Supabase: o dono do JWT com que o envio sairia. */
  sessionUserId: () => Promise<string | null>
  /** Dono gravado dos dados locais (src/lib/local-data-owner.ts). */
  localDataOwner: () => string | null
  log: (message: string, error?: unknown) => void
}

/**
 * Os registros locais são do usuário da sessão? Se não (dono desconhecido, outra conta ou sem
 * sessão), nada deles é enviado nem contado: sairia com o JWT de quem não os escreveu.
 */
async function ownsLocalData(deps: BackgroundDeps): Promise<boolean> {
  const owner = deps.localDataOwner()
  return owner !== null && owner === (await deps.sessionUserId())
}

/**
 * Páginas `dirty` que não estão abertas nesta aba: abre cada uma, envia o que o servidor não tem e
 * fecha. As `blocked` ficam de fora (não entram em loop). Só envia se os dados locais são do usuário
 * da sessão, conferido antes de cada página (a sessão pode trocar no meio da rodada).
 */
export async function resyncClosedPages(deps: BackgroundDeps, limit = RESYNC_BATCH): Promise<void> {
  if (!(await ownsLocalData(deps))) return
  const open = deps.openPageIds()
  const dirty = (await deps.meta.list()).filter(
    (record) => record.state === 'dirty' && !open.has(record.pageId),
  )
  for (const record of dirty.slice(0, limit)) {
    if (!(await ownsLocalData(deps))) return
    try {
      await deps.resyncPage(record.pageId)
    } catch (error) {
      deps.log('Falha ao sincronizar uma página em segundo plano', error)
    }
  }
}

/**
 * Bancos `axenotes-page-*` sem registro (criados no 2a, antes dos metadados) entram como `dirty`:
 * passam primeiro pelo reenvio e nunca são despejados antes de sincronizar.
 */
export async function registerUnknownPageDatabases(deps: BackgroundDeps): Promise<void> {
  const names = await deps.databaseNames()
  if (!names) return
  const known = new Set((await deps.meta.list()).map((record) => record.pageId))
  for (const name of names) {
    const pageId = pageIdFromDbName(name)
    if (pageId === null || known.has(pageId)) continue
    await deps.meta.markOpened(pageId, deps.now(), { canWrite: true, hasLocalContent: true })
  }
}

/**
 * Despejo: apaga o banco das páginas não abertas há mais de 30 dias e sem nada pendente (`clean` ou
 * `blocked`). Com o servidor como fonte de verdade, elas voltam do servidor ao abrir de novo.
 */
export async function evictStalePages(deps: BackgroundDeps): Promise<void> {
  const open = deps.openPageIds()
  const limit = deps.now() - EVICT_AFTER_MS
  for (const record of await deps.meta.list()) {
    if (record.state === 'dirty' || record.lastOpenedAt >= limit || open.has(record.pageId)) {
      continue
    }
    if (await deps.deleteDatabase(pageDbName(record.pageId))) {
      await deps.meta.forget(record.pageId)
    }
  }
}

/**
 * Quantas páginas ainda têm algo sem sincronizar: as abertas aqui e as marcadas `dirty` em qualquer
 * aba, estas só se os dados locais são do usuário da sessão.
 */
export async function countPendingPages(deps: BackgroundDeps): Promise<number> {
  const pending = new Set(
    openSyncSessions()
      .filter((session) => session.hasPending())
      .map((session) => session.pageId),
  )
  try {
    if (!(await ownsLocalData(deps))) return pending.size
    for (const record of await deps.meta.list()) {
      if (record.state === 'dirty') pending.add(record.pageId)
    }
  } catch (error) {
    deps.log('Falha ao ler os metadados da sincronização', error)
  }
  return pending.size
}

/** Logout: envia o pendente das páginas abertas e das fechadas, até `timeoutMs`; devolve o que sobrou. */
async function flushAllPendingContent(deps: BackgroundDeps, timeoutMs: number): Promise<number> {
  const work = (async () => {
    await Promise.all(
      openSyncSessions().map((session) =>
        session.settle().catch((error: unknown) => {
          deps.log('Falha ao enviar o conteúdo pendente', error)
        }),
      ),
    )
    await resyncClosedPages(deps, Number.POSITIVE_INFINITY)
  })()
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    void work.finally(() => {
      clearTimeout(timer)
      resolve()
    })
  })
  return countPendingPages(deps)
}

async function resyncPage(pageId: string): Promise<void> {
  const pageDoc = openPageDoc(pageId, supabaseSync, { canWrite: true })
  try {
    await pageDoc.ready
    const session = pageDoc.session
    if (session instanceof PageSyncSession) await session.settle()
  } finally {
    await pageDoc.destroy()
  }
}

function deleteDatabase(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => {
      resolve(true)
    }
    // Aberto em outra aba: fica para a próxima rodada (o registro continua).
    request.onblocked = () => {
      resolve(false)
    }
    request.onerror = () => {
      resolve(false)
    }
  })
}

const browserDeps: BackgroundDeps = {
  meta: indexedDbSyncMeta,
  now: () => Date.now(),
  resyncPage,
  databaseNames: async () =>
    typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).flatMap((info) => (info.name ? [info.name] : []))
      : null,
  deleteDatabase,
  openPageIds: () => new Set(openSyncSessions().map((session) => session.pageId)),
  sessionUserId: currentSessionUserId,
  localDataOwner: readLocalDataOwner,
  log: (message, error) => {
    console.warn(message, error)
  },
}

let running: Promise<void> | null = null

/** Uma rodada por vez: registra bancos antigos, reenvia as páginas sujas e despeja as velhas. */
function runMaintenance(): Promise<void> {
  running ??= (async () => {
    await registerUnknownPageDatabases(browserDeps)
    await resyncClosedPages(browserDeps)
    await evictStalePages(browserDeps)
  })()
    .catch((error: unknown) => {
      browserDeps.log('Falha na manutenção da sincronização', error)
    })
    .finally(() => {
      running = null
    })
  return running
}

let started = false

/** Liga a manutenção em segundo plano (uma vez por aba), em tempo ocioso e ao voltar a rede. */
export function startBackgroundSync(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const run = () => {
    void runMaintenance()
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 10_000 })
  else setTimeout(run, 2000)
  window.addEventListener('online', run)
}

registerPendingContentFlusher((timeoutMs) => flushAllPendingContent(browserDeps, timeoutMs))
