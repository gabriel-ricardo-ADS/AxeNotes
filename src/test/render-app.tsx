import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/App'
import { preloadRoutes } from '@/app/route-modules'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { emitAuthEvent, fakeSession } from '@/test/fake-supabase'

/**
 * Espera as telas lazy saírem do fallback: algo renderizado e nenhum `ScreenLoading` (um
 * `<Navigate>` deixa o DOM vazio por um instante antes da tela de destino suspender). Os chunks já
 * vêm baixados (`preloadRoutes`); o timeout folgado cobre o primeiro import do arquivo.
 */
export async function waitForRoutes(container: HTMLElement) {
  await preloadRoutes()
  await waitFor(
    () => {
      if (container.childElementCount === 0 || document.querySelector('[data-screen-loading]')) {
        throw new Error('ainda carregando')
      }
    },
    { timeout: 10_000 },
  )
}

/**
 * Renderiza o app inteiro (rotas + layout) com a sessão já carregada e espera as telas lazy. Exige
 * o `vi.mock` de '@/lib/supabase' apontando para o fakeSupabase no arquivo de teste.
 */
export async function renderApp(
  path: string | { pathname: string; state: unknown } = '/',
  signedIn = true,
) {
  await preloadRoutes()
  const result = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  emitAuthEvent('INITIAL_SESSION', signedIn ? fakeSession() : null)
  await waitForRoutes(result.container)
  return result
}
