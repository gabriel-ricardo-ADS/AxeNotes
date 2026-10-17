import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import {
  clearFailures,
  dbPage,
  failAlways,
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
const LIVE = fakeId(1) // Leituras, fora da lixeira
const RECIPES = fakeId(2) // raiz na lixeira, com 2 descendentes que saíram junto
const SWEETS = fakeId(3)
const CAKES = fakeId(4)
const NOTE = fakeId(5) // sob uma página viva
const PARENT = fakeId(6) // pai lixeado depois do filho
const CHILD = fakeId(7) // filho lixeado ANTES do pai
const ORPHAN = fakeId(8) // lixeada ontem, sem pai

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  installMatchMedia(true)
  useTreeUiStore.setState({ ownerId: null, expanded: new Set(), renamingId: null, notice: null })
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: LIVE, title: 'Leituras', sortKey: 'a0' },
    {
      id: RECIPES,
      title: 'Receitas',
      sortKey: 'a1',
      icon: { type: 'emoji', value: '🍰' },
      trashedAt: daysAgo(3),
    },
    { id: SWEETS, parentId: RECIPES, title: 'Doces', sortKey: 'a0', trashedAt: daysAgo(3) },
    { id: CAKES, parentId: SWEETS, title: 'Bolos', sortKey: 'a0', trashedAt: daysAgo(3) },
    { id: NOTE, parentId: LIVE, title: 'Resenha antiga', sortKey: 'a0', trashedAt: daysAgo(5) },
    { id: PARENT, title: 'Projeto', sortKey: 'a2', trashedAt: daysAgo(1) },
    { id: CHILD, parentId: PARENT, title: 'Tarefa', sortKey: 'a0', trashedAt: daysAgo(2) },
  ])
  // Garante o carimbo igual para quem saiu junto (daysAgo(3) é chamado várias vezes).
  const stamp = dbPage(RECIPES)?.trashed_at
  for (const id of [SWEETS, CAKES]) {
    const row = dbPage(id)
    if (row) row.trashed_at = stamp
  }
})

const main = () => screen.getByRole('main')
const trashList = () => screen.findByRole('list', { name: 'Páginas na lixeira' })
const rowOf = async (title: string) => {
  const list = await trashList()
  const item = within(list)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText(title, { selector: 'p' }))
  if (!item) throw new Error(`sem linha para ${title}`)
  return item
}
const pagesLoads = () => fakeDb.selects.filter((table) => table === 'pages').length

