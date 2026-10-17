import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import {
  dbPage,
  failNextRpc,
  fakeDb,
  fakeId,
  holdNextRpc,
  mockProfile,
  resetFakeSupabase,
  seedFavorites,
  seedPages,
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
const GRAND = fakeId(3)
const MOVIES = fakeId(4)

const TRASH_ERROR = 'Não foi possível mover a página para a lixeira. Tente novamente.'

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  installMatchMedia(true)
  useTreeUiStore.setState({ ownerId: null, expanded: new Set(), renamingId: null, notice: null })
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: READINGS, title: 'Leituras', sortKey: 'a0' },
    { id: STUDIES, parentId: READINGS, title: 'Estudos', sortKey: 'a0' },
    { id: GRAND, parentId: STUDIES, title: 'Resenhas', sortKey: 'a0' },
    { id: MOVIES, title: 'Filmes', sortKey: 'a1' },
  ])
})

const titleField = () => screen.findByRole('textbox', { name: 'Título da página' })
const treeitem = (name: string) => screen.findByRole('treeitem', { name })
const trashed = (id: string) => dbPage(id)?.trashed_at != null

async function trashFromRowMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: `Mais ações de ${title}` }))
  await user.click(await screen.findByRole('menuitem', { name: 'Mover para a lixeira' }))
}

