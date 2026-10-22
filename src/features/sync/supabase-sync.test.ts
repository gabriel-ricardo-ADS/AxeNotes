import * as Y from 'yjs'
import {
  ContentSyncError,
  type ContentErrorKind,
  type ContentRow,
  type PageContentApi,
} from '@/features/sync/api/page-content'
import type { TextBlock } from '@/features/sync/page-text'
import {
  APPEND_MAX_BYTES,
  COMPACT_MAX_BYTES,
  COMPACT_MAX_UPDATES,
  createContentSync,
  missingOnServer,
  type PageSyncSession,
  SERVER_ORIGIN,
  snapshotMatches,
  SYNC_TIMING,
  type SyncEnvironment,
} from '@/features/sync/supabase-sync'
import { stateOnOpen, type SyncMeta, type SyncMetaRecord } from '@/features/sync/sync-meta'

const PAGE = '00000000-0000-4000-8000-0000000000aa'

type Method = 'fetch' | 'append' | 'compact' | 'setText'

/** Servidor em memória com a semântica das RPCs (linhas vivas, ids crescentes, compactação). */
class FakeServer {
  rows: (ContentRow & { live: boolean })[] = []
  private seq = 0
  private readonly failNext: { method: Method; kind: ContentErrorKind }[] = []
  readonly failAlways = new Map<Method, ContentErrorKind>()
  /** Segura o próximo fetch até `release()`. */
  fetchGate: Promise<void> | null = null
  texts: { text: string; json: unknown }[] = []

  fail(method: Method, kind: ContentErrorKind) {
    this.failNext.push({ method, kind })
  }

  private check(method: Method) {
    const always = this.failAlways.get(method)
    if (always) throw new ContentSyncError(always)
    const index = this.failNext.findIndex((entry) => entry.method === method)
    if (index >= 0) {
      const [entry] = this.failNext.splice(index, 1)
      if (entry) throw new ContentSyncError(entry.kind)
    }
  }

  /** Update gravado por "outro aparelho". */
  push(data: Uint8Array, kind: 'update' | 'snapshot' = 'update', coversUpTo: number | null = null) {
    this.seq += 1
    this.rows.push({ id: this.seq, kind, data, coversUpTo, byteSize: data.length, live: true })
    return this.seq
  }

  /** O doc que o servidor reconstrói com as linhas vivas. */
  doc(): Y.Doc {
    const doc = new Y.Doc()
    for (const row of this.rows) if (row.live) Y.applyUpdate(doc, row.data)
    return doc
  }

  api: PageContentApi = {
    fetch: vi.fn(async (_pageId: string, after: number | null) => {
      if (this.fetchGate) await this.fetchGate
      this.check('fetch')
      return this.rows
        .filter((row) => row.live && (after === null || row.id > after))
        .map((row) => ({
          id: row.id,
          kind: row.kind,
          data: row.data,
          coversUpTo: row.coversUpTo,
          byteSize: row.byteSize,
        }))
    }),
    append: vi.fn((_pageId: string, updates: Uint8Array[]) => {
      this.check('append')
      return Promise.resolve(updates.map((update) => this.push(update)))
    }),
    compact: vi.fn((_pageId: string, snapshot: Uint8Array, upTo: number) => {
      this.check('compact')
      const covered = this.rows.some(
        (row) => row.live && row.kind === 'snapshot' && (row.coversUpTo ?? -1) >= upTo,
      )
      if (covered) return Promise.resolve(false)
      for (const row of this.rows) if (row.live && row.id <= upTo) row.live = false
      this.push(snapshot, 'snapshot', upTo)
      return Promise.resolve(true)
    }),
    setText: vi.fn((_pageId: string, text: string, json: unknown) => {
      this.check('setText')
      this.texts.push({ text, json })
      return Promise.resolve()
    }),
  }
}

class FakeMeta implements SyncMeta {
  records = new Map<string, SyncMetaRecord>()
  markOpened: SyncMeta['markOpened'] = (pageId, now, opening) => {
    const current = this.records.get(pageId)
    this.records.set(pageId, {
      pageId,
      lastOpenedAt: now,
      state: stateOnOpen(current?.state, opening),
    })
    return Promise.resolve()
  }
  setState: SyncMeta['setState'] = (pageId, state, now) => {
    const current = this.records.get(pageId)
    this.records.set(pageId, { pageId, lastOpenedAt: current?.lastOpenedAt ?? now, state })
    return Promise.resolve()
  }
  list = () => Promise.resolve([...this.records.values()])
  forget = (pageId: string) => {
    this.records.delete(pageId)
    return Promise.resolve()
  }
  state = (pageId = PAGE) => this.records.get(pageId)?.state
}