describe('tela /lixeira', () => {
  it('lists only the roots, newest first, with when, subpages and where they came from', async () => {
    renderApp('/lixeira')

    const list = await trashList()
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getAllByText(/./, { selector: 'p' })[0]?.textContent)).toEqual([
      'Projeto',
      'Tarefa',
      'Receitas',
      'Resenha antiga',
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Lixeira' })).toBeInTheDocument()

    const recipes = await rowOf('Receitas')
    expect(within(recipes).getByText('Excluída há 3 dias · +2 subpáginas')).toBeInTheDocument()
    expect(within(recipes).getByText('Origem: nível principal')).toBeInTheDocument()
    expect(within(list).queryByText('Doces')).not.toBeInTheDocument()
    expect(within(list).queryByText('Bolos')).not.toBeInTheDocument()

    const note = await rowOf('Resenha antiga')
    expect(within(note).getByText('Excluída há 5 dias')).toBeInTheDocument()
    expect(within(note).getByText('Origem: Leituras')).toBeInTheDocument()

    // Filho lixeado antes do pai: aparece à parte e não entra no "+N" do pai.
    const project = await rowOf('Projeto')
    expect(within(project).getByText('Excluída há 1 dia')).toBeInTheDocument()
    const task = await rowOf('Tarefa')
    expect(within(task).getByText('Origem: Projeto (também na lixeira)')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    seedPages([{ id: HOME, title: 'Página inicial', sortKey: 'a0' }])
    renderApp('/lixeira')

    expect(await screen.findByText('A lixeira está vazia.')).toBeInTheDocument()
  })

  it('shows a loading state before the list arrives', async () => {
    renderApp('/lixeira')

    expect(await screen.findByText('Carregando a lixeira…')).toBeInTheDocument()
    await trashList()
    expect(screen.queryByText('Carregando a lixeira…')).not.toBeInTheDocument()
  })

  it('shows a retryable error when the trash does not load', async () => {
    const user = userEvent.setup()
    failAlways('select', 'pages')
    renderApp('/lixeira')

    expect(await within(main()).findByText('Não foi possível carregar a lixeira.')).toBeInTheDocument()
    clearFailures()
    await user.click(within(main()).getByRole('button', { name: 'Tentar de novo' }))

    expect(await trashList()).toBeInTheDocument()
  })

  it('is reachable from the sidebar footer, above the account', async () => {
    const user = userEvent.setup()
    renderApp()

    const link = await screen.findByRole('link', { name: 'Lixeira' })
    const account = screen.getByRole('region', { name: 'Conta' })
    expect(link.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(link)
    expect(await screen.findByRole('heading', { level: 1, name: 'Lixeira' })).toBeInTheDocument()
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('keeps a direct link to a trashed page on the single "not found" screen', async () => {
    renderApp(`/p/${RECIPES}`)

    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })
})

describe('restaurar', () => {
  it('disables the row as "Restaurando…", then reloads pages and trash once each and shows the page again', async () => {
    const user = userEvent.setup()
    seedFavorites([{ pageId: RECIPES, sortKey: 'a0' }])
    renderApp('/lixeira')
    await trashList()
    expect(screen.queryByRole('treeitem', { name: 'Receitas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Páginas favoritas' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(pagesLoads()).toBeGreaterThan(0)
    })
    const hold = holdNextRpc('restore_page')
    const pagesBefore = pagesLoads()
    const trashBefore = fakeDb.trashLoads

    await user.click(within(await rowOf('Receitas')).getByRole('button', { name: 'Restaurar Receitas' }))

    const busy = within(await rowOf('Receitas')).getByRole('button', { name: 'Restaurar Receitas' })
    expect(busy).toHaveTextContent('Restaurando…')
    expect(busy).toBeDisabled()
    expect(
      within(await rowOf('Receitas')).getByRole('button', { name: 'Excluir Receitas definitivamente' }),
    ).toBeDisabled()

    hold.release()
    await waitFor(() => {
      expect(screen.queryByText('Receitas', { selector: 'main p' })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('treeitem', { name: 'Receitas' })).toBeInTheDocument()
    expect(pagesLoads() - pagesBefore).toBe(1)
    expect(fakeDb.trashLoads - trashBefore).toBe(1)
    // A página e as subpáginas voltaram; o favorito (que nunca saiu do banco) reaparece.
    expect([RECIPES, SWEETS, CAKES].every((id) => dbPage(id)?.trashed_at == null)).toBe(true)
    expect(
      within(await screen.findByRole('list', { name: 'Páginas favoritas' })).getByRole('link', {
        name: 'Receitas',
      }),
    ).toBeInTheDocument()
  })

  it('explains that the parent page is still in the trash and keeps the row', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()
    const trashBefore = fakeDb.trashLoads

    await user.click(within(await rowOf('Tarefa')).getByRole('button', { name: 'Restaurar Tarefa' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      'A página pai ainda está na lixeira. Restaure a página pai primeiro.',
    )
    expect(await rowOf('Tarefa')).toBeInTheDocument()
    expect(
      within(await rowOf('Tarefa')).getByRole('button', { name: 'Restaurar Tarefa' }),
    ).toBeEnabled()
    expect(fakeDb.trashLoads).toBe(trashBefore)
    expect(dbPage(CHILD)?.trashed_at).not.toBeNull()
  })

  it('lets the child be restored after the parent, which stays in the trash as its own root', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()

    await user.click(within(await rowOf('Projeto')).getByRole('button', { name: 'Restaurar Projeto' }))
    await waitFor(() => {
      expect(dbPage(PARENT)?.trashed_at).toBeNull()
    })
    // O filho (carimbo anterior) continua na lixeira e agora tem pai vivo.
    expect(dbPage(CHILD)?.trashed_at).not.toBeNull()
    const task = await rowOf('Tarefa')
    expect(within(task).getByText('Origem: Projeto')).toBeInTheDocument()

    await user.click(within(task).getByRole('button', { name: 'Restaurar Tarefa' }))
    await waitFor(() => {
      expect(dbPage(CHILD)?.trashed_at).toBeNull()
    })
  })

  it('has its own message for missing permission and a generic one for the rest', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()

    failNextRpc('restore_page', { code: '42501', message: 'forbidden' })
    await user.click(within(await rowOf('Receitas')).getByRole('button', { name: 'Restaurar Receitas' }))
    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para fazer isso neste workspace.',
    )

    failNextRpc('restore_page')
    await user.click(within(await rowOf('Receitas')).getByRole('button', { name: 'Restaurar Receitas' }))
    await waitFor(() => {
      expect(within(main()).getByRole('alert')).toHaveTextContent(
        'Não foi possível restaurar a página. Tente novamente.',
      )
    })
    await user.click(within(main()).getByRole('button', { name: 'Dispensar aviso' }))
    expect(within(main()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('excluir definitivamente', () => {
  const openDialog = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    await user.click(
      within(await rowOf(title)).getByRole('button', { name: `Excluir ${title} definitivamente` }),
    )
    return screen.findByRole('alertdialog')
  }

  it('asks first, with the focus on Cancel and the subpage count, and cancelling deletes nothing', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()

    const dialog = await openDialog(user, 'Receitas')

    expect(within(dialog).getByText('Excluir “Receitas” definitivamente?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'A página e 2 subpáginas serão apagadas para sempre. Isso não pode ser desfeito.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/aparece separada/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(dbPage(RECIPES)).toBeDefined()
    expect(fakeDb.writes.filter((write) => write.op === 'delete')).toHaveLength(0)
  })

  it('deletes the page and everything under it after confirming, then reloads the list', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()
    const trashBefore = fakeDb.trashLoads

    const dialog = await openDialog(user, 'Receitas')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir definitivamente' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByText('Receitas', { selector: 'main p' })).not.toBeInTheDocument()
    })
    expect([RECIPES, SWEETS, CAKES].every((id) => dbPage(id) === undefined)).toBe(true)
    expect(dbPage(LIVE)).toBeDefined()
    expect(fakeDb.trashLoads - trashBefore).toBe(1)
  })

  it('says part of the subpages already shows up separately and will be deleted too', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()

    const dialog = await openDialog(user, 'Projeto')

    expect(
      within(dialog).getByText(
        'A página e 1 subpágina serão apagadas para sempre. Isso não pode ser desfeito.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Parte das subpáginas já aparece separada na lixeira e também será apagada junto com esta página.',
      ),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Excluir definitivamente' }))
    await waitFor(() => {
      expect(dbPage(CHILD)).toBeUndefined()
    })
    await waitFor(() => {
      expect(screen.queryByText('Tarefa', { selector: 'main p' })).not.toBeInTheDocument()
    })
  })

  it('treats zero affected rows as an error and reloads the list', async () => {
    const user = userEvent.setup()
    renderApp('/lixeira')
    await trashList()
    const dialog = await openDialog(user, 'Receitas')
    // Outra aba restaurou a página enquanto o diálogo estava aberto.
    for (const id of [RECIPES, SWEETS, CAKES]) {
      const row = dbPage(id)
      if (row) row.trashed_at = null
    }

    await user.click(within(dialog).getByRole('button', { name: 'Excluir definitivamente' }))

    expect(await within(main()).findByRole('alert')).toHaveTextContent(
      'Não foi possível excluir a página.',
    )
    await waitFor(() => {
      expect(screen.queryByText('Receitas', { selector: 'main p' })).not.toBeInTheDocument()
    })
    expect(dbPage(RECIPES)).toBeDefined()
  })
})

describe('leitor (viewer)', () => {
  it('sees the list without restore or delete buttons', async () => {
    seedWorkspace({ role: 'viewer', homePageId: HOME })
    renderApp('/lixeira')

    const recipes = await rowOf('Receitas')
    expect(within(recipes).getByText('Excluída há 3 dias · +2 subpáginas')).toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument()
    expect(within(main()).queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument()
  })
})

describe('home page child', () => {
  it('shows the main level as the origin of a page that sat under the home page', async () => {
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      { id: ORPHAN, parentId: HOME, title: 'Ideia solta', sortKey: 'a0', trashedAt: daysAgo(1) },
    ])
    renderApp('/lixeira')

    expect(
      within(await rowOf('Ideia solta')).getByText('Origem: nível principal'),
    ).toBeInTheDocument()
  })
})
