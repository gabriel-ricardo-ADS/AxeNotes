import {
  copyBlockLink,
  duplicateBlock,
  removeBlock,
  runBlockCommand,
  setBlockColor,
  transformBlock,
  withoutIds,
} from '@/features/editor/block-menu/block-actions'
import { createTestEditor } from '@/features/editor/test-editor'
import { blocksToPlainText } from '@/features/sync/page-text'

// O schema traz o link de página, que lê páginas pela API: sem o cliente de verdade (nem .env).
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const PAGE = '00000000-0000-4000-8000-000000000001'
const LINKED = '00000000-0000-4000-8000-0000000000bb'

function editorWithNested() {
  const editor = createTestEditor()
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: 'antes' },
    {
      type: 'toggleListItem',
      content: 'Metas',
      children: [{ type: 'bulletListItem', content: 'Ler um livro' }],
    },
    { type: 'pageLink', props: { pageId: LINKED } },
    { type: 'paragraph', content: 'depois' },
  ])
  return editor
}

const allIds = (blocks: readonly { id: string; children: readonly unknown[] }[]): string[] =>
  blocks.flatMap((block) => [
    block.id,
    ...allIds(block.children as { id: string; children: readonly unknown[] }[]),
  ])

describe('duplicateBlock', () => {
  it('copies the block with its children, all with new ids, right after it', () => {
    const editor = editorWithNested()
    const toggle = editor.document[1]
    if (!toggle) throw new Error('no block')

    const copyId = duplicateBlock(editor, toggle.id)

    expect(editor.document.map((block) => block.type)).toEqual([
      'paragraph',
      'toggleListItem',
      'toggleListItem',
      'pageLink',
      'paragraph',
    ])
    expect(editor.document[2]?.id).toBe(copyId)
    const ids = allIds(editor.document)
    expect(new Set(ids).size).toBe(ids.length)
    expect(blocksToPlainText([editor.document[2] ?? toggle])).toBe('Metas\nLer um livro')
    expect(editor.getTextCursorPosition().block.id).toBe(copyId)
  })

  it('duplicates a page link as a link to the same page (never a new page)', () => {
    const editor = editorWithNested()
    const link = editor.document[2]
    if (!link) throw new Error('no block')
    duplicateBlock(editor, link.id)
    const links = editor.document.filter((block) => block.type === 'pageLink')
    expect(links.map((block) => block.props)).toEqual([{ pageId: LINKED }, { pageId: LINKED }])
  })

  it('withoutIds drops every id', () => {
    const editor = editorWithNested()
    const toggle = editor.document[1]
    if (!toggle) throw new Error('no block')
    expect(JSON.stringify(withoutIds(toggle))).not.toContain('"id"')
  })
})

describe('removeBlock', () => {
  it('removes the block with its children and moves the cursor to the next one', () => {
    const editor = editorWithNested()
    const toggle = editor.document[1]
    if (!toggle) throw new Error('no block')
    removeBlock(editor, toggle.id)
    expect(blocksToPlainText(editor.document)).toBe('antes\ndepois')
    // O vizinho de baixo é o link (sem cursor): o cursor fica onde estava, sem erro.
    expect(editor.document.map((block) => block.type)).toEqual([
      'paragraph',
      'pageLink',
      'paragraph',
    ])
  })

  it('removing a page link removes only the link', () => {
    const editor = editorWithNested()
    const link = editor.document[2]
    if (!link) throw new Error('no block')
    removeBlock(editor, link.id)
    expect(editor.document.some((block) => block.type === 'pageLink')).toBe(false)
    expect(editor.getTextCursorPosition().block.id).toBe(editor.document[2]?.id)
  })
})

describe('transformBlock', () => {
  it('keeps the text and the colors', () => {
    const editor = createTestEditor()
    editor.replaceBlocks(editor.document, [
      { type: 'paragraph', props: { textColor: 'blue' }, content: 'Seção' },
    ])
    const block = editor.document[0]
    if (!block) throw new Error('no block')

    transformBlock(editor, block.id, 'heading', { level: 2 })
    expect(editor.document[0]).toMatchObject({
      type: 'heading',
      props: { level: 2, textColor: 'blue' },
    })
    expect(blocksToPlainText(editor.document)).toBe('Seção')
  })

  it('a block without background turns into a gray callout; leaving the callout drops the emoji', () => {
    const editor = createTestEditor()
    editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: 'Lembrete' }])
    const id = editor.document[0]?.id ?? ''

    transformBlock(editor, id, 'callout')
    expect(editor.document[0]).toMatchObject({
      type: 'callout',
      props: { backgroundColor: 'gray', emoji: '💡' },
    })

    transformBlock(editor, id, 'bulletListItem')
    expect(editor.document[0]?.type).toBe('bulletListItem')
    expect(editor.document[0]?.props).not.toHaveProperty('emoji')
    expect(blocksToPlainText(editor.document)).toBe('Lembrete')
  })
})

describe('setBlockColor', () => {
  it('changes the text or background color, and ignores blocks without the prop', () => {
    const editor = editorWithNested()
    const first = editor.document[0]?.id ?? ''
    setBlockColor(editor, first, 'backgroundColor', 'green')
    setBlockColor(editor, first, 'textColor', 'brown')
    expect(editor.document[0]?.props).toMatchObject({
      backgroundColor: 'green',
      textColor: 'brown',
    })

    const link = editor.document[2]?.id ?? ''
    setBlockColor(editor, link, 'backgroundColor', 'green')
    expect(editor.document[2]?.props).toEqual({ pageId: LINKED })
  })
})

describe('copy link to the block', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('copies /p/:pageId#bloco-<id> and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText } })
    const notify = vi.fn()
    const editor = editorWithNested()
    const block = editor.document[0]?.id ?? ''

    await runBlockCommand(editor, block, { kind: 'copyLink' }, { pageId: PAGE, notify })

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/${PAGE}#bloco-${block}`)
    expect(notify).toHaveBeenCalledWith({ kind: 'info', text: 'Link do bloco copiado.' })
  })

  it('reports when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      userAgent: navigator.userAgent,
      clipboard: { writeText: () => Promise.reject(new Error('negado')) },
    })
    expect(await copyBlockLink(PAGE, 'x')).toBe(false)
  })
})

describe('runBlockCommand', () => {
  it('runs duplicate, remove, transform and color', async () => {
    const editor = editorWithNested()
    const context = { pageId: PAGE, notify: vi.fn() }
    const first = editor.document[0]?.id ?? ''

    await runBlockCommand(editor, first, { kind: 'duplicate' }, context)
    expect(editor.document).toHaveLength(5)
    await runBlockCommand(editor, first, { kind: 'remove' }, context)
    expect(editor.document).toHaveLength(4)
    const next = editor.document[0]?.id ?? ''
    await runBlockCommand(editor, next, { kind: 'transform', type: 'quote' }, context)
    expect(editor.document[0]?.type).toBe('quote')
    await runBlockCommand(editor, next, { kind: 'color', prop: 'textColor', color: 'red' }, context)
    expect(editor.document[0]?.props).toMatchObject({ textColor: 'red' })
  })
})
