import { QueryClient } from '@tanstack/react-query'
import * as Y from 'yjs'
import type { ContentSync } from '@/features/sync/content-sync'
import {
  LOCAL_LOAD_TIMEOUT_MS,
  openPageDoc,
  openPageDocCount,
  type PageDoc,
} from '@/features/sync/page-doc'
import { pageDbName } from '@/lib/idb-names'
import { resetClientState } from '@/lib/reset-client-state'

const PAGE_A = '00000000-0000-4000-8000-00000000000a'
const PAGE_B = '00000000-0000-4000-8000-00000000000b'

/** Escreve um parágrafo de texto no fragmento, como o editor faria. */
function write(pageDoc: PageDoc, text: string) {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  pageDoc.fragment.insert(pageDoc.fragment.length, [paragraph])
}

const read = (pageDoc: PageDoc): string => pageDoc.fragment.toJSON()

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).flatMap((info) => (info.name ? [info.name] : []))
}

let opened: PageDoc[] = []

function open(pageId: string, sync?: ContentSync): PageDoc {
  const pageDoc = openPageDoc(pageId, sync)
  opened.push(pageDoc)
  return pageDoc
}

afterEach(async () => {
  await Promise.all(opened.map((pageDoc) => pageDoc.destroy()))
  opened = []
  vi.restoreAllMocks()
})

describe('openPageDoc', () => {
  it('keeps the content on the device after closing and reopening the page', async () => {
    const first = open(PAGE_A)
    expect(await first.ready).toBe('local')
    write(first, 'Leituras de outubro')
    await first.destroy()

    const again = open(PAGE_A)
    expect(await again.ready).toBe('local')
    expect(read(again)).toContain('Leituras de outubro')
  })

  it('uses one database per page, so pages never share content', async () => {
    const pageA = open(PAGE_A)
    await pageA.ready
    write(pageA, 'só da página A')
    await pageA.destroy()

    const pageB = open(PAGE_B)
    await pageB.ready
    expect(read(pageB)).not.toContain('só da página A')
    expect(await databaseNames()).toEqual(
      expect.arrayContaining([pageDbName(PAGE_A), pageDbName(PAGE_B)]),
    )
    expect(pageDbName(PAGE_A)).toBe(`axenotes-page-${PAGE_A}`)
  })

  it('releases the database on destroy (no leak, delete is not blocked)', async () => {
    const pageDoc = open(PAGE_A)
    await pageDoc.ready
    expect(openPageDocCount()).toBe(1)

    await pageDoc.destroy()

    expect(openPageDocCount()).toBe(0)
    const blocked = vi.fn()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(pageDbName(PAGE_A))
      request.onblocked = blocked
      request.onsuccess = () => {
        resolve()
      }
      request.onerror = () => {
        reject(new Error('delete failed'))
      }
    })
    expect(blocked).not.toHaveBeenCalled()
  })

  it('falls back to an in-memory doc when IndexedDB fails to open', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('modo privado', 'InvalidStateError')
    })

    const pageDoc = open(PAGE_A)

    expect(await pageDoc.ready).toBe('memory')
    write(pageDoc, 'ainda editável')
    expect(read(pageDoc)).toContain('ainda editável')
  })

  it('falls back to memory when IndexedDB takes too long, and a late open does not attach', async () => {
    vi.useFakeTimers()
    const realOpen = indexedDB.open.bind(indexedDB)
    let release: (() => void) | undefined
    let calls = 0
    vi.spyOn(indexedDB, 'open').mockImplementation((name: string) => {
      const request = realOpen(name)
      // Só a primeira abertura (a de preparo) atrasa; as seguintes seguem normais.
      calls += 1
      if (calls > 1) return request
      // Segura o "success" até depois do tempo limite.
      const late: Partial<IDBOpenDBRequest> = {}
      request.onsuccess = () => {
        release = () => {
          late.onsuccess?.call(request, new Event('success'))
        }
      }
      request.onupgradeneeded = (event) => {
        late.onupgradeneeded?.call(request, event)
      }
      return new Proxy(request, {
        set: (_target, key, value) => {
          Reflect.set(late, key, value)
          return true
        },
      })
    })

    const pageDoc = open(PAGE_A)
    await vi.advanceTimersByTimeAsync(LOCAL_LOAD_TIMEOUT_MS + 10)
    expect(await pageDoc.ready).toBe('memory')
    vi.useRealTimers()

    await vi.waitFor(() => {
      expect(release).toBeDefined()
    })
    release?.()
    await new Promise((resolve) => setTimeout(resolve, 200))
    write(pageDoc, 'só em memória')
    await pageDoc.destroy()
    vi.restoreAllMocks()

    // O banco atrasado nunca recebeu o conteúdo.
    const again = open(PAGE_A)
    expect(await again.ready).toBe('local')
    expect(read(again)).not.toContain('só em memória')
  })

  it('falls back to memory when the browser has no IndexedDB at all', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const pageDoc = open(PAGE_A)
    expect(await pageDoc.ready).toBe('memory')
    vi.unstubAllGlobals()
  })

  it('starts the content sync after loading and stops it on destroy', async () => {
    const stop = vi.fn(() => Promise.resolve())
    const start = vi.fn(() => ({ stop }))
    const pageDoc = open(PAGE_A, { start })

    await pageDoc.ready
    expect(start).toHaveBeenCalledWith(PAGE_A, pageDoc.doc)

    await pageDoc.destroy()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('logout closes open docs and deletes the axenotes-page-* databases', async () => {
    const pageA = open(PAGE_A)
    const pageB = open(PAGE_B)
    await Promise.all([pageA.ready, pageB.ready])
    write(pageA, 'conta anterior')

    await resetClientState(new QueryClient())

    expect(openPageDocCount()).toBe(0)
    expect(await databaseNames()).toEqual([])
  })
})
