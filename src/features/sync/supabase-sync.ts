import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import {
  ContentSyncError,
  supabasePageContentApi,
  type ContentRow,
  type PageContentApi,
} from '@/features/sync/api/page-content'
import type { ContentSync, ContentSyncSession, SyncStatus } from '@/features/sync/content-sync'
import { pageTextSnapshot, type TextBlock } from '@/features/sync/page-text'
import { indexedDbSyncMeta, type SyncMeta, type SyncMetaState } from '@/features/sync/sync-meta'

/** Origem dos updates que vieram do servidor: não voltam para a fila de envio. */
export const SERVER_ORIGIN = Symbol('axenotes-server')

export const SYNC_TIMING = {
  /** Envio depois de 1 s sem digitar, e no máximo 5 s depois da primeira edição pendente. */
  idleMs: 1000,
  maxWaitMs: 5000,
  /** Busca de edições de outros aparelhos enquanto a aba está visível e online. */
  pollMs: 20_000,
  /** Texto de busca/prévias depois de 5 s sem digitar. */
  textIdleMs: 5000,
  retryBaseMs: 1000,
  retryMaxMs: 60_000,
  /** Tentativas seguidas antes de parar e esperar um gatilho (rede, foco, nova edição). */
  maxAttempts: 8,
  /** Quanto o `stop()` espera o último envio. */
  stopFlushMs: 2000,
} as const

/** Limites do servidor (docs/adr/0001-conteudo-yjs.md). */
export const APPEND_MAX_BYTES = 1024 * 1024
export const SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
/** Compacta quando, desde o último snapshot, há mais que isto de updates vivos. */
export const COMPACT_MAX_UPDATES = 100
export const COMPACT_MAX_BYTES = 256 * 1024

/** Tudo que a sessão usa de fora; os testes trocam por fakes. */
export interface SyncEnvironment {
  api: PageContentApi
  meta: SyncMeta
  now: () => number
  isOnline: () => boolean
  isVisible: () => boolean
  /** `focus`, `online`, `offline` e `pagehide`. */
  windowTarget: EventTarget
  /** `visibilitychange`. */
  documentTarget: EventTarget
  /** Trabalho que pode esperar (compactação), sem travar a digitação. */
  scheduleIdle: (task: () => void) => void
  /** Só mensagens e erros, nunca conteúdo. */
  log: (message: string, error?: unknown) => void
}

const sessions = new Set<PageSyncSession>()

/** Sessões abertas nesta aba (logout, segundo plano). */
export function openSyncSessions(): readonly PageSyncSession[] {
  return [...sessions]
}

function sameStateVector(a: Uint8Array, b: Uint8Array): boolean {
  const left = Y.decodeStateVector(a)
  const right = Y.decodeStateVector(b)
  if (left.size !== right.size) return false
  for (const [client, clock] of left) if (right.get(client) !== clock) return false
  return true
}

/** Autoverificação do ADR: o snapshot, aplicado num doc novo, dá o mesmo state vector. */
export function snapshotMatches(snapshot: Uint8Array, stateVector: Uint8Array): boolean {
  const check = new Y.Doc()
  try {
    Y.applyUpdate(check, snapshot)
    return sameStateVector(Y.encodeStateVector(check), stateVector)
  } finally {
    check.destroy()
  }
}

/** O que o aparelho tem e o servidor (montado com `rows`) não tem; `null` se não falta nada. */
export function missingOnServer(doc: Y.Doc, rows: readonly ContentRow[]): Uint8Array | null {
  const server = new Y.Doc()
  try {
    if (rows.length > 0) Y.applyUpdate(server, Y.mergeUpdates(rows.map((row) => row.data)))
    const missing = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(server))
    return Y.snapshotContainsUpdate(Y.snapshot(server), missing) ? null : missing
  } finally {
    server.destroy()
  }
}

const errorKind = (error: unknown) => (error instanceof ContentSyncError ? error.kind : 'unknown')

type TimerName = 'send' | 'retry' | 'poll' | 'text'

export class PageSyncSession implements ContentSyncSession {
  private status: SyncStatus = 'saved'
  private readonly listeners = new Set<() => void>()
  private readonly savedListeners = new Set<() => void>()
  private readonly timers = new Map<TimerName, ReturnType<typeof setTimeout>>()