interface Setup {
  server: FakeServer
  meta: FakeMeta
  doc: Y.Doc
  session: PageSyncSession
  env: SyncEnvironment & { online: boolean; visible: boolean }
}

let sessions: PageSyncSession[] = []

function setup(
  options: {
    canWrite?: boolean
    online?: boolean
    server?: FakeServer
    meta?: FakeMeta
    local?: (doc: Y.Doc) => void
  } = {},
): Setup {
  const server = options.server ?? new FakeServer()
  const meta = options.meta ?? new FakeMeta()
  const doc = new Y.Doc()
  options.local?.(doc)
  const env = {
    online: options.online ?? true,
    visible: true,
    api: server.api,
    meta,
    now: () => Date.now(),
    isOnline: () => env.online,
    isVisible: () => env.visible,
    windowTarget: new EventTarget(),
    documentTarget: new EventTarget(),
    scheduleIdle: (task: () => void) => {
      setTimeout(task, 0)
    },
    log: vi.fn(),
  }
  const session = createContentSync(() => env).start(PAGE, doc, {
    canWrite: options.canWrite ?? true,
  }) as PageSyncSession
  sessions.push(session)
  return { server, meta, doc, session, env }
}

/** Uma edição local (como o editor faria): origem nula. */
const type = (doc: Y.Doc, text: string) => {
  doc.getText('t').insert(doc.getText('t').length, text)
}

const textOf = (doc: Y.Doc) => doc.getText('t').toJSON()

function updateWith(text: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getText('t').insert(0, text)
  return Y.encodeStateAsUpdate(doc)
}

const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(sessions.map((session) => session.stop()))
  sessions = []
})

describe('envio: fila com debounce e lote', () => {
  it('espera 1 s sem digitar e envia as edições juntas numa chamada', async () => {
    const { server, doc, session } = setup()
    await settle()
    type(doc, 'a')
    await vi.advanceTimersByTimeAsync(300)
    type(doc, 'b')
    await vi.advanceTimersByTimeAsync(300)
    type(doc, 'c')
    expect(session.getStatus()).toBe('saving')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs - 1)
    expect(server.api.append).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(server.api.append).toHaveBeenCalledTimes(1)
    expect(vi.mocked(server.api.append).mock.calls[0]?.[1]).toHaveLength(1)
    expect(textOf(server.doc())).toBe('abc')
    expect(session.getStatus()).toBe('saved')
  })

  it('digitando sem parar, envia no máximo 5 s depois da primeira edição', async () => {
    const { server, doc } = setup()
    await settle()
    for (let elapsed = 0; elapsed < 4900; elapsed += 700) {
      type(doc, 'x')
      await vi.advanceTimersByTimeAsync(700)
    }
    expect(server.api.append).not.toHaveBeenCalled()
    type(doc, 'y')
    await vi.advanceTimersByTimeAsync(200)
    expect(server.api.append).toHaveBeenCalledTimes(1)
  })

  it('marca a página como dirty ao editar e clean depois da confirmação', async () => {
    const { meta, doc } = setup()
    await settle()
    type(doc, 'a')
    await settle()
    expect(meta.state()).toBe('dirty')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(meta.state()).toBe('clean')
  })

  it('avisa cada envio confirmado (para o "Editada há…")', async () => {
    const { doc, session } = setup()
    const saved = vi.fn()
    session.onSaved(saved)
    await settle()
    type(doc, 'a')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(saved).toHaveBeenCalledTimes(1)
  })
})

