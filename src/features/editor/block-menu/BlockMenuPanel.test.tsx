import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MenuEntry } from '@/features/editor/block-menu/block-menu'
import { BlockMenuPanel } from '@/features/editor/block-menu/BlockMenuPanel'

const ENTRIES: MenuEntry[] = [
  {
    id: 'transform',
    label: 'Transformar em',
    aliases: [],
    icon: 'transform',
    children: [
      {
        id: 'transform:paragraph',
        label: 'Parágrafo',
        aliases: [],
        icon: 'block',
        checked: true,
        command: { kind: 'transform', type: 'paragraph' },
      },
      {
        id: 'transform:heading',
        label: 'Título 1',
        aliases: ['h1'],
        icon: 'block',
        command: { kind: 'transform', type: 'heading', props: { level: 1 } },
      },
    ],
  },
  {
    id: 'color',
    label: 'Cor',
    aliases: [],
    icon: 'color',
    children: [
      {
        id: 'color:backgroundColor:green',
        label: 'Verde',
        aliases: ['green'],
        icon: 'swatch',
        section: 'Fundo',
        group: 'Fundo',
        swatch: { prop: 'backgroundColor', color: 'green' },
        command: { kind: 'color', prop: 'backgroundColor', color: 'green' },
      },
    ],
  },
  {
    id: 'copyLink',
    label: 'Link para o bloco',
    aliases: [],
    icon: 'link',
    shortcut: 'Alt+Shift+L',
    section: '',
    command: { kind: 'copyLink' },
  },
  {
    id: 'duplicate',
    label: 'Duplicar',
    aliases: [],
    icon: 'duplicate',
    shortcut: 'Ctrl+D',
    command: { kind: 'duplicate' },
  },
  {
    id: 'remove',
    label: 'Excluir',
    aliases: [],
    icon: 'remove',
    shortcut: 'Del',
    command: { kind: 'remove' },
  },
]

function setup(focusOnOpen = true, initialSubmenu?: string) {
  const onCommand = vi.fn()
  render(
    <BlockMenuPanel
      title="Parágrafo"
      entries={ENTRIES}
      onCommand={onCommand}
      apple={false}
      touch={false}
      focusOnOpen={focusOnOpen}
      initialSubmenu={initialSubmenu}
    />,
  )
  const input = screen.getByRole('combobox', { name: 'Pesquisar ações do bloco' })
  return { onCommand, input }
}

const optionNames = () =>
  screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))

describe('BlockMenuPanel', () => {
  it('starts on the search field with the block type and every action', () => {
    const { input } = setup()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('placeholder', 'Pesquisar ações…')
    expect(screen.getByText('Parágrafo')).toBeInTheDocument()
    expect(optionNames()).toEqual([
      'Transformar em',
      'Cor',
      'Link para o bloco',
      'Duplicar',
      'Excluir',
    ])
  })

  it('can open straight into "Transformar em" ("Transformar em" of the touch bar)', async () => {
    const { onCommand } = setup(false, 'transform')
    expect(screen.getByRole('listbox', { name: 'Transformar em' })).toBeInTheDocument()
    expect(optionNames()).toEqual(['Parágrafo', 'Título 1'])
    await userEvent.click(screen.getByRole('option', { name: 'Título 1' }))
    expect(onCommand).toHaveBeenLastCalledWith({
      kind: 'transform',
      type: 'heading',
      props: { level: 1 },
    })
  })

  it('"Voltar" from the initial submenu goes to the main menu', async () => {
    setup(false, 'transform')
    await userEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(optionNames()).toHaveLength(5)
  })

  it('opens on the main menu when the submenu does not exist (block without text)', () => {
    setup(false, 'nao-existe')
    expect(optionNames()).toHaveLength(5)
  })

  it('does not take the focus on touch (the keyboard would pop up)', () => {
    const { input } = setup(false)
    expect(input).not.toHaveFocus()
  })

  it('runs each action with the mouse', async () => {
    const { onCommand } = setup()
    for (const [name, kind] of [
      ['Link para o bloco', 'copyLink'],
      ['Duplicar', 'duplicate'],
      ['Excluir', 'remove'],
    ] as const) {
      await userEvent.click(screen.getByRole('option', { name }))
      expect(onCommand).toHaveBeenLastCalledWith({ kind })
    }
  })

  it('walks into a submenu and back with the keyboard', async () => {
    const { onCommand, input } = setup()
    // A primeira opção já está ativa: → entra em "Transformar em".
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('transform'))
    await userEvent.keyboard('{ArrowRight}')
    expect(optionNames()).toEqual(['Parágrafo', 'Título 1'])
    expect(screen.getByRole('option', { name: 'Parágrafo' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await userEvent.keyboard('{ArrowLeft}')
    expect(optionNames()).toHaveLength(5)

    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(optionNames()).toEqual(['Fundo Verde'])
    await userEvent.keyboard('{Enter}')
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'color',
      prop: 'backgroundColor',
      color: 'green',
    })
  })

  it('Backspace on the empty field goes back; the back button too', async () => {
    setup()
    await userEvent.keyboard('{Enter}')
    expect(optionNames()).toHaveLength(2)
    await userEvent.keyboard('{Backspace}')
    expect(optionNames()).toHaveLength(5)

    await userEvent.click(screen.getByRole('option', { name: 'Cor' }))
    await userEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(optionNames()).toHaveLength(5)
  })

  it('searching flattens sub-items with their path', async () => {
    const { onCommand } = setup()
    await userEvent.keyboard('titu')
    expect(optionNames()).toEqual(['Transformar em › Título 1'])
    await userEvent.keyboard('{Enter}')
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'transform',
      type: 'heading',
      props: { level: 1 },
    })
  })

  it('says when nothing matches', async () => {
    setup()
    await userEvent.keyboard('xyzzy')
    expect(screen.getByText('Nenhuma ação encontrada.')).toBeInTheDocument()
  })

  it('the shortcuts work inside the menu: Del, Ctrl+D, Alt+Shift+L', async () => {
    const { onCommand } = setup()
    await userEvent.keyboard('{Delete}')
    expect(onCommand).toHaveBeenLastCalledWith({ kind: 'remove' })
    await userEvent.keyboard('{Control>}d{/Control}')
    expect(onCommand).toHaveBeenLastCalledWith({ kind: 'duplicate' })
    await userEvent.keyboard('{Alt>}{Shift>}L{/Shift}{/Alt}')
    expect(onCommand).toHaveBeenLastCalledWith({ kind: 'copyLink' })
  })

  it('Del with text in the field deletes the text, not the block', async () => {
    const { onCommand, input } = setup()
    await userEvent.keyboard('dup{ArrowLeft}{Delete}')
    expect(input).toHaveValue('du')
    expect(onCommand).not.toHaveBeenCalled()
  })
})

describe('BlockMenuPanel on touch', () => {
  it('never moves the focus to the search field (no keyboard pops up), even entering a submenu', async () => {
    render(
      <BlockMenuPanel
        title="Parágrafo"
        entries={ENTRIES}
        onCommand={vi.fn()}
        apple
        touch
        focusOnOpen={false}
      />,
    )
    await userEvent.click(screen.getByRole('option', { name: 'Cor' }))
    expect(screen.getByRole('option', { name: 'Fundo Verde' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Pesquisar ações do bloco' })).not.toHaveFocus()
  })
})
