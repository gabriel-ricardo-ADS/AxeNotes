import { SideMenuExtension } from '@blocknote/core/extensions'
import { withCollaboration } from '@blocknote/core/yjs'
import {
  DesktopFormattingToolbarController,
  LinkToolbarController,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
  useEditorFocus,
  useVirtualKeyboard,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { TriangleAlertIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { runBlockCommand } from '@/features/editor/block-menu/block-actions'
import type { BlockCommand } from '@/features/editor/block-menu/block-menu'
import { isApplePlatform, listenBlockShortcuts } from '@/features/editor/block-menu/block-shortcuts'
import { AxnSideMenu } from '@/features/editor/block-menu/AxnSideMenu'
import { BlockMenu, type BlockMenuTarget } from '@/features/editor/block-menu/BlockMenu'
import { OpenBlockMenuContext } from '@/features/editor/block-menu/open-block-menu-context'
import { handleCalloutIconClicks } from '@/features/editor/blocks/callout/callout'
import { insertPageLink, insertSubpage } from '@/features/editor/blocks/page-link/insert-page-link'
import { isPageId } from '@/features/editor/blocks/page-link/page-link-id'
import { EditorNotice, type EditorNoticeValue } from '@/features/editor/components/EditorNotice'
import { EDITOR_OPTIONS } from '@/features/editor/editor-options'
import { AxnFormattingToolbar } from '@/features/editor/formatting-toolbar'
import { AxnLinkToolbar } from '@/features/editor/link-toolbar'
import { slashMenuItems, type SlashMenuActions } from '@/features/editor/slash-menu'
import { shouldShowTouchBar } from '@/features/editor/touch/touch-editor'
import { TouchToolbarController } from '@/features/editor/touch/TouchToolbar'
import { useZoomed } from '@/features/editor/touch/use-visual-viewport-box'
import { useRevealBlock } from '@/features/editor/use-reveal-block'
import { ensureYUndoAttached } from '@/features/editor/y-undo'
import { FOCUS_TITLE_STATE, pagePath } from '@/features/pages/routes'
import { PagePickerDialog } from '@/features/search/components/PagePickerDialog'
import { SyncIndicator } from '@/features/sync/components/SyncIndicator'
import type { PageDoc } from '@/features/sync/page-doc'
import { usePageDoc, useSyncStatus } from '@/features/sync/use-page-doc'
import { IconPickerDialog } from '@/features/workspace/components/IconPickerDialog'
import { usePageMutations } from '@/features/workspace/hooks/use-page-mutations'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'
import { useMediaQuery } from '@/hooks/use-media-query'
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
      <LoadedEditor pageDoc={state.pageDoc} pageId={pageId} editable={editable} />
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

function LoadedEditor({
  pageDoc,
  pageId,
  editable,
}: {
  pageDoc: PageDoc
  pageId: string
  editable: boolean
}) {
  const touch = useMediaQuery('(pointer: coarse)')
  const editor = useCreateBlockNote(
    withCollaboration({
      ...EDITOR_OPTIONS,
      collaboration: { fragment: pageDoc.fragment, user: LOCAL_USER },
    }),
    [pageDoc],
  )
  // Desfazer/Refazer (Ctrl+Z e a barra do toque) pelo Yjs: religa a pilha se a view foi recriada.
  useEffect(() => {
    ensureYUndoAttached(editor)
    return editor.onMount(() => {
      ensureYUndoAttached(editor)
    })
  }, [editor])
  // Destaque cujo emoji está sendo trocado (o bloco só pede; o seletor é do app).
  const [calloutIconFor, setCalloutIconFor] = useState<string | null>(null)
  useEffect(() => handleCalloutIconClicks(editor, setCalloutIconFor), [editor])

  const navigate = useNavigate()
  const { createPage } = usePageMutations()
  const [notice, setNotice] = useState<EditorNoticeValue | null>(null)
  const dismissNotice = useCallback(() => {
    setNotice(null)
  }, [])
  // Bloco onde o "/" → "Link para página" foi pedido, enquanto o seletor está aberto.
  const [linkPickerAt, setLinkPickerAt] = useState<string | null | undefined>(undefined)

  const slashActions = useMemo<SlashMenuActions>(
    () => ({
      createSubpage: () => {
        void insertSubpage(editor, {
          currentPageId: pageId,
          createPage,
          openPage: (id) => {
            void navigate(pagePath(id), { state: FOCUS_TITLE_STATE })
          },
          onError: (text) => {
            setNotice({ kind: 'error', text })
          },
        })
      },
      linkToPage: () => {
        setLinkPickerAt(editor.getTextCursorPosition().block.id)
      },
    }),
    [editor, pageId, createPage, navigate],
  )

  // Menu do bloco (⋮⋮ ou Ctrl/⌘+/): popover no desktop, bottom sheet no toque.
  const apple = useMemo(() => isApplePlatform(), [])
  const [menuTarget, setMenuTarget] = useState<BlockMenuTarget | null>(null)
  const openBlockMenu = useCallback((blockId: string, anchor: HTMLElement) => {
    setMenuTarget({ blockId, anchor })
  }, [])
  const closeBlockMenu = useCallback(() => {
    setMenuTarget(null)
    editor.getExtension(SideMenuExtension)?.unfreezeMenu()
  }, [editor])
  const runCommand = useCallback(
    (blockId: string, command: BlockCommand) => {
      void runBlockCommand(editor, blockId, command, { pageId, notify: setNotice })
    },
    [editor, pageId],
  )

  // Atalhos do bloco (só com o foco dentro do editor) e o link para o bloco no endereço.
  const homeId = useWorkspace().data?.homePageId ?? null
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = sectionRef.current
    if (!root) return
    return listenBlockShortcuts(root, {
      isEditable: () => editor.isEditable,
      editorElement: () => editor.domElement,
      run: (shortcut) => {
        const block = editor.getTextCursorPosition().block
        if (shortcut === 'openMenu') {
          const anchor = editor.domElement?.querySelector<HTMLElement>(
            `.bn-block-outer[data-id="${CSS.escape(block.id)}"]`,
          )
          if (anchor) openBlockMenu(block.id, anchor)
        } else {
          runCommand(block.id, { kind: shortcut })
        }
      },
      openPageLink: () => {
        const block = editor.getTextCursorPosition().block
        if (block.type !== 'pageLink' || !isPageId(block.props.pageId)) return false
        void navigate(block.props.pageId === homeId ? '/' : pagePath(block.props.pageId))
        return true
      },
    })
  }, [editor, homeId, navigate, openBlockMenu, runCommand])
  useRevealBlock(editor, useLocation().hash)

  // Barra acima do teclado (toque): as mesmas fontes decidem se ela aparece e se a barra flutuante do
  // desktop some, então nunca há duas barras (DECISÃO-031).
  const keyboardOpen = useVirtualKeyboard()
  const focused = useEditorFocus({ includeEditorUI: true }, editor)
  const zoomed = useZoomed()
  const modalOpen = menuTarget !== null || calloutIconFor !== null || linkPickerAt !== undefined
  const touchBarShown = shouldShowTouchBar({
    touch,
    keyboardOpen,
    focused,
    editable,
    modalOpen,
    zoomed,
  })
  const [, setDockHeight] = useState(0)

  // Texto de busca e prévias saem dos blocos do editor (page_texts).
  useEffect(() => {
    const session = pageDoc.session
    session?.setTextSource(() => editor.document)
    return () => {
      session?.setTextSource(null)
    }
  }, [pageDoc, editor])

  return (
    <section ref={sectionRef} aria-label={t('editor.label')} className="mt-4">
      <OpenBlockMenuContext.Provider value={openBlockMenu}>
        <BlockNoteView
          editor={editor}
          editable={editable}
          theme="dark"
          emojiPicker={false}
          slashMenu={false}
          formattingToolbar={false}
          sideMenu={false}
          linkToolbar={false}
          className="axn-editor"
        >
          <SideMenuController sideMenu={AxnSideMenu} />
          {touchBarShown ? (
            <TouchToolbarController onHeightChange={setDockHeight} />
          ) : (
            <DesktopFormattingToolbarController formattingToolbar={AxnFormattingToolbar} />
          )}
          <LinkToolbarController linkToolbar={AxnLinkToolbar} />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={(query) => Promise.resolve(slashMenuItems(editor, query, slashActions))}
          />
        </BlockNoteView>
      </OpenBlockMenuContext.Provider>
      <BlockMenu
        editor={editor}
        target={menuTarget}
        onClose={closeBlockMenu}
        onCommand={runCommand}
        touch={touch}
        apple={apple}
      />
      <IconPickerDialog
        open={calloutIconFor !== null}
        onOpenChange={(open) => {
          if (!open) setCalloutIconFor(null)
        }}
        hasIcon={false}
        description={t('editor.callout.iconDescription')}
        onCloseFocus={() => {
          editor.focus()
        }}
        onSelect={(icon) => {
          const block = calloutIconFor === null ? undefined : editor.getBlock(calloutIconFor)
          if (icon && block?.type === 'callout') {
            editor.updateBlock(block, { props: { emoji: icon.value } })
          }
        }}
      />
      <PagePickerDialog
        open={linkPickerAt !== undefined}
        onOpenChange={(open) => {
          if (!open) setLinkPickerAt(undefined)
        }}
        onCloseFocus={() => {
          editor.focus()
        }}
        excludeIds={[pageId]}
        onPick={(target) => {
          insertPageLink(editor, linkPickerAt ?? null, target)
        }}
      />
      <EditorNotice notice={notice} onDismiss={dismissNotice} />
    </section>
  )
}
