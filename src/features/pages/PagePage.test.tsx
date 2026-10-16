import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TITLE_DEBOUNCE_MS } from '@/features/pages/components/PageTitle'
import { FOCUS_TITLE_STATE } from '@/features/pages/routes'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import {
  clearFailures,
  dbPage,
  failAlways,
  failNext,
  fakeDb,
  fakeId,
  mockProfile,
  resetFakeSupabase,
  seedPages,
  seedWorkspace,
} from '@/test/fake-supabase'
import { installMatchMedia } from '@/test/match-media'
import { renderApp } from '@/test/render-app'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const HOME = fakeId(1000)
const PARENT = fakeId(1)
const CHILD = fakeId(2)
const GRAND = fakeId(3)
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  installMatchMedia(true)
  useTreeUiStore.setState({ ownerId: null, expanded: new Set(), renamingId: null, notice: null })
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    {
      id: PARENT,
      title: 'Leituras',
      sortKey: 'a0',
      icon: { type: 'emoji', value: '📚' },
    },
    { id: CHILD, parentId: PARENT, title: 'Cantinho 2026', sortKey: 'a0', lastEditedAt: ago(19) },
    { id: GRAND, parentId: CHILD, title: 'Resenhas', sortKey: 'a0' },
  ])
})

const titleField = () => screen.findByRole('textbox', { name: 'Título da página' })
const updates = () => fakeDb.writes.filter((write) => write.op === 'update')
const pageSelects = () => fakeDb.selects.filter((table) => table === 'pages').length

describe('tela da página', () => {
  it('shows icon, title as the page heading, breadcrumb with icons and "Editada há…"', async () => {
    renderApp(`/p/${CHILD}`)

    expect(await titleField()).toHaveValue('Cantinho 2026')
    expect(screen.getByRole('heading', { level: 1, name: 'Cantinho 2026' })).toBeInTheDocument()
    expect(screen.getByText('Editada há 19 dias')).toBeInTheDocument()
    expect(screen.getByText(/O editor de blocos chega na Fase 2/)).toBeInTheDocument()

    const crumbs = screen.getByRole('navigation', { name: 'Caminho da página' })
    expect(within(crumbs).getByRole('link', { name: /Leituras/ })).toHaveAttribute(
      'href',
      `/p/${PARENT}`,
    )
    expect(within(crumbs).getByText('📚')).toBeInTheDocument()
    expect(within(crumbs).getByText('Cantinho 2026').closest('li')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('collapses a deep breadcrumb on desktop and keeps only the parent on mobile', async () => {
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        id: fakeId(n),
        parentId: n === 1 ? null : fakeId(n - 1),
        title: `Nível ${String(n)}`,
        sortKey: 'a0',
      })),
    ])
    const { unmount } = renderApp(`/p/${fakeId(6)}`)

    const crumbs = await screen.findByRole('navigation', { name: 'Caminho da página' })
    expect(within(crumbs).getByRole('link', { name: 'Nível 1' })).toBeInTheDocument()
    expect(within(crumbs).getByRole('img', { name: 'Páginas anteriores' })).toHaveAttribute(
      'title',
      'Nível 2',
    )
    expect(within(crumbs).getByRole('link', { name: 'Nível 5' })).toBeInTheDocument()
    unmount()

    installMatchMedia(false)
    renderApp(`/p/${fakeId(6)}`)
    const compact = await screen.findByRole('navigation', { name: 'Caminho da página' })
    expect(within(compact).queryByRole('link', { name: 'Nível 1' })).not.toBeInTheDocument()
    expect(within(compact).getByRole('link', { name: 'Nível 5' })).toBeInTheDocument()
    expect(within(compact).getByRole('img', { name: 'Páginas anteriores' })).toHaveAttribute(
      'title',
      'Nível 1 / Nível 2 / Nível 3 / Nível 4',
    )
    // No mobile o "Editada há…" desce para o corpo.
    expect(screen.getByText(/^Editada há/)).toBeInTheDocument()
  })

  it('shows the very same screen for an invalid id, a missing page and a page you cannot see', async () => {
    const { unmount } = renderApp('/p/isso-nao-e-um-id')
    const invalid = await screen.findByRole('heading', { name: 'Página não encontrada' })
    const invalidScreen = invalid.parentElement?.innerHTML
    unmount()

    const missing = renderApp(`/p/${fakeId(999)}`)
    const missingHeading = await screen.findByRole('heading', { name: 'Página não encontrada' })
    expect(missingHeading.parentElement?.innerHTML).toBe(invalidScreen)
    missing.unmount()

    // Página que existe só em outro workspace: a RLS faz a lista e a consulta voltarem sem ela.
    renderApp(`/p/${fakeId(998)}`)
    const hidden = await screen.findByRole('heading', { name: 'Página não encontrada' })
    expect(hidden.parentElement?.innerHTML).toBe(invalidScreen)
  })

  it('treats a trashed page as not found', async () => {
    const trashed = fakeDb.tables.pages.find((row) => row.id === GRAND)
    if (trashed) trashed.trashed_at = '2026-10-01T00:00:00Z'

    renderApp(`/p/${GRAND}`)

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument()
  })

  it('tells a load failure apart from "not found" and lets you retry', async () => {
    const user = userEvent.setup()
    failAlways('select', 'pages')
    renderApp(`/p/${CHILD}`)

    expect(await screen.findByText('Não foi possível carregar a página.')).toBeInTheDocument()
    clearFailures()
    expect(screen.queryByRole('heading', { name: 'Página não encontrada' })).not.toBeInTheDocument()
    const main = screen.getByRole('main')
    await user.click(within(main).getByRole('button', { name: 'Tentar de novo' }))

    expect(await titleField()).toHaveValue('Cantinho 2026')
  })
})

