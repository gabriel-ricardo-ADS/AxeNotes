import { t } from '@/i18n'

/** Página inicial vazia da Fase 0; o conteúdo real chega com as páginas (Fase 1). */
export function HomePage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-10 md:px-16 md:py-16">
      <h1 className="text-title font-bold text-strong">{t('home.title')}</h1>
      <p className="mt-4 text-muted-foreground">{t('home.empty')}</p>
    </div>
  )
}
