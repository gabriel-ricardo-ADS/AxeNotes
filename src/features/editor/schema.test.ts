import { BlockNoteEditor } from '@blocknote/core'
import { editorDictionary } from '@/features/editor/dictionary'
import { editorSchema } from '@/features/editor/schema'
import { slashMenuItems } from '@/features/editor/slash-menu'

function menuTitles(query = ''): string[] {
  const editor = BlockNoteEditor.create({ schema: editorSchema, dictionary: editorDictionary })
  return slashMenuItems(editor, query).map((item) => item.title)
}

describe('editor schema', () => {
  it('has only the native blocks of the roadmap, without media', () => {
    expect(Object.keys(editorSchema.blockSpecs).sort()).toEqual(
      [
        'bulletListItem',
        'callout',
        'checkListItem',
        'codeBlock',
        'divider',
        'heading',
        'numberedListItem',
        'pageLink',
        'paragraph',
        'quote',
        'table',
        'toggleListItem',
      ].sort(),
    )
  })

  it('offers no image, video, audio, file or emoji in the "/" menu', () => {
    const titles = menuTitles()
    const menu = editorDictionary.slash_menu

    for (const blocked of [menu.image, menu.video, menu.audio, menu.file, menu.emoji]) {
      expect(titles).not.toContain(blocked.title)
    }
    for (const wanted of [menu.heading, menu.bullet_list, menu.check_list, menu.toggle_list]) {
      expect(titles).toContain(wanted.title)
    }
    expect(titles).toContain('Tabela')
    expect(titles).toContain('Destaque')
  })

  it('filters the "/" menu by what is typed, in pt-BR', () => {
    expect(menuTitles('tabe')).toEqual(['Tabela'])
  })

  it('finds the callout by its pt-BR and English names, right after Quote', () => {
    expect(menuTitles('destaq')).toEqual(['Destaque'])
    expect(menuTitles('callout')).toEqual(['Destaque'])
    const titles = menuTitles()
    expect(titles.indexOf('Destaque')).toBe(
      titles.indexOf(editorDictionary.slash_menu.quote.title) + 1,
    )
  })

  it('offers "Página" and "Link para página" only when the app wires their actions', () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema, dictionary: editorDictionary })
    const actions = { createSubpage: vi.fn(), linkToPage: vi.fn() }
    expect(slashMenuItems(editor, 'pági').map((item) => item.title)).not.toContain('Página')
    const titles = slashMenuItems(editor, '', actions).map((item) => item.title)
    expect(titles.slice(titles.indexOf('Destaque'), titles.indexOf('Destaque') + 3)).toEqual([
      'Destaque',
      'Página',
      'Link para página',
    ])
    slashMenuItems(editor, 'subpagina', actions)[0]?.onItemClick()
    expect(actions.createSubpage).toHaveBeenCalled()
    slashMenuItems(editor, 'link para', actions)[0]?.onItemClick()
    expect(actions.linkToPage).toHaveBeenCalled()
  })

  it('uses the AxeNotes placeholders', () => {
    expect(editorDictionary.placeholders.default).toBe("Digite '/' para comandos")
    expect(editorDictionary.placeholders.toggleListItem).toBe('Lista expansível')
  })
})
