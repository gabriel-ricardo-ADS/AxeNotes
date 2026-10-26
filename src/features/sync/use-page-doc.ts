import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { startBackgroundSync } from '@/features/sync/background'
import type { ContentSyncSession, SyncStatus } from '@/features/sync/content-sync'
import { openPageDoc, type PageDoc, type PageDocStorage } from '@/features/sync/page-doc'
import { supabaseSync } from '@/features/sync/supabase-sync'

/** `loading` até carregar o conteúdo do aparelho; depois o doc pronto e onde ele ficou guardado. */
export type PageDocState =
  { status: 'loading' } | { status: 'ready'; pageDoc: PageDoc; storage: PageDocStorage }

/**
 * Abre o Y.Doc da página ao montar e o destrói ao desmontar ou trocar de página (o StrictMode abre e
 * fecha duas vezes, sem sobra). Só fica `ready` depois de carregar o conteúdo do aparelho; a partir
 * daí sincroniza com o servidor. `editable` false (leitor, lixeira) só recebe.
 */
export function usePageDoc(pageId: string, editable: boolean): PageDocState {
  const [state, setState] = useState<PageDocState>({ status: 'loading' })
  // O doc abre com o papel do momento; mudanças depois vão por `setCanWrite` (efeito abaixo).
  const editableRef = useRef(editable)
  useEffect(() => {
    editableRef.current = editable
  }, [editable])

  useEffect(() => {
    startBackgroundSync()
    const pageDoc = openPageDoc(pageId, supabaseSync, { canWrite: editableRef.current })
    let active = true
    void pageDoc.ready.then((storage) => {
      if (active) setState({ status: 'ready', pageDoc, storage })
    })
    return () => {
      active = false
      void pageDoc.destroy()
    }
  }, [pageId])

  const current = state.status === 'ready' && state.pageDoc.pageId === pageId ? state : null
  // A página pode mudar de papel com o doc aberto (ex.: foi para a lixeira em outro lugar).
  useEffect(() => {
    current?.pageDoc.session?.setCanWrite(editable)
  }, [current, editable])

  // Doc de outra página (ou já fechado) ainda no estado: trata como carregando.
  return current ?? { status: 'loading' }
}

const noSubscribe = () => () => undefined

/** Status do salvamento da sessão (indicador). */
export function useSyncStatus(session: ContentSyncSession | null): SyncStatus {
  return useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    () => session?.getStatus() ?? 'saved',
  )
}