describe('envio: falhas', () => {
  it('tenta de novo com espera exponencial e volta a "Salvo"', async () => {
    const { server, doc, session } = setup()
    await settle()
    server.fail('append', 'unknown')
    server.fail('append', 'unknown')
    type(doc, 'a')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(server.api.append).toHaveBeenCalledTimes(1)
    expect(session.getStatus()).toBe('error')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.retryBaseMs)
    expect(server.api.append).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.retryBaseMs * 2 - 1)
    expect(server.api.append).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(server.api.append).toHaveBeenCalledTimes(3)
    expect(session.getStatus()).toBe('saved')
    expect(textOf(server.doc())).toBe('a')
  })

  it('para depois do limite de tentativas e recomeça com uma edição nova', async () => {
    const { server, doc, session } = setup()
    await settle()
    server.failAlways.set('append', 'unknown')
    type(doc, 'a')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(server.api.append).toHaveBeenCalledTimes(SYNC_TIMING.maxAttempts + 1)
    expect(session.getStatus()).toBe('error')

    server.failAlways.clear()
    type(doc, 'b')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(session.getStatus()).toBe('saved')
    expect(textOf(server.doc())).toBe('ab')
  })

  it('sem rede fica "Offline" e envia ao reconectar', async () => {
    const { server, doc, session, env } = setup()
    await settle()
    env.online = false
    env.windowTarget.dispatchEvent(new Event('offline'))
    server.failAlways.set('append', 'offline')
    type(doc, 'offline')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(session.getStatus()).toBe('offline')

    server.failAlways.clear()
    env.online = true
    env.windowTarget.dispatchEvent(new Event('online'))
    await settle()
    expect(session.getStatus()).toBe('saved')
    expect(textOf(server.doc())).toBe('offline')
  })

  it('recusa por permissão (lixeira, papel perdido) vira blocked: não tenta de novo', async () => {
    const { server, meta, doc, session } = setup()
    await settle()
    server.failAlways.set('append', 'forbidden')
    type(doc, 'a')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(server.api.append).toHaveBeenCalledTimes(1)
    expect(session.getStatus()).toBe('blocked')
    expect(meta.state()).toBe('blocked')
    expect(session.hasPending()).toBe(false)
    // Edições depois disso não vão para a fila.
    type(doc, 'b')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.maxWaitMs)
    expect(server.api.append).toHaveBeenCalledTimes(1)
  })

  it('página acima do teto (live_too_large) compacta e o conteúdo chega', async () => {
    const { server, doc, session } = setup()
    await settle()
    server.fail('append', 'live_too_large')
    type(doc, 'grande')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(server.api.compact).toHaveBeenCalledTimes(1)
    expect(session.getStatus()).toBe('saved')
    expect(textOf(server.doc())).toBe('grande')
  })

  it('lote acima de 1 MiB vai como estado inteiro pela compactação', async () => {
    const { server, doc } = setup()
    await settle()
    type(doc, 'x'.repeat(APPEND_MAX_BYTES + 10))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(server.api.append).not.toHaveBeenCalled()
    expect(server.api.compact).toHaveBeenCalledWith(PAGE, expect.any(Uint8Array), 0)
    expect(textOf(server.doc())).toHaveLength(APPEND_MAX_BYTES + 10)
  })

  it('documento acima de 8 MiB fica "grande demais" e o conteúdo continua no aparelho', async () => {
    const { server, doc, session } = setup()
    await settle()
    type(doc, 'x'.repeat(8 * 1024 * 1024 + 10))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(server.api.compact).not.toHaveBeenCalled()
    expect(session.getStatus()).toBe('tooLarge')
    expect(session.hasPending()).toBe(true)
  })
})

describe('abrir: recebe e envia o que falta', () => {
  it('aplica o conteúdo do servidor sem reenviá-lo', async () => {
    const server = new FakeServer()
    server.push(updateWith('do outro aparelho'))
    const { doc, session } = setup({ server })
    await settle()
    expect(textOf(doc)).toBe('do outro aparelho')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.maxWaitMs)
    expect(server.api.append).not.toHaveBeenCalled()
    expect(session.getStatus()).toBe('saved')
  })

  it('envia o conteúdo local que o servidor não tem (página editada no 2a ou offline)', async () => {
    const server = new FakeServer()
    server.push(updateWith('servidor '))
    const meta = new FakeMeta()
    const { doc } = setup({
      server,
      meta,
      local: (local) => {
        type(local, 'local')
      },
    })
    // Página com conteúdo local e sem registro entra como pendente até o servidor confirmar.
    expect(meta.state()).toBe('dirty')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(server.api.append).toHaveBeenCalledTimes(1)
    const merged = textOf(server.doc())
    expect(merged).toContain('servidor')
    expect(merged).toContain('local')
    expect(textOf(doc)).toBe(merged)
    expect(meta.state()).toBe('clean')
  })

  it('apagar offline também chega ao servidor (o diff inclui as exclusões)', async () => {
    const server = new FakeServer()
    const shared = new Y.Doc()
    shared.getText('t').insert(0, 'abcdef')
    server.push(Y.encodeStateAsUpdate(shared))
    const { doc } = setup({
      server,
      local: (local) => {
        Y.applyUpdate(local, Y.encodeStateAsUpdate(shared))
        local.getText('t').delete(0, 3)
      },
    })
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(textOf(server.doc())).toBe('def')
    expect(textOf(doc)).toBe('def')
  })

  it('missingOnServer: nada a enviar quando o servidor já tem tudo', () => {
    const doc = new Y.Doc()
    type(doc, 'igual')
    const row: ContentRow = {
      id: 1,
      kind: 'update',
      data: Y.encodeStateAsUpdate(doc),
      coversUpTo: null,
      byteSize: 0,
    }
    expect(missingOnServer(doc, [row])).toBeNull()
    type(doc, '!')
    expect(missingOnServer(doc, [row])).not.toBeNull()
  })
})

