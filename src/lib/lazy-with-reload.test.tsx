import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import type { MockInstance } from 'vitest'
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary'
import { resetChunkReloadForTests, type ReloadDeps } from '@/lib/chunk-reload'
import { lazyWithReload } from '@/lib/lazy-with-reload'

function fakeDeps(lastReloadAt?: number) {
  const data = new Map<string, string>()
  if (lastReloadAt !== undefined) data.set('axenotes:chunk-reload-at', String(lastReloadAt))
  return {
    storage: () =>
      ({
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          data.set(key, value)
        },
      }) as unknown as Storage,
    reload: vi.fn(),
    now: () => 1_000_000,
  } satisfies ReloadDeps
}

const OLD_CHUNK = new TypeError(
  'Failed to fetch dynamically imported module: https://app.example.test/assets/app-routes-OLD.js',
)

function renderLazy(
  factory: () => Promise<{ default: () => React.JSX.Element }>,
  deps: ReloadDeps,
) {
  const Screen = lazyWithReload(factory, deps)
  render(
    <RouteErrorBoundary resetKey="/">
      <Suspense fallback={<p>carregando</p>}>
        <Screen />
      </Suspense>
    </RouteErrorBoundary>,
  )
}

let errorLog: MockInstance<typeof console.error>

beforeEach(() => {
  resetChunkReloadForTests()
  // O React loga o erro que chega ao error boundary.
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  errorLog.mockRestore()
})

describe('lazyWithReload', () => {
  it('renders the screen when the chunk loads', async () => {
    const deps = fakeDeps()
    renderLazy(() => Promise.resolve({ default: () => <h1>Lixeira</h1> }), deps)

    expect(await screen.findByRole('heading', { name: 'Lixeira' })).toBeInTheDocument()
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('reloads once on a stale chunk and keeps the loading state meanwhile', async () => {
    const deps = fakeDeps()
    renderLazy(() => Promise.reject(OLD_CHUNK), deps)

    await vi.waitFor(() => {
      expect(deps.reload).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('carregando')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error screen, without reloading, when the module code throws', async () => {
    const deps = fakeDeps()
    renderLazy(() => Promise.reject(new ReferenceError('x is not defined')), deps)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar esta tela',
    )
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('shows the error screen when the chunk fails again right after a reload', async () => {
    const deps = fakeDeps(1_000_000 - 3_000)
    renderLazy(() => Promise.reject(OLD_CHUNK), deps)

    expect(await screen.findByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(deps.reload).not.toHaveBeenCalled()
  })
})
