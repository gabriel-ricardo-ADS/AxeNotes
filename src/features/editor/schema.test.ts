import { BlockNoteEditor } from '@blocknote/core'
import { editorDictionary } from '@/features/editor/dictionary'
import { editorSchema } from '@/features/editor/schema'
import { slashMenuItems } from '@/features/editor/slash-menu'

function menuTitles(query = ''): string[] {
  const editor = BlockNoteEditor.create({ schema: editorSchema, dictionary: editorDictionary })
  return slashMenuItems(editor, query).map((item) => item.title)
}

describe('editor schema (Fase 2a)', () => {
  it('has only the native blocks of the roadmap, without media', () => {
    expect(Object.keys(editorSchema.blockSpecs).sort()).toEqual(
      [
        'bulletListItem',
        'checkListItem',
        'codeBlock',
        'divider',
        'heading',
        'numberedListItem',
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
  })

  it('filters the "/" menu by what is typed, in pt-BR', () => {
    expect(menuTitles('tabe')).toEqual(['Tabela'])
  })

  it('uses the AxeNotes placeholders', () => {
    expect(editorDictionary.placeholders.default).toBe("Digite '/' para comandos")
    expect(editorDictionary.placeholders.toggleListItem).toBe('Lista recolhível')
  })
})
