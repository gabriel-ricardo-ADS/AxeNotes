import { RELOAD_KEY } from '@/lib/chunk-reload'
import { prefetchOnIdle, type PrefetchDeps } from '@/lib/prefetch-on-idle'

function fakeDeps(overrides: Partial<PrefetchDeps> = {}) {
  const pending: (() => void)[] = []
  const deps: PrefetchDeps = {
    schedule: (run) => {
      pending.push(run)
    },
    online: () => true,
    connection: () => undefined,
    ...overrides,
  }
  const runIdle = () => {
    for (const run of pending.splice(0)) run()
  }
  return { deps, runIdle }
}

const OLD_CHUNK = new TypeError(
  'Failed to fetch dynamically imported module: https://app.example.test/assets/PageEditor-OLD.js',
)

describe('prefetchOnIdle', () => {
  it('só carrega quando o navegador fica ocioso', () => {
    const load = vi.fn(() => Promise.resolve())
    const { deps, runIdle } = fakeDeps()

    prefetchOnIdle(load, deps)
    expect(load).not.toHaveBeenCalled()

    runIdle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('dispara uma vez só, mesmo chamado de novo (ex.: o layout montou outra vez)', () => {
    const load = vi.fn(() => Promise.resolve())
    const { deps, runIdle } = fakeDeps()

    prefetchOnIdle(load, deps)
    prefetchOnIdle(load, deps)
    runIdle()
    prefetchOnIdle(load, deps)
    runIdle()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['offline', { online: () => false }],
    ['com economia de dados', { connection: () => ({ saveData: true }) }],
    ['em 2G', { connection: () => ({ effectiveType: '2g' }) }],
    ['em slow-2g', { connection: () => ({ effectiveType: 'slow-2g' }) }],
  ])('não carrega %s', (_, overrides: Partial<PrefetchDeps>) => {
    const load = vi.fn(() => Promise.resolve())
    const { deps, runIdle } = fakeDeps(overrides)

    prefetchOnIdle(load, deps)
    runIdle()

    expect(load).not.toHaveBeenCalled()
  })

  it('carrega em 4G sem economia de dados', () => {
    const load = vi.fn(() => Promise.resolve())
    const { deps, runIdle } = fakeDeps({
      connection: () => ({ saveData: false, effectiveType: '4g' }),
    })

    prefetchOnIdle(load, deps)
    runIdle()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('falha em silêncio: sem rejeição solta e sem pedir recarga', async () => {
    sessionStorage.removeItem(RELOAD_KEY)
    const load = vi.fn(() => Promise.reject(OLD_CHUNK))
    const { deps, runIdle } = fakeDeps()

    prefetchOnIdle(load, deps)
    runIdle()
    await Promise.resolve()

    expect(load).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })

  it('no ambiente de teste, sem deps, não faz nada', () => {
    const load = vi.fn(() => Promise.resolve())

    prefetchOnIdle(load)

    expect(load).not.toHaveBeenCalled()
  })
})