describe('título da página', () => {
  it('saves once after you stop typing, and the sidebar follows without reloading the list', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderApp(`/p/${CHILD}`)
      const field = await titleField()
      await screen.findByRole('treeitem', { name: 'Leituras' })
      const selectsBefore = pageSelects()

      await user.clear(field)
      await user.type(field, 'Novo título')
      expect(updates()).toHaveLength(0)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(TITLE_DEBOUNCE_MS + 50)
      })

      await waitFor(() => {
        expect(updates()).toHaveLength(1)
      })
      expect(updates()[0]?.payload).toEqual({ title: 'Novo título' })
      expect(dbPage(CHILD)?.title).toBe('Novo título')
      // Abrir a página já mostrou o caminho na árvore: o item acompanha o título.
      expect(await screen.findByRole('treeitem', { name: 'Novo título' })).toBeInTheDocument()
      // Salvar o título não recarrega a lista de páginas.
      expect(pageSelects()).toBe(selectsBefore)
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves right away when you leave the field, then checks the list once', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    const field = await titleField()
    await screen.findByRole('treeitem', { name: 'Leituras' })
    const selectsBefore = pageSelects()

    await user.type(field, '!')
    await user.tab()

    await waitFor(() => {
      expect(updates()).toHaveLength(1)
    })
    expect(updates()[0]?.payload).toEqual({ title: 'Cantinho 2026!' })
    await waitFor(() => {
      expect(pageSelects()).toBe(selectsBefore + 1)
    })
  })

  it('saves what is pending when you leave the page', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    const field = await titleField()
    await user.type(field, '?')

    await user.click(
      within(screen.getByRole('navigation', { name: 'Caminho da página' })).getByRole('link', {
        name: /Leituras/,
      }),
    )

    await waitFor(() => {
      expect(dbPage(CHILD)?.title).toBe('Cantinho 2026?')
    })
  })

  it('keeps what you typed and warns when saving fails, then saves on the next try', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    const field = await titleField()
    failNext('update', 'pages')

    await user.type(field, '!')
    await user.tab()

    expect(await screen.findByText(/Não foi possível salvar o título/)).toBeInTheDocument()
    expect(field).toHaveValue('Cantinho 2026!')
    expect(dbPage(CHILD)?.title).toBe('Cantinho 2026')

    await user.type(field, '?')
    await user.tab()

    await waitFor(() => {
      expect(dbPage(CHILD)?.title).toBe('Cantinho 2026!?')
    })
    expect(screen.queryByText(/Não foi possível salvar o título/)).not.toBeInTheDocument()
  })

  it('does not accept line breaks: Enter just leaves the field', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    const field = await titleField()

    await user.type(field, '!{Enter}')

    expect(field).not.toHaveFocus()
    expect(field).toHaveValue('Cantinho 2026!')
  })

  it('changes the icon and can remove it', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${PARENT}`)
    await titleField()

    await user.click(screen.getByRole('button', { name: 'Alterar ícone da página' }))
    let dialog = await screen.findByRole('dialog', { name: 'Escolher ícone' })
    await user.click(within(dialog).getByRole('button', { name: 'Usar 🌿' }))
    await waitFor(() => {
      expect(dbPage(PARENT)?.icon).toEqual({ type: 'emoji', value: '🌿' })
    })

    await user.click(screen.getByRole('button', { name: 'Alterar ícone da página' }))
    dialog = await screen.findByRole('dialog', { name: 'Escolher ícone' })
    await user.click(within(dialog).getByRole('button', { name: 'Remover ícone' }))
    await waitFor(() => {
      expect(dbPage(PARENT)?.icon).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'Adicionar ícone' })).toBeInTheDocument()
  })

  it('is read-only for viewers: plain heading, no icon button', async () => {
    seedWorkspace({ role: 'viewer', homePageId: HOME })
    renderApp(`/p/${PARENT}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Leituras' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Título da página' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ícone/i })).not.toBeInTheDocument()
  })
})

