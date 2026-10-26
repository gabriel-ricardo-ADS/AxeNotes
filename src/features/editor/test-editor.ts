import { BlockNoteEditor } from '@blocknote/core'
import { EDITOR_OPTIONS } from '@/features/editor/editor-options'
import type { AxnEditor } from '@/features/editor/schema'

/** Editor do schema do AxeNotes sem tela, para testes de blocos e ações (só nos testes). */
export function createTestEditor(): AxnEditor {
  return BlockNoteEditor.create(EDITOR_OPTIONS)
}
