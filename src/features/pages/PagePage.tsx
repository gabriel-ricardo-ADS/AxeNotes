import { useParams } from 'react-router'
import { z } from 'zod'
import { NotFoundPage } from '@/app/NotFoundPage'
import { PageView } from '@/features/pages/components/PageView'
import { PageLoadError, PageLoading } from '@/features/pages/components/PageStatus'
import { usePage } from '@/features/workspace/hooks/use-pages'

const pageIdSchema = z.guid()

/** Carrega e mostra uma página pelo id. Daqui para frente `pageId` já é um uuid válido. */
export function PageScreen({ pageId }: { pageId: string }) {
  const { lookup, retry } = usePage(pageId)

  switch (lookup.status) {
    case 'loading':
      return <PageLoading />
    case 'error':
      return <PageLoadError onRetry={retry} />
    case 'notFound':
      return <NotFoundPage />
    case 'found':
      // `key`: cada página tem seu próprio estado do título (e salva o pendente ao sair).
      return <PageView key={lookup.page.id} page={lookup.page} trashed={lookup.trashed} />
  }
}

/**
 * Rota /p/:pageId. Id malformado, página inexistente e página sem acesso mostram a MESMA tela
 * ("Página não encontrada"), para não revelar quais páginas existem. Página na lixeira abre só para
 * leitura.
 */
export function PagePage() {
  const { pageId } = useParams()
  const parsed = pageIdSchema.safeParse(pageId)
  return parsed.success ? <PageScreen pageId={parsed.data} /> : <NotFoundPage />
}
