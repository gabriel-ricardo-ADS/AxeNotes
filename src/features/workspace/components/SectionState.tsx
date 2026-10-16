import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

/** Esqueleto de uma seção da sidebar enquanto carrega (sem piscar conteúdo). */
export function SectionLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-2 px-2 py-1">
      <span className="sr-only">{label}</span>
      {[0, 1].map((key) => (
        <span key={key} aria-hidden="true" className="h-4 w-4/5 rounded-tag bg-hover" />
      ))}
    </div>
  )
}

/** Falha ao carregar uma seção da sidebar, com "Tentar de novo". */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-2">
      <p role="alert" className="text-muted-foreground">
        {message}
      </p>
      <Button variant="ghost" size="inline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