describe('foco do título em página nova', () => {
  const openNewPage = () => renderApp({ pathname: `/p/${CHILD}`, state: FOCUS_TITLE_STATE })

  it('keeps taking the focus back for a moment, until the user does something', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      openNewPage()
      const field = await titleField()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(field).toHaveFocus()

      // Algo (a gaveta do mobile) tira o foco: o título insiste em pegá-lo de volta.
      act(() => {
        field.blur()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150)
      })
      expect(field).toHaveFocus()

      // O usuário agiu (abriu o "Renomear" da sidebar, por exemplo): o foco não é mais roubado.
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        field.blur()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(field).not.toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('título da página ao sair', () => {
  const okResponse = () =>
    new Response(JSON.stringify([{ id: CHILD }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  const fetchMock = vi.fn<typeof fetch>()
  const keepaliveCalls = () => fetchMock.mock.calls

  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  }
  const hidePage = () => {
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  }
  /** Tenta sair da página e diz se o aviso do navegador foi pedido. */
  const triesToLeave = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => Promise.resolve(okResponse()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto-ficticio.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-ficticia')
  })

  afterEach(() => {
    setVisibility('visible')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('saves right away, once, when the page is hidden, using keepalive without the token in the URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderApp(`/p/${CHILD}`)
      const field = await titleField()
      await user.type(field, '!')

      hidePage()
      window.dispatchEvent(new Event('pagehide'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TITLE_DEBOUNCE_MS + 50)
      })

      await waitFor(() => {
        expect(keepaliveCalls()).toHaveLength(1)
      })
      const [input, init] = keepaliveCalls()[0] ?? []
      const url = input instanceof URL ? input.href : ''
      expect(url).toContain(`/rest/v1/pages?id=eq.${CHILD}`)
      expect(url).not.toContain('token')
      expect(init).toMatchObject({ method: 'PATCH', keepalive: true })
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-ficticio')
      expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
        title: 'Cantinho 2026!',
      })
      // Nem o debounce nem o pagehide repetem o salvamento que já foi enviado.
      expect(updates()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves right away on pagehide alone', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    await user.type(await titleField(), '?')

    window.dispatchEvent(new Event('pagehide'))

    await waitFor(() => {
      expect(keepaliveCalls()).toHaveLength(1)
    })
  })

  it('does nothing when the page is hidden with nothing pending', async () => {
    renderApp(`/p/${CHILD}`)
    await titleField()

    hidePage()
    window.dispatchEvent(new Event('pagehide'))

    expect(triesToLeave()).toBe(false)
    expect(keepaliveCalls()).toHaveLength(0)
    expect(updates()).toHaveLength(0)
  })

  it('asks the browser to confirm leaving only while there is something to save', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    const field = await titleField()
    expect(triesToLeave()).toBe(false)

    await user.type(field, '!')
    expect(triesToLeave()).toBe(true)

    await waitFor(() => {
      expect(triesToLeave()).toBe(false)
    })
    // O aviso já disparou o envio; depois dele não sobra pendência.
    expect(keepaliveCalls()).toHaveLength(1)
  })

  it('keeps the text pending and the warning on when saving fails, until a save works', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    renderApp(`/p/${CHILD}`)
    const field = await titleField()
    await user.type(field, '!')

    window.dispatchEvent(new Event('pagehide'))

    expect(await screen.findByText(/Não foi possível salvar o título/)).toBeInTheDocument()
    expect(field).toHaveValue('Cantinho 2026!')
    expect(triesToLeave()).toBe(true)

    fetchMock.mockImplementation(() => Promise.resolve(okResponse()))
    await waitFor(() => {
      window.dispatchEvent(new Event('pagehide'))
      expect(screen.queryByText(/Não foi possível salvar o título/)).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(triesToLeave()).toBe(false)
    })
  })

  it('removes the warning when the title goes back to what was saved', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${CHILD}`)
    const field = await titleField()

    await user.type(field, '!')
    await user.type(field, '{Backspace}')
    await user.tab()

    await waitFor(() => {
      expect(triesToLeave()).toBe(false)
    })
    expect(updates()).toHaveLength(0)
  })
})

describe('página inicial', () => {
  it('creates "Página inicial" the first time and records it as the home page', async () => {
    seedWorkspace({ homePageId: null })
    seedPages([])

    renderApp('/')

    expect(await titleField()).toHaveValue('Página inicial')
    const created = fakeDb.writes.filter((write) => write.op === 'insert')
    expect(created).toHaveLength(1)
    expect(created[0]?.payload).toMatchObject({ title: 'Página inicial', parent_id: null })
    expect(fakeDb.tables.workspaces[0]?.home_page_id).toBe(created[0]?.payload?.id)
  })

  it('does not create a second one when it already exists', async () => {
    renderApp('/')

    expect(await titleField()).toHaveValue('Página inicial')
    expect(fakeDb.writes.filter((write) => write.op === 'insert')).toHaveLength(0)
  })

  it('only the owner creates it: an editor sees a message and nothing is written', async () => {
    seedWorkspace({ role: 'editor', homePageId: null })
    seedPages([])

    renderApp('/')

    expect(
      await screen.findByText('Este workspace ainda não tem uma página inicial.'),
    ).toBeInTheDocument()
    expect(fakeDb.writes).toHaveLength(0)
  })

  it('shows an error with retry when creating fails', async () => {
    const user = userEvent.setup()
    seedWorkspace({ homePageId: null })
    seedPages([])
    failNext('insert', 'pages')

    renderApp('/')

    expect(await screen.findByText('Não foi possível carregar a página.')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('main')).getByRole('button', { name: 'Tentar de novo' }),
    )
    expect(await titleField()).toHaveValue('Página inicial')
  })
})
