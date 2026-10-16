import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/App'
import { installMatchMedia } from '@/test/match-media'

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('layout (desktop)', () => {
  beforeEach(() => {
    installMatchMedia(true)
  })

  it('shows the fixed sidebar and no menu button', () => {
    renderApp()

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Página inicial' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument()
  })

  it('renders the home page title in the content area', () => {
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Página inicial' })).toBeInTheDocument()
  })

  it('shows the not found page for unknown routes', () => {
    renderApp('/nao-existe')

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
  })
})

describe('layout (mobile)', () => {
  let media: ReturnType<typeof installMatchMedia>

  beforeEach(() => {
    media = installMatchMedia(false)
  })

  it('has no sidebar until the menu button is used', () => {
    renderApp()

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument()
  })

  it('opens the drawer from the menu button', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))

    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' })
    expect(within(drawer).getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  })

  it('closes the drawer with Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup()
    renderApp()
    const button = screen.getByRole('button', { name: 'Abrir menu' })

    await user.click(button)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes the drawer after choosing a link', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('link', { name: 'Página inicial' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('switches to the fixed sidebar when the viewport becomes wide', async () => {
    const user = userEvent.setup()
    renderApp()
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
