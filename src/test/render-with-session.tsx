import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { emitAuthEvent, fakeSession } from '@/test/fake-supabase'
import { LocationProbe } from '@/test/LocationProbe'

/**
 * Renderiza um componente solto (sem as rotas do app) com TanStack Query, roteador e a sessão do usuário
 * de teste já carregada. Exige o `vi.mock` de '@/lib/supabase' apontando para o fakeSupabase.
 */
export function renderWithSession(ui: ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  {ui}
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  act(() => {
    emitAuthEvent('INITIAL_SESSION', fakeSession())
  })
  return { ...result, queryClient }
}
