import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import {
  clearFailures,
  failAlways,
  failNext,
  fakeDb,
  fakeId,
  holdNext,
  mockProfile,
  resetFakeSupabase,
  seedFavorites,
  seedPages,
  seedWorkspace,
  trashInDb,
} from '@/test/fake-supabase'
import { installMatchMedia } from '@/test/match-media'
import { renderApp } from '@/test/render-app'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const HOME = fakeId(1000)
const READINGS = fakeId(1)
const STUDIES = fakeId(2)
const MOVIES = fakeId(3)

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  installMatchMedia(true)
  useTreeUiStore.setState({ ownerId: null, expanded: new Set(), renamingId: null, notice: null })
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: READINGS, title: 'Leituras', sortKey: 'a0' },
    { id: STUDIES, parentId: READINGS, title: 'Estudos', sortKey: 'a0' },
    { id: MOVIES, title: 'Filmes', sortKey: 'a1' },
  ])
})

const favorites = () => fakeDb.tables.user_favorites
const favoriteWrites = () => fakeDb.writes.filter((write) => write.table === 'user_favorites')
const favoritesSection = () => screen.getByRole('region', { name: 'Favoritos' })

describe('seção Favoritos da sidebar', () => {
  it('lists the favorites above "Páginas", in the order they were added', async () => {
    seedFavorites([
      { pageId: MOVIES, sortKey: 'a1' },
      { pageId: READINGS, sortKey: 'a0' },
    ])
    renderApp()

    const list = await screen.findByRole('list', { name: 'Páginas favoritas' })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Leituras', 'Filmes'])
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.indexOf('Favoritos')).toBeLessThan(headings.indexOf('Páginas'))
  })

  it('hints how to favorite when the list is empty', async () => {
    renderApp()

    expect(
      await screen.findByText('Toque na estrela de uma página para fixá-la aqui.'),
    ).toBeInTheDocument()
  })

  it('hides a favorite whose page is in the trash, without touching the row', async () => {
    seedFavorites([
      { pageId: READINGS, sortKey: 'a0' },
      { pageId: MOVIES, sortKey: 'a1' },
    ])
    trashInDb(MOVIES)
    renderApp()

    const list = await screen.findByRole('list', { name: 'Páginas favoritas' })
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Leituras'])
    expect(favorites()).toHaveLength(2)
  })

  it('shows a retryable error when the favorites do not load', async () => {
    const user = userEvent.setup()
    failAlways('select', 'user_favorites')
    renderApp()

    expect(await screen.findByText('Não foi possível carregar os favoritos.')).toBeInTheDocument()
    clearFailures()
    seedFavorites([{ pageId: READINGS, sortKey: 'a0' }])
    await user.click(within(favoritesSection()).getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('list', { name: 'Páginas favoritas' })).toBeInTheDocument()
  })
})

