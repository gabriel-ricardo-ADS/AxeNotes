import { FileTextIcon } from 'lucide-react'
import type { PageIcon } from '@/features/workspace/page-icon'
import { cn } from '@/lib/utils'

interface PageIconViewProps {
  icon: PageIcon | null
  /** Tamanho do quadrado em classes do Tailwind (ex.: "size-5"). */
  className?: string
}

/** Ícone da página: o emoji escolhido ou, sem ele, o ícone genérico de documento. Decorativo. */
export function PageIconView({ icon, className }: PageIconViewProps) {
  if (icon === null) {
    return (
      <FileTextIcon
        className={cn('size-4 shrink-0 text-muted-foreground', className)}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-4 shrink-0 items-center justify-center leading-none', className)}
    >
      {icon.value}
    </span>
  )
}
