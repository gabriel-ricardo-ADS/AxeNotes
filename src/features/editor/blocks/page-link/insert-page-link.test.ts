import { insertPageLink, insertSubpage } from '@/features/editor/blocks/page-link/insert-page-link'
import { createTestEditor } from '@/features/editor/test-editor'
import { blocksToPlainText } from '@/features/sync/page-text'

// O schema traz o link de página, que lê páginas pela API: sem o cliente de verdade (nem .env).
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const CURRENT = '00000000-0000-4000-8000-000000000001'
const NEW_ID = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000bb'

function editorWith(texts: string[]) {
  const editor = createTestEditor()
  editor.replaceBlocks(
    editor.document,
    texts.map((text) => ({ type: 'paragraph' as const, content: text })),
  )
  return editor
}

describe('insertSubpage ("/" → "Página")', () => {
  it('creates the child of the current page with the id the block points to, then opens it', async () => {
    const editor = editorWith(['antes', ''])
    editor.setTextCursorPosition(editor.document[1] ?? '', 'end')
    const createPage = vi.fn((_parent: string, options: { id: string }) =>
      Promise.resolve<string | null>(options.id),
    )
    const openPage = vi.fn()
    const onError = vi.fn()

    const result = await insertSubpage(editor, {
      currentPageId: CURRENT,
      createPage,
      openPage,
      onError,
      newId: () => NEW_ID,
    })

    expect(result).toBe(NEW_ID)
    expect(createPage).toHaveBeenCalledWith(CURRENT, { id: NEW_ID })
    expect(editor.document[1]).toMatchObject({ type: 'pageLink', props: { pageId: NEW_ID } })
    expect(openPage).toHaveBeenCalledWith(NEW_ID)
    expect(onError).not.toHaveBeenCalled()
  })

  it('removes the block and reports when the page could not be created', async () => {
    const editor = editorWith(['antes', ''])
    editor.setTextCursorPosition(editor.document[1] ?? '', 'end')
    const openPage = vi.fn()
    const onError = vi.fn()

    const result = await insertSubpage(editor, {
      currentPageId: CURRENT,
      createPage: () => Promise.resolve(null),
      openPage,
      onError,
      newId: () => NEW_ID,
    })

    expect(result).toBeNull()
    expect(editor.document.some((block) => block.type === 'pageLink')).toBe(false)
    expect(openPage).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('subpágina'))
  })
})

describe('insertPageLink ("/" → "Link para página")', () => {
  it('replaces the empty block where "/" was typed', () => {
    const editor = editorWith(['antes', '', 'depois'])
    const at = editor.document[1]?.id ?? null

    insertPageLink(editor, at, OTHER)

    expect(editor.document.map((block) => block.type)).toEqual([
      'paragraph',
      'pageLink',
      'paragraph',
    ])
    expect(editor.document[1]?.props).toEqual({ pageId: OTHER })
    // O cursor vai para o próximo bloco de texto.
    expect(editor.getTextCursorPosition().block.id).toBe(editor.document[2]?.id)
  })

  it('inserts after a block that has text, and appends a paragraph when the link is the last block', () => {
    const editor = editorWith(['com texto'])
    insertPageLink(editor, editor.document[0]?.id ?? null, OTHER)

    expect(editor.document.map((block) => block.type)).toEqual([
      'paragraph',
      'pageLink',
      'paragraph',
    ])
    expect(blocksToPlainText(editor.document)).toBe('com texto')
  })

  it('goes to the end of the page when the block is gone', () => {
    const editor = editorWith(['a', 'b'])
    insertPageLink(editor, '00000000-0000-4000-8000-00000000dead', OTHER)
    expect(editor.document.findIndex((block) => block.type === 'pageLink')).toBe(2)
  })
})

describe('page_texts with page links', () => {
  it('adds no text for a link (the title lives in the linked page, not here)', () => {
    const editor = editorWith(['texto'])
    insertPageLink(editor, editor.document[0]?.id ?? null, OTHER)
    expect(blocksToPlainText(editor.document)).toBe('texto')
  })
})
