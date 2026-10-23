import {
  countPendingPages,
  EVICT_AFTER_MS,
  evictStalePages,
  registerUnknownPageDatabases,
  resyncClosedPages,
  type BackgroundDeps,
} from '@/features/sync/background'
import { stateOnOpen, type SyncMeta, type SyncMetaRecord } from '@/features/sync/sync-meta'

// O cliente real do Supabase exige as variáveis de ambiente (ausentes no CI); aqui nada chega à rede.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const NOW = Date.parse('2026-10-22T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

type MemoryMeta = SyncMeta & { records: Map<string, SyncMetaRecord> }

function memoryMeta(records: SyncMetaRecord[]): MemoryMeta {
  const map = new Map(records.map((record) => [record.pageId, record]))
  return {
    records: map,
    markOpened: (pageId, now, opening) => {
      const state = stateOnOpen(map.get(pageId)?.state, opening)
      map.set(pageId, { pageId, lastOpenedAt: now, state })
      return Promise.resolve()
    },
    setState: (pageId, state, now) => {
      map.set(pageId, { pageId, lastOpenedAt: map.get(pageId)?.lastOpenedAt ?? now, state })
      return Promise.resolve()
    },
    list: () => Promise.resolve([...map.values()]),
    forget: (pageId) => {
      map.delete(pageId)
      return Promise.resolve()
    },
  }
}

function deps(
  records: SyncMetaRecord[],
  overrides: Partial<BackgroundDeps> = {},
): BackgroundDeps & { meta: MemoryMeta } {
  return {
    now: () => NOW,
    resyncPage: vi.fn(() => Promise.resolve()),
    databaseNames: () => Promise.resolve([]),
    deleteDatabase: vi.fn(() => Promise.resolve(true)),
    openPageIds: () => new Set<string>(),
    log: vi.fn(),
    ...overrides,
    meta: memoryMeta(records),
  }
}

const record = (pageId: string, state: SyncMetaRecord['state'], daysAgo = 0): SyncMetaRecord => ({
  pageId,
  state,
  lastOpenedAt: NOW - daysAgo * DAY,
})

describe('reenvio em segundo plano', () => {
  it('reenvia só as páginas dirty fechadas (nunca as blocked nem as abertas), com limite', async () => {
    const d = deps(
      [
        record('a', 'dirty'),
        record('b', 'blocked'),
        record('c', 'clean'),
        record('d', 'dirty'),
        record('e', 'dirty'),
      ],
      { openPageIds: () => new Set(['d']) },
    )
    await resyncClosedPages(d, 1)
    expect(vi.mocked(d.resyncPage).mock.calls).toEqual([['a']])
    await resyncClosedPages(d)
    expect(vi.mocked(d.resyncPage).mock.calls.slice(1)).toEqual([['a'], ['e']])
  })

  it('uma página que falha não impede as outras', async () => {
    const d = deps([record('a', 'dirty'), record('b', 'dirty')], {
      resyncPage: vi.fn((pageId: string) =>
        pageId === 'a' ? Promise.reject(new Error('falhou')) : Promise.resolve(),
      ),
    })
    await resyncClosedPages(d)
    expect(d.resyncPage).toHaveBeenCalledTimes(2)
    expect(d.log).toHaveBeenCalledTimes(1)
  })

  it('bancos de página sem registro (do 2a) entram como dirty', async () => {
    const d = deps([record('a', 'clean')], {
      databaseNames: () =>
        Promise.resolve(['axenotes-page-a', 'axenotes-page-old', 'axenotes-sync', 'outro']),
    })
    await registerUnknownPageDatabases(d)
    expect(d.meta.records.get('old')).toEqual({ pageId: 'old', lastOpenedAt: NOW, state: 'dirty' })
    expect(d.meta.records.get('a')?.state).toBe('clean')
    expect(d.meta.records.size).toBe(2)
  })
})

describe('despejo dos bancos antigos', () => {
  it('apaga clean e blocked sem abrir há mais de 30 dias; nunca dirty, recente ou aberta', async () => {
    const d = deps(
      [
        record('velha', 'clean', 31),
        record('bloqueada', 'blocked', 40),
        record('suja', 'dirty', 90),
        record('recente', 'clean', 29),
        record('aberta', 'clean', 60),
      ],
      { openPageIds: () => new Set(['aberta']) },
    )
    await evictStalePages(d)
    expect(vi.mocked(d.deleteDatabase).mock.calls).toEqual([
      ['axenotes-page-velha'],
      ['axenotes-page-bloqueada'],
    ])
    expect([...d.meta.records.keys()].sort()).toEqual(['aberta', 'recente', 'suja'])
    expect(EVICT_AFTER_MS).toBe(30 * DAY)
  })

  it('banco aberto em outra aba (delete bloqueado) mantém o registro', async () => {
    const d = deps([record('velha', 'clean', 31)], {
      deleteDatabase: vi.fn(() => Promise.resolve(false)),
    })
    await evictStalePages(d)
    expect(d.meta.records.has('velha')).toBe(true)
  })
})

describe('pendente no logout', () => {
  it('conta as dirty (de qualquer aba) e ignora clean e blocked', async () => {
    const d = deps([
      record('a', 'dirty'),
      record('b', 'blocked'),
      record('c', 'clean'),
      record('d', 'dirty'),
    ])
    expect(await countPendingPages(d)).toBe(2)
  })

  it('sem metadados legíveis, não trava o logout', async () => {
    const d = deps([])
    d.meta.list = () => Promise.reject(new Error('indexeddb'))
    expect(await countPendingPages(d)).toBe(0)
  })
})
