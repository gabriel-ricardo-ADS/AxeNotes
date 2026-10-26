import {
  listenBlockShortcuts,
  matchBlockShortcut,
  type ShortcutKeys,
} from '@/features/editor/block-menu/block-shortcuts'

const keys = (partial: Partial<ShortcutKeys>): ShortcutKeys => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...partial,
})

describe('matchBlockShortcut', () => {
  it('Ctrl+D duplicates on Windows/Android and ⌘D on Apple', () => {
    expect(matchBlockShortcut(keys({ key: 'd', code: 'KeyD', ctrlKey: true }), false)).toBe(
      'duplicate',
    )
    expect(matchBlockShortcut(keys({ key: 'D', code: 'KeyD', ctrlKey: true }), false)).toBe(
      'duplicate',
    )
    expect(matchBlockShortcut(keys({ key: 'd', code: 'KeyD', metaKey: true }), true)).toBe(
      'duplicate',
    )
    // Ctrl no Mac e ⌘ fora dele não são o atalho.
    expect(matchBlockShortcut(keys({ key: 'd', code: 'KeyD', ctrlKey: true }), true)).toBeNull()
    expect(matchBlockShortcut(keys({ key: 'd', code: 'KeyD', metaKey: true }), false)).toBeNull()
    expect(
      matchBlockShortcut(keys({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true }), false),
    ).toBeNull()
  })

  it('Alt+Shift+L copies the link (by physical key: on a Mac, Alt changes the character)', () => {
    expect(
      matchBlockShortcut(keys({ key: 'L', code: 'KeyL', altKey: true, shiftKey: true }), false),
    ).toBe('copyLink')
    expect(
      matchBlockShortcut(keys({ key: 'Ò', code: 'KeyL', altKey: true, shiftKey: true }), true),
    ).toBe('copyLink')
    expect(matchBlockShortcut(keys({ key: 'L', code: 'KeyL', shiftKey: true }), false)).toBeNull()
  })

  it('Ctrl/⌘+/ opens the block menu; plain keys do nothing', () => {
    expect(matchBlockShortcut(keys({ key: '/', code: 'Slash', ctrlKey: true }), false)).toBe(
      'openMenu',
    )
    expect(matchBlockShortcut(keys({ key: '/', code: 'Slash' }), false)).toBeNull()
    expect(matchBlockShortcut(keys({ key: 'd', code: 'KeyD' }), false)).toBeNull()
  })
})

describe('listenBlockShortcuts', () => {
  function setup(editable = true) {
    document.body.innerHTML = `
      <input data-testid="title" />
      <section data-testid="root">
        <div data-testid="editor" contenteditable="true"><p data-testid="text">a</p></div>
        <div role="dialog"><input data-testid="in-dialog" /></div>
      </section>`
    const root = document.querySelector<HTMLElement>('[data-testid="root"]')
    const editorElement = document.querySelector<HTMLElement>('[data-testid="editor"]')
    if (!root || !editorElement) throw new Error('no DOM')
    const run = vi.fn()
    const openPageLink = vi.fn(() => true)
    const stop = listenBlockShortcuts(
      root,
      { isEditable: () => editable, editorElement: () => editorElement, run, openPageLink },
      false,
    )
    const press = (testId: string, init: KeyboardEventInit) => {
      const target = document.querySelector(`[data-testid="${testId}"]`)
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      target?.dispatchEvent(event)
      return event
    }
    return { run, openPageLink, stop, press }
  }

  it('acts only when the focus is inside the editor', () => {
    const { run, press } = setup()

    const inEditor = press('text', { key: 'd', code: 'KeyD', ctrlKey: true })
    expect(run).toHaveBeenCalledWith('duplicate')
    expect(inEditor.defaultPrevented).toBe(true)

    run.mockClear()
    const inDialog = press('in-dialog', { key: 'd', code: 'KeyD', ctrlKey: true })
    const inTitle = press('title', { key: 'L', code: 'KeyL', altKey: true, shiftKey: true })
    expect(run).not.toHaveBeenCalled()
    expect(inDialog.defaultPrevented).toBe(false)
    expect(inTitle.defaultPrevented).toBe(false)
  })

  it('does nothing in a read-only editor', () => {
    const { run, openPageLink, press } = setup(false)
    press('text', { key: 'd', code: 'KeyD', ctrlKey: true })
    press('text', { key: 'Enter' })
    expect(run).not.toHaveBeenCalled()
    expect(openPageLink).not.toHaveBeenCalled()
  })

  it('Enter asks to open a selected page link and keeps the key only if it did', () => {
    const { openPageLink, press } = setup()
    expect(press('text', { key: 'Enter' }).defaultPrevented).toBe(true)
    openPageLink.mockReturnValueOnce(false)
    expect(press('text', { key: 'Enter' }).defaultPrevented).toBe(false)
    expect(press('text', { key: 'Enter', shiftKey: true }).defaultPrevented).toBe(false)
  })

  it('stops listening when asked', () => {
    const { run, stop, press } = setup()
    stop()
    press('text', { key: 'd', code: 'KeyD', ctrlKey: true })
    expect(run).not.toHaveBeenCalled()
  })
})