  /** Updates locais ainda não confirmados (em memória; o y-indexeddb já os guardou no aparelho). */
  private pending: Uint8Array[] = []
  private firstPendingAt: number | null = null
  private sending: Promise<void> | null = null
  private receiving: Promise<void> | null = null
  private reconciled = false
  private receiveFailed = false
  private compacting = false
  private attempts = 0

  /** Maior id lido do servidor (recarga incremental e `p_up_to` da compactação). */
  private lastId: number | null = null
  /** Ids que esta sessão gravou: já estão no doc, não precisam ser aplicados de novo. */
  private readonly ownIds = new Set<number>()
  private sinceSnapshot = { count: 0, bytes: 0 }

  private blocked = false
  private tooLarge = false
  private failing = false
  private offline = false
  private stopped = false
  private metaState: SyncMetaState | null = null

  private textSource: (() => readonly TextBlock[]) | null = null
  private lastTextKey: string | null = null

  constructor(
    readonly pageId: string,
    private readonly doc: Y.Doc,
    private canWrite: boolean,
    private readonly env: SyncEnvironment,
  ) {
    doc.on('update', this.onDocUpdate)
    env.windowTarget.addEventListener('focus', this.onFocus)
    env.windowTarget.addEventListener('online', this.onOnline)
    env.windowTarget.addEventListener('offline', this.onOffline)
    env.windowTarget.addEventListener('pagehide', this.onHide)
    env.documentTarget.addEventListener('visibilitychange', this.onVisibility)
    this.offline = !env.isOnline()
    const hasLocalContent = doc.store.clients.size > 0
    this.writeMeta(() => env.meta.markOpened(pageId, env.now(), { canWrite, hasLocalContent }))
    this.refreshStatus()
    void this.receive()
    this.schedulePoll()
  }

  // API pública ---------------------------------------------------------------------------------

  getStatus = (): SyncStatus => this.status

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  onSaved = (listener: () => void): (() => void) => {
    this.savedListeners.add(listener)
    return () => {
      this.savedListeners.delete(listener)
    }
  }

  setCanWrite = (canWrite: boolean): void => {
    if (canWrite === this.canWrite) return
    this.canWrite = canWrite
    if (canWrite) {
      // Confere de novo o que falta no servidor (pode ter sido editada antes de virar leitor).
      this.blocked = false
      this.reconciled = false
      void this.receive()
    } else {
      this.pending = []
      this.firstPendingAt = null
      this.clearTimer('send')
      this.clearTimer('retry')
    }
    this.refreshStatus()
  }

  setTextSource = (source: (() => readonly TextBlock[]) | null): void => {
    this.textSource = source
  }

  /** Há algo deste aparelho que o servidor ainda não confirmou? (Não conta página bloqueada.) */
  hasPending(): boolean {
    return !this.blocked && (this.pending.length > 0 || this.sending !== null)
  }

  /** Recebe o que falta e envia o pendente agora (logout, segundo plano). */
  async settle(): Promise<void> {
    await this.receive()
    this.attempts = 0
    await this.flush()
    await this.saveText()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    await withTimeout(
      Promise.all([this.flush(), this.saveText()]).then(() => undefined),
      SYNC_TIMING.stopFlushMs,
    )
    this.stopped = true
    for (const name of [...this.timers.keys()]) this.clearTimer(name)
    this.doc.off('update', this.onDocUpdate)
    this.env.windowTarget.removeEventListener('focus', this.onFocus)
    this.env.windowTarget.removeEventListener('online', this.onOnline)
    this.env.windowTarget.removeEventListener('offline', this.onOffline)
    this.env.windowTarget.removeEventListener('pagehide', this.onHide)
    this.env.documentTarget.removeEventListener('visibilitychange', this.onVisibility)
    this.listeners.clear()
    this.savedListeners.clear()
    sessions.delete(this)
  }

