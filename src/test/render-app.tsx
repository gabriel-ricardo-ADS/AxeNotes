import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { emitAuthEvent, fakeSession } from '@/test/fake-supabase'

/**
 * Renderiza o app inteiro (rotas + layout) com a sessão já carregada. Exige o `vi.mock` de
 * '@/lib/supabase' apontando para o fakeSupabase no arquivo de teste.
 */
export function renderApp(path = '/', signedIn = true) {
  const result = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  emitAuthEvent('INITIAL_SESSION', signedIn ? fakeSession() : null)
  return result
}