describe('favoritar pela árvore', () => {
  async function favoriteFromRowMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(await screen.findByRole('button', { name: `Mais ações de ${title}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Adicionar aos favoritos' }))
  }

  it('adds at the end right away and sends only page_id and sort_key, without reloading the list', async () => {
    const user = userEvent.setup()
    seedFavorites([{ pageId: READINGS, sortKey: 'a0' }])
    renderApp()
    await screen.findByRole('list', { name: 'Páginas favoritas' })
    const loadsBefore = fakeDb.selects.filter((table) => table === 'user_favorites').length

    await favoriteFromRowMenu(user, 'Filmes')

    const list = screen.getByRole('list', { name: 'Páginas favoritas' })
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Leituras', 'Filmes'])
    await waitFor(() => {
      expect(favoriteWrites()).toHaveLength(1)
    })
    const payload = favoriteWrites()[0]?.payload as { page_id: string; sort_key: string }
    expect(Object.keys(payload).sort()).toEqual(['page_id', 'sort_key'])
    expect(payload.page_id).toBe(MOVIES)
    expect(payload.sort_key > 'a0').toBe(true)
    expect(fakeDb.selects.filter((table) => table === 'user_favorites')).toHaveLength(loadsBefore)
  })

  it('shows "Remover dos favoritos" for a favorite and removes it', async () => {
    const user = userEvent.setup()
    seedFavorites([{ pageId: MOVIES, sortKey: 'a0' }])
    renderApp()
    await screen.findByRole('list', { name: 'Páginas favoritas' })

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remover dos favoritos' }))

    await waitFor(() => {
      expect(favorites()).toHaveLength(0)
    })
    expect(screen.queryByRole('list', { name: 'Páginas favoritas' })).not.toBeInTheDocument()
  })

  it('rolls back and warns in the sidebar when adding fails', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByText('Toque na estrela de uma página para fixá-la aqui.')
    failNext('upsert', 'user_favorites')

    await favoriteFromRowMenu(user, 'Filmes')

    expect(
      await screen.findByText('Não foi possível adicionar aos favoritos. Tente novamente.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Páginas favoritas' })).not.toBeInTheDocument()
    expect(favorites()).toHaveLength(0)
  })

  it('brings a favorite back and warns when removing fails', async () => {
    const user = userEvent.setup()
    seedFavorites([{ pageId: MOVIES, sortKey: 'a0' }])
    renderApp()
    const list = await screen.findByRole('list', { name: 'Páginas favoritas' })
    failNext('delete', 'user_favorites')

    await user.click(within(list).getByRole('button', { name: 'Remover Filmes dos favoritos' }))

    expect(
      await screen.findByText('Não foi possível remover dos favoritos. Tente novamente.'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Páginas favoritas' })).getByRole('link', {
        name: 'Filmes',
      }),
    ).toBeInTheDocument()
    expect(favorites()).toHaveLength(1)
  })

  it('keeps the order of two quick clicks (add, then remove) and ends without the favorite', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByText('Toque na estrela de uma página para fixá-la aqui.')
    const gate = holdNext('upsert', 'user_favorites')

    await favoriteFromRowMenu(user, 'Filmes')
    const list = await screen.findByRole('list', { name: 'Páginas favoritas' })
    await user.click(within(list).getByRole('button', { name: 'Remover Filmes dos favoritos' }))
    expect(screen.queryByRole('list', { name: 'Páginas favoritas' })).not.toBeInTheDocument()
    expect(favoriteWrites()).toHaveLength(0)

    gate.release()

    await waitFor(() => {
      expect(favoriteWrites().map((write) => write.op)).toEqual(['upsert', 'delete'])
    })
    expect(favorites()).toHaveLength(0)
  })
})

describe('estrela da página', () => {
  const star = (name: 'Adicionar aos favoritos' | 'Remover dos favoritos') =>
    screen.findByRole('button', { name })

  it('toggles the favorite and reflects it in aria-pressed and in the sidebar', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${READINGS}`)

    await user.click(await star('Adicionar aos favoritos'))

    const pressed = await star('Remover dos favoritos')
    expect(pressed).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(await screen.findByRole('list', { name: 'Páginas favoritas' })).getByRole('link', {
        name: 'Leituras',
      }),
    ).toBeInTheDocument()

    await user.click(pressed)
    expect(await star('Adicionar aos favoritos')).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => {
      expect(favorites()).toHaveLength(0)
    })
  })

  it('lets a viewer favorite (it is per-user data)', async () => {
    const user = userEvent.setup()
    seedWorkspace({ role: 'viewer', homePageId: HOME })
    renderApp(`/p/${READINGS}`)

    await user.click(await star('Adicionar aos favoritos'))

    await waitFor(() => {
      expect(favorites()).toHaveLength(1)
    })
  })

  it('shows a dismissible error in the page, not in the sidebar, when it fails', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${READINGS}`)
    const button = await star('Adicionar aos favoritos')
    await waitFor(() => {
      expect(button).toBeEnabled()
    })
    failNext('upsert', 'user_favorites')

    await user.click(button)

    const main = screen.getByRole('main')
    const alert = await within(main).findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível adicionar aos favoritos. Tente novamente.')
    expect(
      within(screen.getByRole('navigation', { name: 'Navegação principal' })).queryByRole('alert'),
    ).not.toBeInTheDocument()
    expect(await star('Adicionar aos favoritos')).toHaveAttribute('aria-pressed', 'false')

    await user.click(within(alert).getByRole('button', { name: 'Dispensar aviso' }))
    expect(within(main).queryByRole('alert')).not.toBeInTheDocument()
  })
})
