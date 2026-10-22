import {
  isChunkLoadError,
  RELOAD_GUARD_MS,
  RELOAD_KEY,
  reloadOnChunkError,
  resetChunkReloadForTests,
  type ReloadDeps,
} from '@/lib/chunk-reload'

/** sessionStorage em memória, mais o relógio e o reload falsos. */
function fakeDeps(start = 1_000_000) {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  } as unknown as Storage
  let now = start
  const deps = {
    storage: () => storage,
    reload: vi.fn(),
    now: () => now,
  } satisfies ReloadDeps
  return {
    deps,
    data,
    advance: (ms: number) => {
      now += ms
    },
    /** Simula a página nova depois do reload (o flag em memória some; o sessionStorage fica). */
    newPage: () => {
      resetChunkReloadForTests()
    },
  }
}

// Mensagens reais dos navegadores. No Cloudflare Pages um chunk que não existe volta como o
// index.html (fallback de SPA, 200, text/html) e o import falha por MIME com estas mesmas mensagens.
const CHROME_MIME = new TypeError(
  'Failed to fetch dynamically imported module: https://app.example.test/assets/app-routes-OLD.js',
)
const FIREFOX = new TypeError(
  'error loading dynamically imported module: https://app.example.test/assets/app-routes-OLD.js',
)
const SAFARI = new TypeError('Importing a module script failed.')
const MIME_DETAIL = new TypeError(
  'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
)
const VITE_CSS = new Error('Unable to preload CSS for /assets/app-routes-OLD.css')

beforeEach(() => {
  resetChunkReloadForTests()
})

describe('isChunkLoadError', () => {
  it.each([CHROME_MIME, FIREFOX, SAFARI, MIME_DETAIL, VITE_CSS])(
    'recognizes a failed chunk load: %s',
    (error) => {
      expect(isChunkLoadError(error)).toBe(true)
    },
  )

  it.each([
    new Error('boom'),
    new ReferenceError('x is not defined'),
    new TypeError("Cannot read properties of undefined (reading 'title')"),
    'Failed to fetch dynamically imported module',
    null,
  ])('ignores errors thrown by the module itself (or non-errors): %s', (error) => {
    expect(isChunkLoadError(error)).toBe(false)
  })
})

describe('reloadOnChunkError', () => {
  it('reloads once when an old chunk comes back as index.html (MIME)', () => {
    const { deps, data } = fakeDeps()

    expect(reloadOnChunkError(CHROME_MIME, deps)).toBe(true)

    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(data.get(RELOAD_KEY)).toBe('1000000')
  })

  it('does not reload for an error thrown by the module code', () => {
    const { deps } = fakeDeps()

    expect(reloadOnChunkError(new ReferenceError('x is not defined'), deps)).toBe(false)
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('asks for a single reload when several chunks fail at once', () => {
    const { deps } = fakeDeps()

    expect(reloadOnChunkError(CHROME_MIME, deps)).toBe(true)
    expect(reloadOnChunkError(VITE_CSS, deps)).toBe(true)

    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('does not loop: a new failure right after the reload goes to the error screen', () => {
    const { deps, advance, newPage } = fakeDeps()
    reloadOnChunkError(SAFARI, deps)
    newPage()
    advance(2_000)

    expect(reloadOnChunkError(SAFARI, deps)).toBe(false)
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again for a later deploy, once the guard window has passed', () => {
    const { deps, advance, newPage } = fakeDeps()
    reloadOnChunkError(FIREFOX, deps)
    newPage()
    advance(RELOAD_GUARD_MS + 1)

    expect(reloadOnChunkError(FIREFOX, deps)).toBe(true)
    expect(deps.reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload without sessionStorage (no way to stop a loop)', () => {
    const { deps } = fakeDeps()
    const blocked = {
      ...deps,
      storage: () => {
        throw new DOMException('bloqueado', 'SecurityError')
      },
    }

    expect(reloadOnChunkError(CHROME_MIME, blocked)).toBe(false)
    expect(deps.reload).not.toHaveBeenCalled()
  })
})