describe('recebimento de outros aparelhos', () => {
  it('busca no polling enquanto visível e online; updates do servidor não voltam para a fila', async () => {
    const server = new FakeServer()
    server.push(updateWith('A: '))
    const { doc } = setup({ server })
    await settle()
    server.push(updateWith('B escreveu'))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs)
    expect(textOf(doc)).toContain('B escreveu')
    // Incremental: só o que veio depois do maior id lido.
    expect(vi.mocked(server.api.fetch).mock.calls.at(-1)?.[1]).toBe(1)
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.maxWaitMs)
    expect(server.api.append).not.toHaveBeenCalled()
  })

  it('o polling para com a aba oculta e volta (com busca imediata) ao ficar visível', async () => {
    const { server, env } = setup()
    await settle()
    expect(server.api.fetch).toHaveBeenCalledTimes(1)
    env.visible = false
    env.documentTarget.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs * 5)
    expect(server.api.fetch).toHaveBeenCalledTimes(1)

    env.visible = true
    env.documentTarget.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(server.api.fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs)
    expect(server.api.fetch).toHaveBeenCalledTimes(3)
  })

  it('o polling para offline (navigator.onLine false) e volta ao reconectar', async () => {
    const { server, env } = setup()
    await settle()
    env.online = false
    env.windowTarget.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs * 5)
    expect(server.api.fetch).toHaveBeenCalledTimes(1)

    env.online = true
    env.windowTarget.dispatchEvent(new Event('online'))
    await settle()
    expect(server.api.fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs)
    expect(server.api.fetch).toHaveBeenCalledTimes(3)
  })

  it('gatilhos simultâneos (foco, visibilidade, rede, polling) viram uma busca só', async () => {
    const { server, env } = setup()
    await settle()
    let release: () => void = () => undefined
    server.fetchGate = new Promise<void>((resolve) => {
      release = resolve
    })
    env.windowTarget.dispatchEvent(new Event('focus'))
    env.documentTarget.dispatchEvent(new Event('visibilitychange'))
    env.windowTarget.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs)
    expect(server.api.fetch).toHaveBeenCalledTimes(2)
    server.fetchGate = null
    release()
    await settle()
    // Depois que a busca terminou, um gatilho novo busca de novo.
    env.windowTarget.dispatchEvent(new Event('focus'))
    await settle()
    expect(server.api.fetch).toHaveBeenCalledTimes(3)
  })
})

describe('compactação', () => {
  const fill = (server: FakeServer, count: number, size = 1) => {
    for (let index = 0; index < count; index += 1) {
      server.push(updateWith('x'.repeat(size)))
    }
  }

  it(`compacta ao abrir com mais de ${String(COMPACT_MAX_UPDATES)} updates, cobrindo o maior id lido`, async () => {
    const server = new FakeServer()
    fill(server, COMPACT_MAX_UPDATES + 1)
    const { doc } = setup({ server })
    await settle()
    await settle()
    expect(server.api.compact).toHaveBeenCalledTimes(1)
    const [, snapshot, upTo] = vi.mocked(server.api.compact).mock.calls[0] ?? []
    expect(upTo).toBe(COMPACT_MAX_UPDATES + 1)
    expect(snapshotMatches(snapshot ?? new Uint8Array(), Y.encodeStateVector(doc))).toBe(true)
    expect(server.rows.filter((row) => row.live)).toHaveLength(1)
    expect(textOf(server.doc())).toBe(textOf(doc))
  })

  it(`não compacta com até ${String(COMPACT_MAX_UPDATES)} updates pequenos`, async () => {
    const server = new FakeServer()
    fill(server, COMPACT_MAX_UPDATES)
    setup({ server })
    await settle()
    await settle()
    expect(server.api.compact).not.toHaveBeenCalled()
  })

  it('compacta quando os updates passam do limite em bytes', async () => {
    const server = new FakeServer()
    fill(server, 3, Math.ceil(COMPACT_MAX_BYTES / 2))
    setup({ server })
    await settle()
    await settle()
    expect(server.api.compact).toHaveBeenCalledTimes(1)
  })

  it('leitor não compacta', async () => {
    const server = new FakeServer()
    fill(server, COMPACT_MAX_UPDATES + 1)
    setup({ server, canWrite: false })
    await settle()
    await settle()
    expect(server.api.compact).not.toHaveBeenCalled()
  })

  it('outro aparelho já compactou (false): busca de novo e tenta com o id novo', async () => {
    const server = new FakeServer()
    fill(server, 2)
    const { doc } = setup({ server })
    await settle()
    // Na primeira tentativa, outro aparelho compacta um instante antes (snapshot novo, id 3).
    const compact = server.api.compact
    server.api.compact = vi.fn((pageId: string, snapshot: Uint8Array, upTo: number) => {
      if (vi.mocked(server.api.compact).mock.calls.length === 1) {
        for (const row of server.rows) if (row.id <= upTo) row.live = false
        server.push(Y.encodeStateAsUpdate(server.doc()), 'snapshot', upTo)
        return Promise.resolve(false)
      }
      return compact(pageId, snapshot, upTo)
    })
    type(doc, 'x'.repeat(APPEND_MAX_BYTES + 1))
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    const calls = vi.mocked(server.api.compact).mock.calls
    expect(calls.map((call) => call[2])).toEqual([2, 3])
    expect(textOf(server.doc())).toContain('x'.repeat(10))
  })

  it('a autoverificação recusa um snapshot que não reconstrói o doc', () => {
    const doc = new Y.Doc()
    type(doc, 'abc')
    const other = new Y.Doc()
    type(other, 'zzz')
    expect(snapshotMatches(Y.encodeStateAsUpdate(doc), Y.encodeStateVector(doc))).toBe(true)
    expect(snapshotMatches(Y.encodeStateAsUpdate(other), Y.encodeStateVector(doc))).toBe(false)
  })
})

