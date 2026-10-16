import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/auth-context'
import { GuestOnly, RequireAuth } from '@/features/auth/guards'
import { emitAuthEvent, fakeSession, resetFakeSupabase } from '@/test/fake-supabase'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

function Where() {
  const location = useLocation()
  return (
    <p data-testid="where">
      {location.pathname}|{JSON.stringify(location.state)}
    </p>
  )
}

function AppScreen() {
  const auth = useAuth()
  return (
    <div>
      <p>app</p>
      <button
        type="button"
        onClick={() => {
          void auth.signOut()
        }}
      >
        sair
      </button>
      <Where />
    </div>
  )
}

function RecoverScreen() {
  const auth = useAuth()
  return (
    <div>
      <p>nova senha</p>
      <button
        type="button"
        onClick={() => {
          auth.setRecovering(true)
        }}
      >
        marcar
      </button>
      <button
        type="button"
        onClick={() => {
          auth.setRecovering(false)
        }}
      >
        concluir
      </button>
    </div>
  )
}

let queryClient: QueryClient

function renderAt(initial: InitialEntry) {
  queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/entrar" element={<Where />} />
              <Route path="/recuperar-senha" element={<RecoverScreen />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route path="*" element={<AppScreen />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  resetFakeSupabase()
})

describe('RequireAuth', () => {
  it('renders neither the app nor the login while the session loads', () => {
    renderAt('/p/abc')

    expect(screen.queryByText('app')).not.toBeInTheDocument()
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('sends visitors to /entrar and brings them back to the original route after login', () => {
    renderAt('/p/abc?x=1#topo')

    emitAuthEvent('INITIAL_SESSION', null)
    expect(where()).toBe('/entrar|{"from":"/p/abc?x=1#topo"}')

    emitAuthEvent('SIGNED_IN', fakeSession())
    expect(screen.getByText('app')).toBeInTheDocument()
    expect(where()).toBe('/p/abc|null')
  })

  it('shows the app right away when there is a stored session', () => {
    renderAt('/p/abc')

    emitAuthEvent('INITIAL_SESSION', fakeSession())

    expect(screen.getByText('app')).toBeInTheDocument()
  })

  it('does not remember the route after the user chooses to sign out', async () => {
    const user = userEvent.setup()
    renderAt('/p/abc')
    emitAuthEvent('INITIAL_SESSION', fakeSession())

    await user.click(screen.getByRole('button', { name: 'sair' }))

    expect(where()).toBe('/entrar|null')
  })

  it('clears the query cache on SIGNED_OUT', () => {
    renderAt('/p/abc')
    emitAuthEvent('INITIAL_SESSION', fakeSession())
    queryClient.setQueryData(['profile', 'user-1'], { displayName: 'Ana' })

    emitAuthEvent('SIGNED_OUT', null)

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('clears the query cache when another user signs in', () => {
    renderAt('/p/abc')
    emitAuthEvent('INITIAL_SESSION', fakeSession('user-1'))
    queryClient.setQueryData(['profile', 'user-1'], { displayName: 'Ana' })

    emitAuthEvent('SIGNED_IN', fakeSession('user-2'))

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('unsubscribes from auth changes on unmount', () => {
    const { unmount } = renderAt('/p/abc')

    unmount()
    emitAuthEvent('SIGNED_IN', fakeSession())

    expect(screen.queryByText('app')).not.toBeInTheDocument()
  })
})

describe('GuestOnly', () => {
  it('sends logged users away from the auth screens', () => {
    renderAt('/entrar')

    emitAuthEvent('INITIAL_SESSION', fakeSession())

    expect(screen.getByText('app')).toBeInTheDocument()
    expect(where()).toBe('/|null')
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com'])(
    'ignores an unsafe return route (%s)',
    (from) => {
      renderAt({ pathname: '/entrar', state: { from } })

      emitAuthEvent('INITIAL_SESSION', fakeSession())

      expect(where()).toBe('/|null')
    },
  )
})

describe('password recovery', () => {
  const open = () => {
    renderAt('/recuperar-senha')
    emitAuthEvent('INITIAL_SESSION', null)
  }

  it('stays on the new-password step when marked before the session arrives', async () => {
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('button', { name: 'marcar' }))
    emitAuthEvent('SIGNED_IN', fakeSession())

    expect(screen.getByText('nova senha')).toBeInTheDocument()
  })

  it('stays when the PASSWORD_RECOVERY event arrives before SIGNED_IN', () => {
    open()

    emitAuthEvent('PASSWORD_RECOVERY', fakeSession())
    emitAuthEvent('SIGNED_IN', fakeSession())

    expect(screen.getByText('nova senha')).toBeInTheDocument()
  })

  it('stays when SIGNED_IN and PASSWORD_RECOVERY arrive together, in either order', () => {
    open()

    act(() => {
      emitAuthEvent('SIGNED_IN', fakeSession())
      emitAuthEvent('PASSWORD_RECOVERY', fakeSession())
    })

    expect(screen.getByText('nova senha')).toBeInTheDocument()
  })

  it('goes to the app once the new password is saved', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'marcar' }))
    emitAuthEvent('SIGNED_IN', fakeSession())

    await user.click(screen.getByRole('button', { name: 'concluir' }))

    expect(screen.getByText('app')).toBeInTheDocument()
  })

  it('without the mark, a logged user is sent to the app', () => {
    open()

    emitAuthEvent('SIGNED_IN', fakeSession())

    expect(screen.getByText('app')).toBeInTheDocument()
  })

  it('drops the mark when the session ends', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'marcar' }))
    emitAuthEvent('SIGNED_IN', fakeSession())

    emitAuthEvent('SIGNED_OUT', null)
    emitAuthEvent('SIGNED_IN', fakeSession())

    expect(screen.getByText('app')).toBeInTheDocument()
  })
})