/** Registra se "Página não encontrada" chegou a aparecer, mesmo que por um instante. */
function watchForNotFound() {
  let seen = false
  const observer = new MutationObserver(() => {
    if (document.body.textContent.includes('Página não encontrada')) seen = true
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return {
    stop: () => {
      observer.disconnect()
      return seen
    },
  }
}

describe('mover para a lixeira pela árvore', () => {
  it('sends the page to the trash right away, with its subpages, and leaves the tree', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Leituras')

    await trashFromRowMenu(user, 'Leituras')

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'Leituras' })).not.toBeInTheDocument()
    })
    expect(fakeDb.rpcCalls).toEqual([{ name: 'trash_page', args: { p_page_id: READINGS } }])
    expect([READINGS, STUDIES, GRAND].every(trashed)).toBe(true)
    expect(trashed(MOVIES)).toBe(false)
    expect(screen.getByRole('treeitem', { name: 'Filmes' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides favorites of the trashed pages without touching the favorite rows', async () => {
    const user = userEvent.setup()
    seedFavorites([
      { pageId: MOVIES, sortKey: 'a0' },
      { pageId: READINGS, sortKey: 'a1' },
    ])
    renderApp()
    const favorites = await screen.findByRole('list', { name: 'Páginas favoritas' })
    expect(within(favorites).getAllByRole('link')).toHaveLength(2)

    await trashFromRowMenu(user, 'Filmes')

    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Páginas favoritas' }))
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Leituras'])
    })
    expect(fakeDb.tables.user_favorites).toHaveLength(2)
  })

  it('goes to the parent page BEFORE touching the cache when the open page is trashed', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${STUDIES}`)
    expect(await titleField()).toHaveValue('Estudos')
    await treeitem('Estudos')
    const loadsBefore = fakeDb.singleLoads
    const notFound = watchForNotFound()

    await trashFromRowMenu(user, 'Estudos')

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('Leituras')
    })
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'Estudos' })).not.toBeInTheDocument()
    })
    expect(trashed(STUDIES) && trashed(GRAND)).toBe(true)
    // A página lixeada não é buscada de novo e a tela nunca mostra "não encontrada".
    expect(fakeDb.singleLoads).toBe(loadsBefore)
    expect(notFound.stop()).toBe(false)
  })

  it('goes to the home page when the trashed page contains the open one and is a root', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${GRAND}`)
    expect(await titleField()).toHaveValue('Resenhas')
    await treeitem('Resenhas')
    const notFound = watchForNotFound()

    await trashFromRowMenu(user, 'Leituras')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página inicial' })).toBeInTheDocument()
    expect(trashed(GRAND)).toBe(true)
    expect(notFound.stop()).toBe(false)
  })

  it('does not navigate when another page is trashed', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${MOVIES}`)
    expect(await titleField()).toHaveValue('Filmes')

    await trashFromRowMenu(user, 'Leituras')

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'Leituras' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('Filmes')
  })

  it('puts back only the rows it removed, reloads the list and warns when the server fails', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Leituras')
    failNextRpc('trash_page', { message: 'falha simulada' })
    const loadsBefore = fakeDb.selects.filter((table) => table === 'pages').length

    await trashFromRowMenu(user, 'Leituras')

    expect(await screen.findByRole('alert')).toHaveTextContent(TRASH_ERROR)
    expect(await treeitem('Leituras')).toBeInTheDocument()
    expect(trashed(READINGS)).toBe(false)
    await waitFor(() => {
      expect(fakeDb.selects.filter((table) => table === 'pages').length).toBeGreaterThan(loadsBefore)
    })
  })

  it('explains missing permission with its own message', async () => {
    const user = userEvent.setup()
    renderApp()
    await treeitem('Filmes')
    failNextRpc('trash_page', { code: '42501', message: 'forbidden' })

    await trashFromRowMenu(user, 'Filmes')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para fazer isso neste workspace.',
    )
    expect(await treeitem('Filmes')).toBeInTheDocument()
  })

  it('does not offer the action to a viewer', async () => {
    const user = userEvent.setup()
    seedWorkspace({ role: 'viewer', homePageId: HOME })
    renderApp()
    await treeitem('Filmes')

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))

    expect(await screen.findByRole('menuitem', { name: 'Adicionar aos favoritos' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Mover para a lixeira' })).not.toBeInTheDocument()
  })

  it('does not offer the action for a page that contains the home page', async () => {
    const user = userEvent.setup()
    // Estado que a interface não cria, mas o banco aceitaria: a inicial dentro de "Filmes".
    seedPages([
      { id: MOVIES, title: 'Filmes', sortKey: 'a1' },
      { id: HOME, parentId: MOVIES, title: 'Página inicial', sortKey: 'a0' },
      { id: READINGS, title: 'Leituras', sortKey: 'a0' },
    ])
    renderApp()
    await treeitem('Leituras')

    await user.click(screen.getByRole('button', { name: 'Mais ações de Filmes' }))
    expect(await screen.findByRole('menuitem', { name: 'Renomear' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Mover para a lixeira' })).not.toBeInTheDocument()
  })
})

describe('mover para a lixeira pelo menu da página', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Mais ações da página' }))
  }

  it('waits for the server, disables the item as "Movendo…", then goes to the parent page', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${STUDIES}`)
    expect(await titleField()).toHaveValue('Estudos')
    await treeitem('Estudos')
    const hold = holdNextRpc('trash_page')
    const notFound = watchForNotFound()

    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para a lixeira' }))

    // Ainda na página, com o item travado enquanto o servidor responde.
    const item = await screen.findByRole('menuitem', { name: 'Movendo…' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    // Com o menu aberto o resto da tela fica aria-hidden: acha o título pelo valor.
    expect(screen.getByDisplayValue('Estudos')).toBeInTheDocument()
    expect(trashed(STUDIES)).toBe(false)

    hold.release()
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('Leituras')
    })
    expect(trashed(STUDIES)).toBe(true)
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'Estudos' })).not.toBeInTheDocument()
    })
    expect(notFound.stop()).toBe(false)
  })

  it('keeps the page on screen and shows the error inside the page when the server fails', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${STUDIES}`)
    expect(await titleField()).toHaveValue('Estudos')
    failNextRpc('trash_page')

    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para a lixeira' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TRASH_ERROR)
    expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('Estudos')
    expect(await treeitem('Estudos')).toBeInTheDocument()
    expect(trashed(STUDIES)).toBe(false)
    // O erro é da página, não da sidebar (fechada no mobile).
    expect(useTreeUiStore.getState().notice).toBeNull()
  })

  it('saves a title typed just before trashing, in the write queue, with no error on the way out', async () => {
    const user = userEvent.setup()
    renderApp(`/p/${STUDIES}`)
    const title = await titleField()
    await treeitem('Estudos')

    await user.type(title, ' novos')
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para a lixeira' }))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título da página' })).toHaveValue('Leituras')
    })
    expect(dbPage(STUDIES)?.title).toBe('Estudos novos')
    expect(trashed(STUDIES)).toBe(true)
    // O renomear pendente chegou ao banco antes do RPC (fila pages-write).
    expect(fakeDb.order.indexOf('update:pages')).toBeGreaterThanOrEqual(0)
    expect(fakeDb.order.indexOf('update:pages')).toBeLessThan(fakeDb.order.indexOf('rpc:trash_page'))
    // Nem a página nova nem a sidebar mostram aviso por causa da saída.
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(useTreeUiStore.getState().notice).toBeNull()
  })

  it('has no menu on the home page', async () => {
    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: 'Página inicial' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Mais ações da página' })).not.toBeInTheDocument()
  })

  it('has no menu for a viewer', async () => {
    seedWorkspace({ role: 'viewer', homePageId: HOME })
    renderApp(`/p/${STUDIES}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Estudos' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Mais ações da página' })).not.toBeInTheDocument()
  })
})
