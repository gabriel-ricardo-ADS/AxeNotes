import { Link } from 'react-router'
import { t } from '@/i18n'

export function NotFoundPage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-10 md:px-16 md:py-16">
      <h1 className="text-h1 font-semibold text-strong">{t('notFound.title')}</h1>
      <p className="mt-4 text-muted-foreground">{t('notFound.description')}</p>
      <Link to="/" className="mt-4 inline-block text-primary underline underline-offset-2">
        {t('notFound.backHome')}
      </Link>
    </div>
  )
}
