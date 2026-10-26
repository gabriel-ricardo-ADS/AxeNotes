import { yUndoPluginKey } from 'y-prosemirror'
import type { AxnEditor } from '@/features/editor/schema'

/**
 * Garante que o desfazer do Yjs está escutando o documento. O plugin de desfazer do y-prosemirror
 * destrói o `UndoManager` quando a view do editor é destruída, mas o estado (e o mesmo `UndoManager`)
 * continua quando a view é recriada — é o que o StrictMode faz em dev ao montar o editor duas vezes. Sem
 * isto, a pilha fica vazia para sempre e `editor.undo()` não faz nada (o Ctrl+Z só "funcionava" pelo
 * desfazer nativo do navegador). Religar é idempotente; em produção a view não é recriada e isto não muda
 * nada. Desfaz só o que passou pelo ProseMirror neste aparelho (origem `ySyncPluginKey`); updates do
 * servidor e do IndexedDB nunca entram na pilha.
 */
export function ensureYUndoAttached(editor: AxnEditor): void {
  const undoManager = yUndoPluginKey.getState(editor.prosemirrorState)?.undoManager
  if (!undoManager) return
  undoManager.doc.off('afterTransaction', undoManager.afterTransactionHandler)
  undoManager.doc.on('afterTransaction', undoManager.afterTransactionHandler)
  undoManager.trackedOrigins.add(undoManager)
}
