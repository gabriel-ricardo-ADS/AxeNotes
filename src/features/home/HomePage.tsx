import { PageScreen } from '@/features/pages/PagePage'
import { NoHomePage, PageLoadError, PageLoading } from '@/features/pages/components/PageStatus'
import { useHomePage } from '@/features/workspace/hooks/use-home-page'

/** Rota "/": mostra a página inicial do workspace (criada na primeira vez, se ainda não existe). */
export function HomePage() {
  const home = useHomePage()

  switch (home.status) {
    case 'loading':
      return <PageLoading />
    case 'error':
      return <PageLoadError onRetry={home.retry} />
    case 'missing':
      return <NoHomePage />
    case 'ready':
      return <PageScreen pageId={home.pageId} />
  }
}
