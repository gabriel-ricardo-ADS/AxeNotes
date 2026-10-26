import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageLinkView } from '@/features/editor/blocks/page-link/PageLinkView'
import { isPageId } from '@/features/editor/blocks/page-link/page-link-id'
import {
  failAlways,
  fakeId,
  holdNext,
  mockProfile,
  resetFakeSupabase,
  seedPages,
} from '@/test/fake-supabase'
import { renderWithSession } from '@/test/render-with-session'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const HOME = fakeId(1000)
const READINGS = fakeId(1)
const OLD = fakeId(2)
const GONE = fakeId(3)

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: READINGS, title: 'Leituras', sortKey: 'a0', icon: { type: 'emoji', value: '📚' } },
    { id: OLD, title: 'Rascunho antigo', sortKey: 'a1', trashedAt: '2026-10-01T10:00:00Z' },
  ])
})

describe('PageLinkView', () => {
  it('shows the current icon and title and links to the page', async () => {
    renderWithSession(<PageLinkView pageId={READINGS} />)

    const link = await screen.findByRole('link', { name: /Leituras/ })
    expect(link).toHaveAttribute('href', `/p/${READINGS}`)
    expect(link).toHaveTextContent('📚')
  })

  it('links the home page to "/"', async () => {
    renderWithSession(<PageLinkView pageId={HOME} />)
    expect(await screen.findByRole('link', { name: /Página inicial/ })).toHaveAttribute('href', '/')
  })

  it('says "Sem título" for a page without a title', async () => {
    seedPages([
      { id: HOME, title: 'Página inicial', sortKey: 'a0' },
      { id: READINGS, title: '  ', sortKey: 'a0' },
    ])
    renderWithSession(<PageLinkView pageId={READINGS} />)
    expect(await screen.findByRole('link', { name: 'Sem título' })).toBeInTheDocument()
  })

  it('keeps a trashed page clickable, marked "na lixeira"', async () => {
    renderWithSession(<PageLinkView pageId={OLD} />)

    const link = await screen.findByRole('link', { name: 'Rascunho antigo (na lixeira)' })
    expect(link).toHaveAttribute('href', `/p/${OLD}`)
    expect(link).toHaveAttribute('data-trashed', 'true')
    expect(link).toHaveTextContent('na lixeira')
  })

  it('says "Página indisponível" (no link) for a missing page, an invalid id and an empty id', async () => {
    for (const pageId of [GONE, 'not-a-uuid', '', 'javascript:alert(1)']) {
      const view = renderWithSession(<PageLinkView pageId={pageId} />)
      expect(await screen.findByText('Página indisponível')).toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('shows "Carregando o link…" while the pages are loading', async () => {
    const gate = holdNext('select', 'pages')
    renderWithSession(<PageLinkView pageId={READINGS} />)

    expect(await screen.findByText('Carregando o link…')).toHaveAttribute('aria-busy', 'true')
    gate.release()
    expect(await screen.findByRole('link', { name: /Leituras/ })).toBeInTheDocument()
  })

  it('offers "Tentar de novo" when the page cannot be loaded', async () => {
    failAlways('select', 'pages')
    renderWithSession(<PageLinkView pageId={READINGS} />)

    expect(await screen.findByText('Não foi possível carregar o link')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  })

  it('opens the page when the link is clicked', async () => {
    renderWithSession(<PageLinkView pageId={READINGS} />)
    await userEvent.click(await screen.findByRole('link', { name: /Leituras/ }))
    expect(screen.getByTestId('location')).toHaveTextContent(`/p/${READINGS}`)
  })
})

describe('isPageId', () => {
  it('accepts only uuids', () => {
    expect(isPageId(READINGS)).toBe(true)
    expect(isPageId('')).toBe(false)
    expect(isPageId('../lixeira')).toBe(false)
    expect(isPageId(`${READINGS}"]`)).toBe(false)
  })
})