  // Envio ---------------------------------------------------------------------------------------

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === SERVER_ORIGIN || origin instanceof IndexeddbPersistence) return
    if (!this.canWrite || this.blocked || this.stopped) return
    this.enqueue(update)
    this.scheduleText()
  }

  private enqueue(update: Uint8Array): void {
    this.pending.push(update)
    this.firstPendingAt ??= this.env.now()
    this.setMetaState('dirty')
    // Uma edição nova é um gatilho: recomeça as tentativas depois de um erro persistente.
    if (this.tooLarge || this.attempts > SYNC_TIMING.maxAttempts) this.attempts = 0
    this.tooLarge = false
    this.scheduleSend()
    this.refreshStatus()
  }

  private scheduleSend(): void {
    if (this.stopped || this.firstPendingAt === null) return
    const untilMax = this.firstPendingAt + SYNC_TIMING.maxWaitMs - this.env.now()
    this.setTimer('send', Math.max(0, Math.min(SYNC_TIMING.idleMs, untilMax)), () => {
      void this.flush()
    })
  }

  /** Envia tudo que está na fila agora (espera um envio em andamento terminar antes). */
  async flush(): Promise<void> {
    this.clearTimer('send')
    while (this.sending) await this.sending
    if (this.pending.length === 0 || !this.canWrite || this.blocked) return
    const run = this.sendPending()
    this.sending = run
    this.refreshStatus()
    try {
      await run
    } finally {
      this.sending = null
      this.refreshStatus()
    }
  }

  private async sendPending(): Promise<void> {
    const batch = this.pending
    this.pending = []
    this.firstPendingAt = null
    const merged = batch.length === 1 && batch[0] ? batch[0] : Y.mergeUpdates(batch)
    try {
      if (merged.length > APPEND_MAX_BYTES) {
        // Um lote grande demais para o append vai como estado inteiro, pela compactação.
        await this.pushSnapshot()
      } else {
        const ids = await this.env.api.append(this.pageId, [merged])
        for (const id of ids) this.ownIds.add(id)
        this.sinceSnapshot.count += 1
        this.sinceSnapshot.bytes += merged.length
      }
      this.onSendSuccess()
    } catch (error) {
      await this.onSendError(error, merged)
    }
  }

  private async onSendError(error: unknown, merged: Uint8Array): Promise<void> {
    const kind = errorKind(error)
    if (kind === 'forbidden') {
      this.block()
      return
    }
    if (kind === 'too_large' || kind === 'batch_too_large' || kind === 'live_too_large') {
      try {
        await this.pushSnapshot()
        this.onSendSuccess()
        return
      } catch (snapshotError) {
        if (errorKind(snapshotError) === 'forbidden') {
          this.block()
          return
        }
        if (errorKind(snapshotError) === 'too_large') {
          this.requeue(merged)
          this.tooLarge = true
          this.env.log('Conteúdo da página grande demais para sincronizar')
          return
        }
        error = snapshotError
      }
    }
    this.requeue(merged)
    if (errorKind(error) === 'offline') this.offline = true
    else {
      this.failing = true
      this.env.log('Falha ao salvar o conteúdo da página', errorKind(error))
    }
    this.scheduleRetry()
  }

  private requeue(merged: Uint8Array): void {
    this.pending.unshift(merged)
    this.firstPendingAt ??= this.env.now()
  }

  private onSendSuccess(): void {
    this.attempts = 0
    this.failing = false
    this.offline = false
    this.tooLarge = false
    this.clearTimer('retry')
    if (this.pending.length === 0) this.setMetaState('clean')
    for (const listener of this.savedListeners) listener()
    this.maybeCompact()
  }

  private scheduleRetry(): void {
    this.attempts += 1
    if (this.attempts > SYNC_TIMING.maxAttempts) return
    const delay = Math.min(
      SYNC_TIMING.retryBaseMs * 2 ** (this.attempts - 1),
      SYNC_TIMING.retryMaxMs,
    )
    this.setTimer('retry', delay, () => {
      void this.flush()
    })
  }

  /** O servidor recusou (leitor, sem acesso, lixeira): para de enviar; o conteúdo fica no aparelho. */
  private block(): void {
    this.blocked = true
    this.pending = []
    this.firstPendingAt = null
    this.clearTimer('send')
    this.clearTimer('retry')
    this.clearTimer('text')
    this.setMetaState('blocked')
    this.refreshStatus()
  }

  // Recebimento ---------------------------------------------------------------------------------

  /**
   * Busca o que há de novo no servidor. Gatilhos simultâneos (foco, visibilidade, rede, polling)
   * entram na mesma busca. A primeira é completa e envia o que o servidor não tem (diff por state
   * vector): cobre o conteúdo do 2a e o que ficou offline em sessões anteriores.
   */
  receive(): Promise<void> {
    if (this.receiving) return this.receiving
    if (this.stopped) return Promise.resolve()
    const run = (this.reconciled ? this.pull(this.lastId) : this.reconcile())
      .then(() => {
        this.receiveFailed = false
        this.offline = false
      })
      .catch((error: unknown) => {
        this.receiveFailed = true
        if (errorKind(error) === 'offline') this.offline = true
        else this.env.log('Falha ao buscar o conteúdo da página', errorKind(error))
      })
      .finally(() => {
        this.receiving = null
        this.refreshStatus()
      })
    this.receiving = run
    return run
  }

  private async reconcile(): Promise<void> {
    const rows = await this.pull(null)
    this.reconciled = true
    if (!this.canWrite || this.blocked) return
    const missing = missingOnServer(this.doc, rows)
    if (missing) {
      this.enqueue(missing)
      this.scheduleText()
      void this.flush()
    } else if (this.pending.length === 0 && this.sending === null) {
      this.setMetaState('clean')
    }
  }

  /** Busca e aplica as linhas vivas (todas, ou só as de id maior que `after`). */
  private async pull(after: number | null): Promise<ContentRow[]> {
    const rows = await this.env.api.fetch(this.pageId, after)
    if (this.stopped) return rows
    if (after === null) this.sinceSnapshot = { count: 0, bytes: 0 }
    const fresh: ContentRow[] = []
    for (const row of rows) {
      this.lastId = Math.max(this.lastId ?? 0, row.id)
      if (this.ownIds.delete(row.id)) continue
      fresh.push(row)
      if (row.kind === 'snapshot') this.sinceSnapshot = { count: 0, bytes: 0 }
      else {
        this.sinceSnapshot.count += 1
        this.sinceSnapshot.bytes += row.byteSize
      }
    }
    if (fresh.length > 0) {
      Y.applyUpdate(this.doc, Y.mergeUpdates(fresh.map((row) => row.data)), SERVER_ORIGIN)
    }
    this.maybeCompact()
    return rows
  }

  private schedulePoll(): void {
    this.clearTimer('poll')
    if (this.stopped || !this.env.isVisible() || !this.env.isOnline()) return
    this.setTimer('poll', SYNC_TIMING.pollMs, () => {
      void this.receive().finally(() => {
        this.schedulePoll()
      })
    })
  }

  private readonly onFocus = (): void => {
    void this.receive()
    if (this.pending.length > 0 && !this.sending) {
      this.attempts = 0
      void this.flush()
    }
  }

  private readonly onOnline = (): void => {
    this.offline = false
    this.attempts = 0
    this.refreshStatus()
    void this.receive()
    void this.flush()
    this.schedulePoll()
  }

  private readonly onOffline = (): void => {
    this.offline = true
    this.schedulePoll()
    this.refreshStatus()
  }

  private readonly onVisibility = (): void => {
    if (this.env.isVisible()) {
      void this.receive()
    } else {
      this.onHide()
    }
    this.schedulePoll()
  }

  /** Aba oculta ou fechando: envia na hora (se morrer antes, o conteúdo está no aparelho). */
  private readonly onHide = (): void => {
    void this.flush()
    void this.saveText()
  }

  // Compactação ---------------------------------------------------------------------------------

  private maybeCompact(): void {
    if (!this.canWrite || this.blocked || this.compacting || this.stopped) return
    const { count, bytes } = this.sinceSnapshot
    if (count <= COMPACT_MAX_UPDATES && bytes <= COMPACT_MAX_BYTES) return
    this.compacting = true
    this.env.scheduleIdle(() => {
      void this.pushSnapshot()
        .catch((error: unknown) => {
          if (errorKind(error) === 'forbidden') this.block()
          else this.env.log('Compactação não concluída', errorKind(error))
        })
        .finally(() => {
          this.compacting = false
        })
    })
  }

  /**
   * Grava o estado inteiro do doc como snapshot cobrindo o maior id lido. O doc contém todas as linhas
   * até lá (e talvez edições locais ainda não enviadas, o que é inofensivo: o merge é idempotente).
   * `false` do servidor = outro aparelho já compactou; busca de novo e tenta com o id novo.
   */
  private async pushSnapshot(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.receive()
      if (this.receiveFailed) throw new ContentSyncError(this.offline ? 'offline' : 'unknown')
      const snapshot = Y.encodeStateAsUpdate(this.doc)
      if (snapshot.length > SNAPSHOT_MAX_BYTES) throw new ContentSyncError('too_large')
      if (!snapshotMatches(snapshot, Y.encodeStateVector(this.doc))) {
        this.env.log('Autoverificação do snapshot falhou; compactação cancelada')
        throw new ContentSyncError('invalid')
      }
      if (await this.env.api.compact(this.pageId, snapshot, this.lastId ?? 0)) {
        this.sinceSnapshot = { count: 0, bytes: 0 }
        return
      }
    }
    throw new ContentSyncError('unknown')
  }

  // Texto para busca e prévias ------------------------------------------------------------------

  private scheduleText(): void {
    if (!this.canWrite || this.blocked || this.stopped) return
    this.setTimer('text', SYNC_TIMING.textIdleMs, () => {
      void this.saveText()
    })
  }

  private async saveText(): Promise<void> {
    this.clearTimer('text')
    if (!this.canWrite || this.blocked || !this.textSource) return
    const snapshot = pageTextSnapshot(this.textSource())
    const key = `${snapshot.text}\u0000${JSON.stringify(snapshot.json)}`
    if (key === this.lastTextKey) return
    try {
      await this.env.api.setText(this.pageId, snapshot.text, snapshot.json)
      this.lastTextKey = key
    } catch (error) {
      // Tenta de novo na próxima edição ou ao ocultar a aba.
      if (errorKind(error) !== 'offline') {
        this.env.log('Falha ao salvar o texto da página', errorKind(error))
      }
    }
  }

  // Estado --------------------------------------------------------------------------------------

  private refreshStatus(): void {
    const next: SyncStatus = this.blocked
      ? 'blocked'
      : !this.canWrite
        ? 'readonly'
        : this.tooLarge
          ? 'tooLarge'
          : this.offline || !this.env.isOnline()
            ? 'offline'
            : this.failing
              ? 'error'
              : this.pending.length > 0 || this.sending
                ? 'saving'
                : 'saved'
    if (next === this.status) return
    this.status = next
    for (const listener of this.listeners) listener()
  }

  private setMetaState(state: SyncMetaState): void {
    if (state === this.metaState) return
    this.metaState = state
    this.writeMeta(() => this.env.meta.setState(this.pageId, state, this.env.now()))
  }

  private writeMeta(task: () => Promise<void>): void {
    task().catch((error: unknown) => {
      this.env.log('Falha ao gravar os metadados da sincronização', error)
    })
  }

  private setTimer(name: TimerName, ms: number, task: () => void): void {
    this.clearTimer(name)
    if (this.stopped) return
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name)
        task()
      }, ms),
    )
  }

  private clearTimer(name: TimerName): void {
    const timer = this.timers.get(name)
    if (timer !== undefined) clearTimeout(timer)
    this.timers.delete(name)
  }
}

function withTimeout(task: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    void task.finally(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/** `ContentSync` com o ambiente dado (o ambiente é criado na primeira sessão, não no import). */
export function createContentSync(environment: () => SyncEnvironment): ContentSync {
  let env: SyncEnvironment | null = null
  return {
    start: (pageId, doc, { canWrite }) => {
      env ??= environment()
      const session = new PageSyncSession(pageId, doc, canWrite, env)
      sessions.add(session)
      return session
    },
  }
}

function browserEnvironment(): SyncEnvironment {
  return {
    api: supabasePageContentApi,
    meta: indexedDbSyncMeta,
    now: () => Date.now(),
    isOnline: () => navigator.onLine,
    isVisible: () => document.visibilityState === 'visible',
    windowTarget: window,
    documentTarget: document,
    scheduleIdle: (task) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(task, { timeout: 2000 })
      } else {
        setTimeout(task, 200)
      }
    },
    log: (message, error) => {
      console.warn(message, error)
    },
  }
}

/** Sincronização do conteúdo com o Supabase (RPCs de `page_contents`). */
export const supabaseSync: ContentSync = createContentSync(browserEnvironment)
