import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useSearchStore } from '@/features/search/search-store'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { resetAllStores } from '@/lib/create-store'
import { createQueryClient } from '@/lib/query-client'
import {
  emitAuthEvent,
  fakeAuth,
  fakeDb,
  fakeId,
  fakeSession,
  mockProfile,
  resetFakeSupabase,
  seedFavorites,
  seedPages,
  seedRecents,
} from '@/test/fake-supabase'
import { installMatchMedia } from '@/test/match-media'
import { waitForRoutes } from '@/test/render-app'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

/** Renderiza o app com a sessão já carregada (`signedIn: false` = carregada, sem usuário). */
async function renderApp(path = '/', signedIn = true, queryClient = new QueryClient()) {
  const result = render(
    <QueryClientProvider client={queryClient}>
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

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
})

describe('layout (desktop)', () => {
  beforeEach(() => {
    installMatchMedia(true)
  })

  it('shows the fixed sidebar and no menu button', async () => {
    await renderApp()

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Página inicial' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument()
  })

  it('renders the home page title in the content area', async () => {
    await renderApp()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página inicial' }),
    ).toBeInTheDocument()
  })

  it('shows the not found page for unknown routes', async () => {
    await renderApp('/nao-existe')

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
  })
})

describe('layout (mobile)', () => {
  let media: ReturnType<typeof installMatchMedia>

  beforeEach(() => {
    media = installMatchMedia(false)
  })

  it('has no sidebar until the menu button is used', async () => {
    await renderApp()

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument()
  })

  it('opens the drawer from the menu button', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))

    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' })
    expect(within(drawer).getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  })

  it('closes the drawer with Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup()
    await renderApp()
    const button = screen.getByRole('button', { name: 'Abrir menu' })

    await user.click(button)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes the drawer after choosing a link', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('link', { name: 'Página inicial' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('switches to the fixed sidebar when the viewport becomes wide', async () => {
    const user = userEvent.setup()
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    await screen.findByRole('dialog')

    act(() => {
      media.setDesktop(true)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument()
  })
})

describe('auth in the app shell', () => {
  beforeEach(() => {
    installMatchMedia(true)
  })

  it('sends visitors without a session to the sign-in screen', async () => {
    await renderApp('/', false)

    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('shows the user name and a sign-out button in the sidebar footer', async () => {
    await renderApp()

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(await within(nav).findByText('Ana Teste')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('falls back to a generic label when the profile has no name', async () => {
    mockProfile(null)
    await renderApp()

    expect(await screen.findByText('Minha conta')).toBeInTheDocument()
  })

  it('signs out only this device and goes back to the sign-in screen', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(fakeAuth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    })
  })
})

describe('switching accounts', () => {
  const HOME = fakeId(1000)
  const DIARY = fakeId(1)
  const SECRET = fakeId(2)
  const RECIPES = fakeId(3)
  const USER_B = 'user-2'

  beforeEach(() => {
    installMatchMedia(true)
    resetAllStores()
    // Conta A: uma página com subpágina, favoritada e visitada.
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      { id: DIARY, title: 'Diário da conta A', sortKey: 'a0' },
      { id: SECRET, parentId: DIARY, title: 'Segredo da conta A', sortKey: 'a0' },
    ])
    seedFavorites([{ pageId: DIARY, sortKey: 'a0' }])
    seedRecents([{ pageId: SECRET, visitedAt: '2026-10-10T12:00:00Z' }])
  })

  /** Troca o "banco" para a conta B e entra com ela. */
  function signInAsB() {
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      { id: RECIPES, title: 'Receitas da conta B', sortKey: 'a0' },
    ])
    seedFavorites([{ pageId: RECIPES, sortKey: 'a0' }])
    seedRecents([{ pageId: RECIPES, visitedAt: '2026-10-11T12:00:00Z' }])
    fakeDb.tables.profiles = [{ id: USER_B, display_name: 'Bruno Teste' }]
    // Linhas por usuário (membro, favoritos, recentes) passam a ser de B.
    for (const table of ['workspace_members', 'user_favorites', 'user_recents'] as const) {
      fakeDb.tables[table] = fakeDb.tables[table].map((row) => ({ ...row, user_id: USER_B }))
    }
    emitAuthEvent('SIGNED_IN', fakeSession(USER_B))
  }

  async function expectNothingFromA() {
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(await within(nav).findByText('Bruno Teste')).toBeInTheDocument()
    await within(nav).findAllByRole('link', { name: 'Receitas da conta B' })
    expect(screen.queryByText(/conta A/)).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Teste')).not.toBeInTheDocument()
    expect(useTreeUiStore.getState().expanded.has(DIARY)).toBe(false)
    expect(useSearchStore.getState()).toMatchObject({ open: false, term: '' })

    // A busca sem texto lista os recentes: só os de B.
    const user = userEvent.setup()
    await user.click(within(nav).getByRole('button', { name: /^Buscar/ }))
    const search = within(await screen.findByRole('dialog', { name: 'Buscar páginas' }))
    expect(await search.findByRole('option', { name: /Receitas da conta B/ })).toBeInTheDocument()
    expect(search.queryByText(/conta A/)).not.toBeInTheDocument()
  }

  it('shows nothing from account A after "Sair" and signing in as B', async () => {
    const user = userEvent.setup()
    // Cliente com a config real (staleTime de 30 s): sem a limpeza, o cache de A apareceria para B.
    await renderApp(`/p/${SECRET}`, true, createQueryClient())
    expect(await screen.findByRole('textbox', { name: 'Título da página' })).toHaveValue(
      'Segredo da conta A',
    )
    await screen.findAllByRole('link', { name: 'Diário da conta A' })
    expect(useTreeUiStore.getState().expanded.has(DIARY)).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByText(/conta A/)).not.toBeInTheDocument()

    signInAsB()

    await expectNothingFromA()
  })

  it('also cleans up when the session ends elsewhere (expired or another tab)', async () => {
    const user = userEvent.setup()
    await renderApp('/', true, createQueryClient())
    await screen.findAllByRole('link', { name: 'Diário da conta A' })
    await user.keyboard('{Control>}k{/Control}')
    await user.type(await screen.findByRole('combobox', { name: 'Buscar páginas' }), 'Segredo')

    emitAuthEvent('SIGNED_OUT', null)

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(useSearchStore.getState()).toMatchObject({ open: false, term: '' })

    signInAsB()

    await expectNothingFromA()
  })
})
