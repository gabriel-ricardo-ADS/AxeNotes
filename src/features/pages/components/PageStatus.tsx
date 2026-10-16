import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/** Carregando a página: só o esqueleto do título, sem piscar conteúdo. */
export function PageLoading() {
  return (
    <div role="status" className="mx-auto w-full max-w-content px-6 py-8 md:px-16 md:py-12">
      <span className="sr-only">{t('page.loading')}</span>
      <span aria-hidden="true" className="block h-10 w-2/3 rounded-tag bg-hover" />
    </div>
  )
}

/** Falha de rede/servidor ao carregar: diferente de "não encontrada", pede para tentar de novo. */
export function PageLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-10 md:px-16 md:py-16">
      <p role="alert" className="text-muted-foreground">
        {t('page.loadError')}
      </p>
      <Button variant="ghost" size="inline" onClick={onRetry} className="mt-2">
        {t('common.retry')}
      </Button>
    </div>
  )
}

/** O workspace ainda não tem página inicial e quem está aqui não pode criá-la. */
export function NoHomePage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-10 md:px-16 md:py-16">
      <p className="text-muted-foreground">{t('page.noHome')}</p>
    </div>
  )
}
