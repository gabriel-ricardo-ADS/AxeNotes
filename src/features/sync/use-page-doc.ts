import { useEffect, useState } from 'react'
import { openPageDoc, type PageDoc, type PageDocStorage } from '@/features/sync/page-doc'

export type PageDocState =
  { status: 'loading' } | { status: 'ready'; pageDoc: PageDoc; storage: PageDocStorage }

/**
 * Abre o Y.Doc da página ao montar e o destrói ao desmontar ou trocar de página (o StrictMode abre e
 * fecha duas vezes, sem sobra). Só fica `ready` depois de carregar o conteúdo do aparelho.
 */
export function usePageDoc(pageId: string): PageDocState {
  const [state, setState] = useState<PageDocState>({ status: 'loading' })

  useEffect(() => {
    const pageDoc = openPageDoc(pageId)
    let active = true
    void pageDoc.ready.then((storage) => {
      if (active) setState({ status: 'ready', pageDoc, storage })
    })
    return () => {
      active = false
      void pageDoc.destroy()
    }
  }, [pageId])

  // Doc de outra página (ou já fechado) ainda no estado: trata como carregando.
  return state.status === 'ready' && state.pageDoc.pageId === pageId ? state : { status: 'loading' }
}
