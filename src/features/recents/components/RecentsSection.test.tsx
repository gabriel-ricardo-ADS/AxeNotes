import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetVisitGuard } from '@/features/recents/hooks/use-record-visit'
import { RECENTS_KEPT } from '@/features/recents/recents'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import {
  clearFailures,
  failAlways,
  failNext,
  fakeDb,
  fakeId,
  mockProfile,
  resetFakeSupabase,
  seedPages,
  seedRecents,
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
const MISSING = fakeId(404)

beforeEach(() => {
  resetFakeSupabase()
  resetVisitGuard()
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

const visits = () =>
  fakeDb.writes.filter((write) => write.table === 'user_recents' && write.op === 'upsert')
const recentsList = () => screen.findByRole('list', { name: 'Páginas recentes' })
const titles = (list: HTMLElement) =>
  within(list)
    .getAllByRole('link')
    .map((link) => link.textContent)

describe('seção Recentes da sidebar', () => {
  it('lists the latest visits first, without the home page and pages out of reach', async () => {
    seedRecents([
      { pageId: READINGS, visitedAt: '2026-10-01T10:00:00Z' },
      { pageId: HOME, visitedAt: '2026-10-05T10:00:00Z' },
      { pageId: MISSING, visitedAt: '2026-10-04T10:00:00Z' },
      { pageId: MOVIES, visitedAt: '2026-10-03T10:00:00Z' },
    ])
    renderApp()

    expect(titles(await recentsList())).toEqual(['Filmes', 'Leituras'])
  })

  it('shows at most 8', async () => {
    const extra = Array.from({ length: 10 }, (_, index) => fakeId(100 + index))
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      ...extra.map((id, index) => ({
        id,
        title: `Página ${String(index)}`,
        sortKey: `a${String(index)}`,
      })),
    ])
    seedRecents(
      extra.map((pageId, index) => ({
        pageId,
        visitedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
      })),
    )
    renderApp()

    expect(titles(await recentsList())).toHaveLength(8)
  })

  it('explains when there are no visits yet', async () => {
    renderApp()

    expect(await screen.findByText('As páginas que você abrir aparecem aqui.')).toBeInTheDocument()
  })

  it('shows a retryable error when the recents do not load', async () => {
    const user = userEvent.setup()
    failNext('select', 'user_recents')
    renderApp()

    expect(await screen.findByText('Não foi possível carregar os recentes.')).toBeInTheDocument()
    seedRecents([{ pageId: READINGS, visitedAt: '2026-10-01T10:00:00Z' }])
    const region = screen.getByRole('region', { name: 'Recentes' })
    await user.click(within(region).getByRole('button', { name: 'Tentar de novo' }))

    expect(titles(await recentsList())).toEqual(['Leituras'])
  })

  it('shows a retryable error when the workspace does not load, and reloads it', async () => {
    const user = userEvent.setup()
    failAlways('select', 'workspace_members')
    renderApp()

    expect(await screen.findByText('Não foi possível carregar os recentes.')).toBeInTheDocument()
    expect(screen.queryByText('As páginas que você abrir aparecem aqui.')).not.toBeInTheDocument()
    seedRecents([{ pageId: READINGS, visitedAt: '2026-10-01T10:00:00Z' }])
    clearFailures()
    const region = screen.getByRole('region', { name: 'Recentes' })
    await user.click(within(region).getByRole('button', { name: 'Tentar de novo' }))

    expect(titles(await recentsList())).toEqual(['Leituras'])
  })
})

describe('registro da visita', () => {
  it('records the visit once, with only page_id and visited_at, and lists it right away', async () => {
    renderApp(`/p/${READINGS}`)

    expect(titles(await recentsList())).toEqual(['Leituras'])
    await waitFor(() => {
      expect(visits()).toHaveLength(1)
    })
    const payload = visits()[0]?.payload as { page_id: string; visited_at: string }
    expect(Object.keys(payload).sort()).toEqual(['page_id', 'visited_at'])
    expect(payload.page_id).toBe(READINGS)
    expect(Number.isNaN(Date.parse(payload.visited_at))).toBe(false)
    expect(fakeDb.tables.user_recents).toHaveLength(1)
  })

  it('does not record the home page', async () => {
    renderApp('/')

    await screen.findByRole('textbox', { name: 'Título da página' })
    await screen.findByText('As páginas que você abrir aparecem aqui.')
    expect(visits()).toHaveLength(0)
  })

  it('does not record a page that does not exist, nor one that is in the trash', async () => {
    trashInDb(MOVIES)
    const first = renderApp(`/p/${MISSING}`)
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument()
    first.unmount()

    renderApp(`/p/${MOVIES}`)
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument()

    expect(visits()).toHaveLength(0)
  })

  it('does not record the same page again within a few seconds', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${READINGS}`)
    const list = await recentsList()
    await waitFor(() => {
      expect(visits()).toHaveLength(1)
    })

    // Sai para a página inicial (que não grava) e volta pela própria lista de recentes.
    await user.click(screen.getByRole('link', { name: 'Página inicial' }))
    await screen.findByRole('heading', { level: 1, name: 'Página inicial' })
    await user.click(within(list).getByRole('link', { name: 'Leituras' }))
    await screen.findByRole('heading', { level: 1, name: 'Leituras' })

    expect(visits()).toHaveLength(1)
  })

  it('records A → B → A as three visits, so the order follows the last one', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${READINGS}`)
    await recentsList()

    const tree = await screen.findByRole('tree', { name: 'Árvore de páginas' })
    await user.click(within(tree).getByRole('link', { name: 'Filmes' }))
    await screen.findByRole('heading', { level: 1, name: 'Filmes' })
    await user.click(within(tree).getByRole('link', { name: 'Leituras' }))
    await screen.findByRole('heading', { level: 1, name: 'Leituras' })

    await waitFor(() => {
      expect(visits().map((write) => (write.payload as { page_id: string }).page_id)).toEqual([
        READINGS,
        MOVIES,
        READINGS,
      ])
    })
    expect(titles(await recentsList())).toEqual(['Leituras', 'Filmes'])
  })

  it('keeps working silently when the write fails, and reloads the list from the server', async () => {
    failNext('upsert', 'user_recents')
    renderApp(`/p/${READINGS}`)

    await screen.findByRole('heading', { level: 1, name: 'Leituras' })
    await waitFor(() => {
      expect(fakeDb.selects.filter((table) => table === 'user_recents').length).toBeGreaterThan(1)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fakeDb.tables.user_recents).toHaveLength(0)
  })

  it('trims what is older than the 50th visit once the list is full', async () => {
    const old = Array.from({ length: RECENTS_KEPT }, (_, index) => ({
      pageId: fakeId(500 + index),
      visitedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    }))
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      { id: READINGS, title: 'Leituras', sortKey: 'a0' },
      ...old.map((entry, index) => ({
        id: entry.pageId,
        title: `Antiga ${String(index)}`,
        sortKey: `b${String(index)}`,
      })),
    ])
    seedRecents(old)
    renderApp(`/p/${READINGS}`)

    await waitFor(() => {
      expect(fakeDb.writes.some((w) => w.table === 'user_recents' && w.op === 'delete')).toBe(true)
    })
    expect(fakeDb.tables.user_recents).toHaveLength(RECENTS_KEPT)
    const ids = fakeDb.tables.user_recents.map((row) => row.page_id)
    expect(ids).toContain(READINGS)
    expect(ids).not.toContain(old[0]?.pageId)
  })
})
