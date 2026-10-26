import { BlockNoteEditor } from '@blocknote/core'
import { editorDictionary } from '@/features/editor/dictionary'
import { editorSchema, type AxnEditor } from '@/features/editor/schema'

/** Editor do schema do AxeNotes sem tela, para testes de blocos e ações (só nos testes). */
export function createTestEditor(): AxnEditor {
  return BlockNoteEditor.create({ schema: editorSchema, dictionary: editorDictionary })
}
