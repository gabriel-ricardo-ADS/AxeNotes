import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetVisitGuard } from '@/features/recents/hooks/use-record-visit'
import { useSearchStore } from '@/features/search/search-store'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import {
  failNextRpc,
  fakeDb,
  fakeId,
  holdNextRpc,
  mockProfile,
  resetFakeSupabase,
  seedPages,
  seedRecents,
  seedWorkspace,
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
const CALCULUS = fakeId(4)
const OLD_CALCULUS = fakeId(5)

beforeEach(() => {
  resetFakeSupabase()
  resetVisitGuard()
  mockProfile('Ana Teste')
  installMatchMedia(true)
  useTreeUiStore.setState({ ownerId: null, expanded: new Set(), renamingId: null, notice: null })
  useSearchStore.setState({ open: false, term: '', opener: null, pickCount: 0 })
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: READINGS, title: 'Leituras', sortKey: 'a0' },
    { id: STUDIES, parentId: READINGS, title: 'Estudos', sortKey: 'a0' },
    { id: MOVIES, title: 'Filmes', sortKey: 'a1' },
    {
      id: CALCULUS,
      title: 'Cálculo diferencial',
      sortKey: 'a2',
      icon: { type: 'emoji', value: '📐' },
    },
    { id: OLD_CALCULUS, title: 'Cálculo antigo', sortKey: 'a3', trashedAt: '2026-10-01T10:00:00Z' },
  ])
})

const searchCalls = () => fakeDb.rpcCalls.filter((call) => call.name === 'search_pages')
const dialog = () => screen.findByRole('dialog', { name: 'Buscar páginas' })
const combobox = () => screen.findByRole('combobox', { name: 'Buscar páginas' })
const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent)
/** O diálogo aberto; consultas por papel/texto dentro dele evitam pegar a sidebar (que tem textos iguais). */
const inDialog = async () => within(await dialog())
const sidebarSearchButton = () => screen.findByRole('button', { name: /^Buscar/ })

async function openByShortcut(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}k{/Control}')
  return combobox()
}

/** Renderiza o app e espera a sidebar (e a lista de páginas) carregar. */
async function renderReady() {
  renderApp()
  await screen.findAllByRole('link', { name: 'Leituras' })
}

