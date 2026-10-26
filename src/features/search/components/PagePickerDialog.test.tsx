import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PagePickerDialog } from '@/features/search/components/PagePickerDialog'
import {
  fakeId,
  mockProfile,
  resetFakeSupabase,
  seedPages,
  seedRecents,
} from '@/test/fake-supabase'
import { renderWithSession } from '@/test/render-with-session'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const HOME = fakeId(1000)
const CURRENT = fakeId(1)
const READINGS = fakeId(2)

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  seedPages([
    { id: HOME, title: 'Página inicial', sortKey: 'a0' },
    { id: CURRENT, title: 'Página aberta', sortKey: 'a0' },
    { id: READINGS, title: 'Leituras', sortKey: 'a1' },
  ])
  seedRecents([
    { pageId: CURRENT, visitedAt: '2026-10-20T10:00:00Z' },
    { pageId: READINGS, visitedAt: '2026-10-19T10:00:00Z' },
  ])
})

describe('PagePickerDialog', () => {
  it('lists the recents without the current page and hands back the picked id (no navigation)', async () => {
    const onPick = vi.fn()
    const onOpenChange = vi.fn()
    renderWithSession(
      <PagePickerDialog open onOpenChange={onOpenChange} onPick={onPick} excludeIds={[CURRENT]} />,
      `/p/${CURRENT}`,
    )

    const dialog = await screen.findByRole('dialog', { name: 'Link para página' })
    const list = await within(dialog).findByRole('listbox', { name: 'Páginas recentes' })
    expect(within(list).queryByText('Página aberta')).not.toBeInTheDocument()

    await userEvent.click(within(list).getByRole('option', { name: /Leituras/ }))
    expect(onPick).toHaveBeenCalledWith(READINGS)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByTestId('location')).toHaveTextContent(`/p/${CURRENT}`)
  })

  it('picks with the keyboard (Enter on the active option)', async () => {
    const onPick = vi.fn()
    renderWithSession(
      <PagePickerDialog open onOpenChange={vi.fn()} onPick={onPick} excludeIds={[CURRENT]} />,
    )
    const input = await screen.findByRole('combobox', { name: 'Buscar a página do link' })
    await screen.findByRole('option', { name: /Leituras/ })
    expect(input).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(READINGS)
  })
})