describe('leitor e página na lixeira', () => {
  it('só recebe: edições locais não vão ao servidor, nem o texto', async () => {
    const server = new FakeServer()
    server.push(updateWith('conteúdo'))
    const { doc, session } = setup({ server, canWrite: false })
    session.setTextSource(() => [{ content: [{ text: 'x' }] }])
    await settle()
    expect(textOf(doc)).toBe('conteúdo')
    type(doc, 'tentativa')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.textIdleMs * 2)
    expect(server.api.append).not.toHaveBeenCalled()
    expect(server.api.setText).not.toHaveBeenCalled()
    expect(session.getStatus()).toBe('readonly')
  })

  it('não envia o conteúdo local ao abrir', async () => {
    const server = new FakeServer()
    setup({
      server,
      canWrite: false,
      local: (doc) => {
        type(doc, 'local')
      },
    })
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.maxWaitMs)
    expect(server.api.append).not.toHaveBeenCalled()
  })

  it('virar editor confere de novo e envia o que faltava', async () => {
    const server = new FakeServer()
    const { session } = setup({
      server,
      canWrite: false,
      local: (doc) => {
        type(doc, 'local')
      },
    })
    await settle()
    session.setCanWrite(true)
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.idleMs)
    expect(textOf(server.doc())).toBe('local')
  })
})

describe('texto de busca e prévias', () => {
  it('grava 5 s depois da última edição, só se mudou, e na hora ao ocultar a aba', async () => {
    const { server, doc, session, env } = setup()
    let blocks: TextBlock[] = [{ content: [{ text: 'primeira' }] }]
    session.setTextSource(() => blocks)
    await settle()
    type(doc, 'a')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.textIdleMs)
    expect(server.texts.map((entry) => entry.text)).toEqual(['primeira'])

    type(doc, 'b')
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.textIdleMs)
    expect(server.api.setText).toHaveBeenCalledTimes(1)

    blocks = [{ content: [{ text: 'segunda' }] }]
    type(doc, 'c')
    env.visible = false
    env.documentTarget.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(server.texts.map((entry) => entry.text)).toEqual(['primeira', 'segunda'])
  })
})

describe('stop', () => {
  it('envia o pendente antes de parar', async () => {
    const { server, doc, session } = setup()
    await settle()
    type(doc, 'antes de fechar')
    const stopping = session.stop()
    await settle()
    await stopping
    expect(textOf(server.doc())).toBe('antes de fechar')
    // Parado: nada mais é buscado.
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.pollMs * 3)
    expect(server.api.fetch).toHaveBeenCalledTimes(1)
  })

  it('origem do servidor é reconhecida pelo símbolo exportado', async () => {
    const { server, doc } = setup()
    await settle()
    Y.applyUpdate(doc, updateWith('vindo de fora'), SERVER_ORIGIN)
    await vi.advanceTimersByTimeAsync(SYNC_TIMING.maxWaitMs)
    expect(server.api.append).not.toHaveBeenCalled()
  })
})