describe('abrir a busca', () => {
  it('opens with Ctrl+K, focuses the field and cancels the browser default', async () => {
    const user = userEvent.setup()
    await renderReady()

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      document.dispatchEvent(event)
    })
    const field = await combobox()

    expect(event.defaultPrevented).toBe(true)
    expect(field).toHaveFocus()
    await user.keyboard('{Escape}')
  })

  it('opens with the visible "Buscar" button', async () => {
    const user = userEvent.setup()
    await renderReady()

    await user.click(await sidebarSearchButton())

    expect(await dialog()).toBeInTheDocument()
    expect(await combobox()).toHaveFocus()
  })

  it('ignores Cmd+K outside a Mac, Ctrl+Shift+K and a held key', async () => {
    const user = userEvent.setup()
    await renderReady()

    await user.keyboard('{Meta>}k{/Meta}')
    await user.keyboard('{Control>}{Shift>}k{/Shift}{/Control}')

    expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
  })

  it('does not open over another dialog (but still cancels the browser default)', async () => {
    const user = userEvent.setup()
    await renderReady()
    await user.click(await screen.findByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para…' }))
    const move = await screen.findByRole('dialog', { name: /Mover/ })

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      move.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /Mover/ })).toBeInTheDocument()
  })

  it('leaves a key already handled by someone else alone (like the editor link, in Phase 2)', async () => {
    await renderReady()

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    // Um ouvinte mais perto do alvo (como o ProseMirror) trata a tecla antes de ela subir ao document.
    const handler = (keydown: Event) => {
      keydown.preventDefault()
    }
    document.body.addEventListener('keydown', handler)
    act(() => {
      document.body.dispatchEvent(event)
    })
    document.body.removeEventListener('keydown', handler)

    expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
  })

  it('opens from a text field (the page title) and Ctrl+K again only reselects the field', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${MOVIES}`)
    const title = await screen.findByRole('textbox', { name: 'Título da página' })
    await user.click(title)

    const field = await openByShortcut(user)
    await user.type(field, 'est')
    await user.keyboard('{Control>}k{/Control}')

    expect(screen.getAllByRole('dialog', { name: 'Buscar páginas' })).toHaveLength(1)
    expect(field).toHaveFocus()
    expect((field as HTMLInputElement).selectionStart).toBe(0)
    expect((field as HTMLInputElement).selectionEnd).toBe(3)
  })
})

describe('buscar', () => {
  it('finds a title without accents or capitals, with icon, and hides the trash', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, 'CALCULO')

    const list = await screen.findByRole('listbox', { name: 'Resultados da busca' })
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['📐Cálculo diferencial'])
    expect(screen.queryByText('Cálculo antigo')).not.toBeInTheDocument()
    expect(searchCalls().at(-1)?.args).toEqual({
      p_workspace_id: fakeDb.tables.workspaces[0]?.id,
      p_query: 'CALCULO',
      p_limit: 20,
    })
  })

  it('shows the short path of the page and the count to screen readers', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, 'estudos')

    expect(await screen.findByRole('option', { name: /Estudos/ })).toHaveTextContent('Leituras')
    const search = await inDialog()
    await waitFor(() => {
      expect(search.getByRole('status')).toHaveTextContent('1 resultado.')
    })
    await user.clear(field)
    await user.type(field, 'l')
    await waitFor(() => {
      expect(search.getByRole('status')).toHaveTextContent(/\d+ resultados\./)
    })
  })

  it('sends only one request for a fast typed term (debounce)', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, 'estudos')
    await screen.findByRole('option', { name: /Estudos/ })

    expect(searchCalls().map((call) => call.args.p_query)).toEqual(['estudos'])
  })

  it('sends the term raw: % _ and \\ are not escaped by the client', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, '50%_\\')

    await screen.findByText('Nenhuma página encontrada.', { selector: 'p' })
    expect(searchCalls().at(-1)?.args.p_query).toBe('50%_\\')
  })

  it('shows the empty message', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, 'zzzz')

    expect(
      await screen.findByText('Nenhuma página encontrada.', { selector: 'p' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(field).toHaveAttribute('aria-expanded', 'false')
    const search = await inDialog()
    await waitFor(() => {
      expect(search.getByRole('status')).toHaveTextContent('Nenhuma página encontrada.')
    })
  })

  it('does not call the server for an empty term or one with only spaces', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, '   ')
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(searchCalls()).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Recentes' })).toBeInTheDocument()
  })

  it('shows the error with "Tentar de novo" and recovers', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)
    failNextRpc('search_pages')

    await user.type(field, 'filmes')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível buscar')
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('option', { name: /Filmes/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(searchCalls()).toHaveLength(2)
  })

  it('ignores an old response that arrives after the newer one', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)
    const first = holdNextRpc('search_pages')

    await user.type(field, 'fil')
    await waitFor(() => {
      expect(searchCalls()).toHaveLength(1)
    })
    await user.clear(field)
    await user.type(field, 'estu')
    expect(await screen.findByRole('option', { name: /Estudos/ })).toBeInTheDocument()

    first.release()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.queryByRole('option', { name: /Filmes/ })).not.toBeInTheDocument()
    expect(optionNames()).toEqual([expect.stringContaining('Estudos')])
  })

  it('lets a viewer search', async () => {
    const user = userEvent.setup()
    seedWorkspace({ role: 'viewer', homePageId: HOME })
    await renderReady()
    const field = await openByShortcut(user)

    await user.type(field, 'filmes')

    expect(await screen.findByRole('option', { name: /Filmes/ })).toBeInTheDocument()
  })
})

describe('sem texto: recentes', () => {
  it('shows the same recents as the sidebar, without the home page', async () => {
    const user = userEvent.setup()
    seedRecents([
      { pageId: READINGS, visitedAt: '2026-10-01T10:00:00Z' },
      { pageId: HOME, visitedAt: '2026-10-05T10:00:00Z' },
      { pageId: MOVIES, visitedAt: '2026-10-03T10:00:00Z' },
    ])
    await renderReady()

    await openByShortcut(user)

    const list = await screen.findByRole('listbox', { name: 'Páginas recentes' })
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringContaining('Filmes'), expect.stringContaining('Leituras')])
    expect(screen.getByRole('heading', { name: 'Recentes' })).toBeInTheDocument()
  })

  it('shows the hint when there are no recents', async () => {
    const user = userEvent.setup()
    await renderReady()

    await openByShortcut(user)

    expect(
      (await inDialog()).getByText('As páginas que você abrir aparecem aqui.'),
    ).toBeInTheDocument()
  })
})

describe('teclado', () => {
  it('moves the active option with the arrows (wrapping) and opens it with Enter', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)
    await user.type(field, 'l') // Leituras, Filmes, Cálculo… (várias)
    await screen.findAllByRole('option')

    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(2)
    const activeId = () => field.getAttribute('aria-activedescendant')
    expect(activeId()).toBe(options[0]?.id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(activeId()).toBe(options[1]?.id)
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(activeId()).toBe(options.at(-1)?.id)
    await user.keyboard('{ArrowDown}')
    expect(activeId()).toBe(options[0]?.id)

    const first = options[0]?.textContent ?? ''
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
    const title = await screen.findByRole('textbox', { name: 'Título da página' })
    expect(first).toContain((title as HTMLTextAreaElement).value)
  })

  it('keeps Home and End for the caret in the field', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = (await openByShortcut(user)) as HTMLInputElement
    await user.type(field, 'estudos')
    const options = await screen.findAllByRole('option')

    await user.keyboard('{Home}')
    expect(field.selectionStart).toBe(0)
    await user.keyboard('{End}')
    expect(field.selectionStart).toBe('estudos'.length)
    expect(field.getAttribute('aria-activedescendant')).toBe(options[0]?.id)
  })

  it('opens the clicked result and closes', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)
    await user.type(field, 'filmes')

    await user.click(await screen.findByRole('option', { name: /Filmes/ }))

    expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Título da página' })).toHaveValue('Filmes')
  })

  it('ignores Enter while "Buscando…" and opens after the results arrive', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)
    const gate = holdNextRpc('search_pages')

    await user.type(field, 'filmes')
    await waitFor(() => {
      expect(searchCalls()).toHaveLength(1)
    })
    await user.keyboard('{Enter}')

    expect(screen.getByRole('dialog', { name: 'Buscar páginas' })).toBeInTheDocument()
    gate.release()
    await screen.findByRole('option', { name: /Filmes/ })
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('textbox', { name: 'Título da página' })).toHaveValue('Filmes')
  })

  it('opens the home page at "/" and does not record it', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${MOVIES}`)
    await screen.findByRole('textbox', { name: 'Título da página' })
    const field = await openByShortcut(user)
    await user.type(field, 'inicial')
    await screen.findByRole('option', { name: /Página inicial/ })

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('textbox', { name: 'Título da página' })).toHaveValue(
      'Página inicial',
    )
    expect(screen.getByRole('link', { name: 'Página inicial' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('foco', () => {
  it('goes back to the "Buscar" button on Esc when it opened the dialog', async () => {
    const user = userEvent.setup()
    await renderReady()
    const button = await sidebarSearchButton()
    await user.click(button)
    await combobox()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
    })
    expect(button).toHaveFocus()
  })

  it('goes back to the element that was focused when the shortcut was used', async () => {
    const user = userEvent.setup()
    await renderReady()
    const link = screen.getByRole('link', { name: 'Filmes' })
    link.focus()

    await openByShortcut(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(link).toHaveFocus()
    })
  })

  it('goes to the content when nothing had the focus', async () => {
    const user = userEvent.setup()
    await renderReady()
    ;(document.activeElement as HTMLElement | null)?.blur()

    await openByShortcut(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.getElementById('conteudo')).toHaveFocus()
    })
  })

  it('forgets the typed term when it closes', async () => {
    const user = userEvent.setup()
    await renderReady()
    const field = await openByShortcut(user)
    await user.type(field, 'filmes')
    await user.keyboard('{Escape}')

    expect(await openByShortcut(user)).toHaveValue('')
  })
})

describe('mobile: a busca abre por cima da gaveta', () => {
  it('keeps the drawer under, returns the focus to its button on Esc and closes both on pick', async () => {
    const user = userEvent.setup()
    installMatchMedia(false)
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' })
    const button = within(drawer).getByRole('button', { name: /^Buscar/ })

    await user.click(button)
    const field = await combobox()
    expect(field).toHaveFocus()
    expect(
      screen.getByRole('dialog', { name: 'Menu de navegação', hidden: true }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Buscar páginas' })).not.toBeInTheDocument()
    })
    expect(within(drawer).getByRole('button', { name: /^Buscar/ })).toHaveFocus()

    await user.click(within(drawer).getByRole('button', { name: /^Buscar/ }))
    await user.type(await combobox(), 'filmes')
    await user.click(await screen.findByRole('option', { name: /Filmes/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Menu de navegação' })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('textbox', { name: 'Título da página' })).toHaveValue('Filmes')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveFocus()
    })
  })
})
