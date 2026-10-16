import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  dbPage,
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
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'

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
  useTreeUiStore.setState({
    ownerId: null,
    expanded: new Set(),
    renamingId: null,
    notice: null,
  })
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: READINGS, title: 'Leituras', sortKey: 'a0' },
    { id: STUDIES, parentId: READINGS, title: 'Estudos', sortKey: 'a0' },
    { id: MOVIES, title: 'Filmes', sortKey: 'a1' },
  ])
})

async function treeitem(name: string) {
  return screen.findByRole('treeitem', { name })
}

describe('árvore de páginas na sidebar', () => {
  it('shows the root pages (without the home page) as a tree, children hidden', async () => {
    renderApp()

    expect(await treeitem('Leituras')).toHaveAttribute('aria-level', '1')
    expect(await treeitem('Filmes')).toBeInTheDocument()
    expect(screen.getByRole('tree', { name: 'Árvore de páginas' })).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: 'Página inicial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: 'Estudos' })).not.toBeInTheDocument()
  })

  it('expands and collapses with aria-expanded, and does not touch localStorage', async () => {
    const user = userEvent.setup()
    renderApp()
    const readings = await treeitem('Leituras')
    expect(readings).toHaveAttribute('aria-expanded', 'false')
    expect(await treeitem('Filmes')).not.toHaveAttribute('aria-expanded')

    await user.click(screen.getByRole('button', { name: 'Expandir Leituras' }))

    expect(readings).toHaveAttribute('aria-expanded', 'true')
    expect(await treeitem('Estudos')).toHaveAttribute('aria-level', '2')

    await user.click(screen.getByRole('button', { name: 'Recolher Leituras' }))
    expect(screen.queryByRole('treeitem', { name: 'Estudos' })).not.toBeInTheDocument()
    expect(localStorage.length).toBe(0)
  })

  it('creates a root page with only the allowed columns and opens it with the title focused', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Leituras')

    await user.click(screen.getByRole('button', { name: 'Nova página' }))

    // A rota troca da página inicial para a nova: espera o campo ficar vazio e focado.
    await waitFor(() => {
      const title = screen.getByRole('textbox', { name: 'Título da página' })
      expect(title).toHaveValue('')
      expect(title).toHaveFocus()
    })
    const insert = fakeDb.writes.find((write) => write.op === 'insert')
    expect(Object.keys(insert?.payload ?? {}).sort()).toEqual([
      'created_by',
      'icon',
      'id',
      'parent_id',
      'sort_key',
      'title',
      'workspace_id',
    ])
    expect(insert?.payload).toMatchObject({ parent_id: null, title: '', created_by: 'user-1' })
    expect(String(insert?.payload?.sort_key) > 'a1').toBe(true)
    expect(await treeitem('Sem título')).toBeInTheDocument()
  })

  it('creates a subpage at the end of its parent and expands the parent', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Leituras')

    await user.click(screen.getByRole('button', { name: 'Nova subpágina em Leituras' }))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('')
    })
    const insert = fakeDb.writes.find((write) => write.op === 'insert')
    expect(insert?.payload).toMatchObject({ parent_id: READINGS })
    expect(String(insert?.payload?.sort_key) > 'a0').toBe(true)
    expect(await treeitem('Leituras')).toHaveAttribute('aria-expanded', 'true')
  })

  it('renames from the row menu with Enter, and cancels with Esc', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Filmes')

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const field = await screen.findByRole('textbox', { name: 'Novo nome da página' })
    await user.clear(field)
    await user.type(field, 'Cinema{Enter}')

    expect(await treeitem('Cinema')).toBeInTheDocument()
    await waitFor(() => {
      expect(dbPage(MOVIES)?.title).toBe('Cinema')
    })
    expect(fakeDb.writes.find((write) => write.op === 'update')?.payload).toEqual({ title: 'Cinema' })

    await user.click(screen.getByRole('button', { name: 'Mais ações de Cinema' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const again = await screen.findByRole('textbox', { name: 'Novo nome da página' })
    await user.type(again, 'xyz{Escape}')

    expect(await treeitem('Cinema')).toBeInTheDocument()
    expect(dbPage(MOVIES)?.title).toBe('Cinema')
  })

  it('changes the icon from the row menu', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Filmes')

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Alterar ícone' }))
    const dialog = await screen.findByRole('dialog', { name: 'Escolher ícone' })
    await user.click(within(dialog).getByRole('button', { name: 'Usar 🎬' }))

    await waitFor(() => {
      expect(dbPage(MOVIES)?.icon).toEqual({ type: 'emoji', value: '🎬' })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves a page with "Mover para…", greying out itself and its descendants', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Expandir Leituras' }))

    // "Leituras" não pode ir para dentro dela mesma nem de "Estudos".
    await user.click(screen.getByRole('button', { name: 'Mais ações de Leituras' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para…' }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Leituras' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Estudos' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Filmes' })).toBeEnabled()
    await user.keyboard('{Escape}')

    // "Filmes" vai para dentro de "Leituras", depois de "Estudos".
    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para…' }))
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Leituras' }))

    await waitFor(() => {
      expect(dbPage(MOVIES)?.parent_id).toBe(READINGS)
    })
    expect(String(dbPage(MOVIES)?.sort_key) > 'a0').toBe(true)
    expect(fakeDb.writes.find((write) => write.op === 'update')?.payload).toHaveProperty('sort_key')
    expect(Object.keys(fakeDb.writes.find((write) => write.op === 'update')?.payload ?? {}).sort()).toEqual([
      'parent_id',
      'sort_key',
    ])
    expect((await treeitem('Filmes')).getAttribute('aria-level')).toBe('2')
  })

  it('moves a page to the root from the dialog', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Expandir Leituras' }))

    await user.click(screen.getByRole('button', { name: 'Mais ações de Estudos' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para…' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Raiz (sem página pai)' }),
    )

    await waitFor(() => {
      expect(dbPage(STUDIES)?.parent_id).toBeNull()
    })
    expect((await treeitem('Estudos')).getAttribute('aria-level')).toBe('1')
  })
})

