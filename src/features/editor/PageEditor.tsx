import { withCollaboration } from '@blocknote/core/yjs'
import { SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { editorDictionary } from '@/features/editor/dictionary'
import { editorSchema } from '@/features/editor/schema'
import { slashMenuItems } from '@/features/editor/slash-menu'
import type { PageDoc, PageDocStorage } from '@/features/sync/page-doc'
import { usePageDoc } from '@/features/sync/use-page-doc'
import { t } from '@/i18n'
import '@/features/editor/editor.css'

export interface PageEditorProps {
  pageId: string
  /** false para leitor e para página na lixeira. */
  editable: boolean
}

/** Sem provedor de rede não há cursores de outras pessoas: o usuário local não aparece para ninguém. */
const LOCAL_USER = { name: '', color: 'transparent' }

/**
 * Corpo da página: editor BlockNote ligado ao Y.Doc da página (carregado do aparelho). Este módulo é
 * o único ponto que importa BlockNote e Yjs, e só é carregado sob demanda (chunk próprio).
 */
export default function PageEditor({ pageId, editable }: PageEditorProps) {
  const state = usePageDoc(pageId)

  if (state.status === 'loading') {
    return (
      <p role="status" className="mt-6 text-ui text-muted-foreground">
        {t('editor.loading')}
      </p>
    )
  }

  return (
    <>
      <StorageNotice storage={state.storage} />
      <LoadedEditor pageDoc={state.pageDoc} editable={editable} />
    </>
  )
}

/**
 * Aviso fixo enquanto o conteúdo não sincroniza (o 2b remove o de prévia). Se o IndexedDB falhou, o
 * aviso diz que nada será guardado.
 */
function StorageNotice({ storage }: { storage: PageDocStorage }) {
  if (storage === 'memory') {
    return (
      <p
        role="alert"
        className="mt-6 flex items-start gap-2 rounded-tag bg-yellow-block px-3 py-2 text-ui text-yellow"
      >
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t('editor.memoryNotice')}
      </p>
    )
  }
  return (
    <p className="mt-6 flex items-center gap-1.5 text-meta text-muted-foreground">
      <InfoIcon className="size-3.5 shrink-0" aria-hidden="true" />
      {t('editor.previewNotice')}
    </p>
  )
}

function LoadedEditor({ pageDoc, editable }: { pageDoc: PageDoc; editable: boolean }) {
  const editor = useCreateBlockNote(
    withCollaboration({
      schema: editorSchema,
      dictionary: editorDictionary,
      collaboration: { fragment: pageDoc.fragment, user: LOCAL_USER },
    }),
    [pageDoc],
  )

  return (
    <section aria-label={t('editor.label')} className="mt-4">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="dark"
        emojiPicker={false}
        slashMenu={false}
        className="axn-editor"
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={(query) => Promise.resolve(slashMenuItems(editor, query))}
        />
      </BlockNoteView>
    </section>
  )
}
