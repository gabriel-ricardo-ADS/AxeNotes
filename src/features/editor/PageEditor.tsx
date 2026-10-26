import { withCollaboration } from '@blocknote/core/yjs'
import {
  FormattingToolbarController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { TriangleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { handleCalloutIconClicks } from '@/features/editor/blocks/callout/callout'
import { editorDictionary } from '@/features/editor/dictionary'
import { AxnFormattingToolbar } from '@/features/editor/formatting-toolbar'
import { editorSchema } from '@/features/editor/schema'
import { slashMenuItems } from '@/features/editor/slash-menu'
import { SyncIndicator } from '@/features/sync/components/SyncIndicator'
import type { PageDoc } from '@/features/sync/page-doc'
import { usePageDoc, useSyncStatus } from '@/features/sync/use-page-doc'
import { IconPickerDialog } from '@/features/workspace/components/IconPickerDialog'
import { t } from '@/i18n'
import '@/features/editor/editor.css'

export interface PageEditorProps {
  pageId: string
  /** false para leitor e para página na lixeira (só recebe, nunca envia). */
  editable: boolean
  /** Onde o indicador "Salvo / Salvando…" aparece (ao lado do "Editada há…"); null = em lugar nenhum. */
  statusSlot: HTMLElement | null
  /** Cada envio confirmado pelo servidor (o "Editada há…" se atualiza sem buscar a página). */
  onContentSaved?: () => void
}

/** Sem provedor de rede não há cursores de outras pessoas: o usuário local não aparece para ninguém. */
const LOCAL_USER = { name: '', color: 'transparent' }

/**
 * Corpo da página: editor BlockNote ligado ao Y.Doc da página (carregado do aparelho e sincronizado
 * com o servidor). Este módulo é o único ponto que importa BlockNote e Yjs, e só é carregado sob
 * demanda (chunk próprio, junto com a sincronização).
 */
export default function PageEditor({
  pageId,
  editable,
  statusSlot,
  onContentSaved,
}: PageEditorProps) {
  const state = usePageDoc(pageId, editable)
  const session = state.status === 'ready' ? state.pageDoc.session : null
  const status = useSyncStatus(session)

  const onSavedRef = useRef(onContentSaved)
  useEffect(() => {
    onSavedRef.current = onContentSaved
  }, [onContentSaved])
  useEffect(
    () =>
      session?.onSaved(() => {
        onSavedRef.current?.()
      }),
    [session],
  )

  if (state.status === 'loading') {
    return (
      <p role="status" className="mt-6 text-ui text-muted-foreground">
        {t('editor.loading')}
      </p>
    )
  }

  return (
    <>
      {statusSlot ? createPortal(<SyncIndicator status={status} />, statusSlot) : null}
      {state.storage === 'memory' ? <MemoryNotice /> : null}
      <LoadedEditor pageDoc={state.pageDoc} editable={editable} />
    </>
  )
}

/** O IndexedDB falhou: o conteúdo ainda vai ao servidor, mas nada fica guardado no aparelho. */
function MemoryNotice() {
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

function LoadedEditor({ pageDoc, editable }: { pageDoc: PageDoc; editable: boolean }) {
  const editor = useCreateBlockNote(
    withCollaboration({
      schema: editorSchema,
      dictionary: editorDictionary,
      collaboration: { fragment: pageDoc.fragment, user: LOCAL_USER },
    }),
    [pageDoc],
  )
  // Destaque cujo emoji está sendo trocado (o bloco só pede; o seletor é do app).
  const [calloutIconFor, setCalloutIconFor] = useState<string | null>(null)
  useEffect(() => handleCalloutIconClicks(editor, setCalloutIconFor), [editor])

  // Texto de busca e prévias saem dos blocos do editor (page_texts).
  useEffect(() => {
    const session = pageDoc.session
    session?.setTextSource(() => editor.document)
    return () => {
      session?.setTextSource(null)
    }
  }, [pageDoc, editor])

  return (
    <section aria-label={t('editor.label')} className="mt-4">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="dark"
        emojiPicker={false}
        slashMenu={false}
        formattingToolbar={false}
        className="axn-editor"
      >
        <FormattingToolbarController formattingToolbar={AxnFormattingToolbar} />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={(query) => Promise.resolve(slashMenuItems(editor, query))}
        />
      </BlockNoteView>
      <IconPickerDialog
        open={calloutIconFor !== null}
        onOpenChange={(open) => {
          if (!open) setCalloutIconFor(null)
        }}
        hasIcon={false}
        description={t('editor.callout.iconDescription')}
        onSelect={(icon) => {
          const block = calloutIconFor === null ? undefined : editor.getBlock(calloutIconFor)
          if (icon && block?.type === 'callout') {
            editor.updateBlock(block, { props: { emoji: icon.value } })
          }
        }}
      />
    </section>
  )
}