describe('árvore com falhas', () => {
  it('takes the optimistic page back and warns when creating fails', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Leituras')
    failNext('insert', 'pages')

    await user.click(screen.getByRole('button', { name: 'Nova página' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível criar a página. Tente novamente.')
    expect(screen.queryByRole('treeitem', { name: 'Sem título' })).not.toBeInTheDocument()
    // Continua na página inicial: nada foi aberto.
    expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('Página inicial')

    await user.click(screen.getByRole('button', { name: 'Dispensar aviso' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('puts the old name back and warns when renaming fails', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Filmes')
    failNext('update', 'pages')

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const field = await screen.findByRole('textbox', { name: 'Novo nome da página' })
    await user.clear(field)
    await user.type(field, 'Cinema{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível renomear a página.')
    expect(await treeitem('Filmes')).toBeInTheDocument()
    expect(dbPage(MOVIES)?.title).toBe('Filmes')
  })

  it('treats an update that reaches no row (blocked by RLS or deleted elsewhere) as a failure', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Filmes')
    // Outra aba apagou a página: o UPDATE do banco não dá erro, só não atinge linha nenhuma.
    fakeDb.tables.pages = fakeDb.tables.pages.filter((row) => row.id !== MOVIES)

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const field = await screen.findByRole('textbox', { name: 'Novo nome da página' })
    await user.clear(field)
    await user.type(field, 'Cinema{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível renomear a página.')
    // A lista é recarregada do servidor depois da falha: a página apagada em outra aba some.
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'Filmes' })).not.toBeInTheDocument()
    })
  })

  it('puts the page back where it was when moving fails', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Filmes')
    failNext('update', 'pages')

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para…' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leituras' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível mover a página.')
    expect((await treeitem('Filmes')).getAttribute('aria-level')).toBe('1')
    expect(dbPage(MOVIES)?.parent_id).toBeNull()
  })

  it('shows an error with retry when the list does not load', async () => {
    const user = userEvent.setup()
    failNext('select', 'pages')
    renderApp()

    expect(await screen.findByText('Não foi possível carregar as páginas.')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    await user.click(within(nav).getByRole('button', { name: 'Tentar de novo' }))

    expect(await treeitem('Leituras')).toBeInTheDocument()
  })
})

describe('árvore: teclado', () => {
  it('moves with arrows, expands with → / Space, opens with Enter and renames with F2', async () => {
    const user = userEvent.setup()
    renderApp()
    const readings = await treeitem('Leituras')
    const movies = await treeitem('Filmes')

    readings.focus()
    await user.keyboard('{ArrowDown}')
    expect(movies).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(readings).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(readings).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowRight}')
    expect(await treeitem('Estudos')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(readings).toHaveFocus()
    await user.keyboard(' ')
    expect(readings).toHaveAttribute('aria-expanded', 'false')

    await user.keyboard('{End}')
    expect(movies).toHaveFocus()
    await user.keyboard('{Home}')
    expect(readings).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(await screen.findByRole('textbox', { name: 'Título da página' })).toHaveValue('Leituras')

    ;(await treeitem('Filmes')).focus()
    await user.keyboard('{F2}')
    expect(await screen.findByRole('textbox', { name: 'Novo nome da página' })).toHaveValue('Filmes')
  })

  it('has a single tab stop (roving tabindex) and marks the open page as selected', async () => {
    renderApp(`/p/${MOVIES}`)
    const movies = await treeitem('Filmes')

    expect(movies).toHaveAttribute('aria-selected', 'true')
    expect(movies).toHaveAttribute('tabindex', '0')
    expect(await treeitem('Leituras')).toHaveAttribute('tabindex', '-1')
  })

  it('opens a page nested under a collapsed ancestor and reveals it in the tree', async () => {
    renderApp(`/p/${STUDIES}`)

    const studies = await treeitem('Estudos')
    expect(studies).toHaveAttribute('aria-selected', 'true')
    expect(await treeitem('Leituras')).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('árvore na gaveta (mobile)', () => {
  it('reveals the open page when the drawer is opened after loading', async () => {
    installMatchMedia(false)
    const user = userEvent.setup()
    renderApp(`/p/${STUDIES}`)
    await screen.findByRole('textbox', { name: 'Título da página' })

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))

    expect(await treeitem('Estudos')).toHaveAttribute('aria-selected', 'true')
    expect(await treeitem('Leituras')).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('árvore para quem só lê (viewer)', () => {
  beforeEach(() => {
    seedWorkspace({ role: 'viewer', homePageId: HOME })
  })

  it('shows the tree but none of the create, rename, move or icon actions', async () => {
    renderApp()

    expect(await treeitem('Leituras')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova página' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nova subpágina/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Arrastar/ })).not.toBeInTheDocument()
    // Ainda dá para expandir.
    expect(screen.getByRole('button', { name: 'Expandir Leituras' })).toBeInTheDocument()
  })

  it('does not rename with F2', async () => {
    const user = userEvent.setup()
    renderApp()
    ;(await treeitem('Filmes')).focus()

    await user.keyboard('{F2}')

    expect(screen.queryByRole('textbox', { name: 'Novo nome da página' })).not.toBeInTheDocument()
  })
})

describe('árvore vazia', () => {
  it('explains how to create the first page', async () => {
    seedPages([{ id: HOME, title: 'Página inicial', sortKey: 'a0' }])
    renderApp()

    expect(
      await screen.findByText('Nenhuma página ainda. Use o botão + para criar a primeira.'),
    ).toBeInTheDocument()
  })
})
