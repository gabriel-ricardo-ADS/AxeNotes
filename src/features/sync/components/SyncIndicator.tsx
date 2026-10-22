import {
  CheckIcon,
  CloudOffIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SyncStatus } from '@/features/sync/content-sync'
import { t, type TranslationKey } from '@/i18n'
import { cn } from '@/lib/utils'

/** "Salvando…" só aparece se o envio passar disto: não pisca nem é anunciado a cada pausa. */
export const SAVING_DELAY_MS = 400

type VisibleStatus = Exclude<SyncStatus, 'readonly'>

const VIEW: Record<VisibleStatus, { key: TranslationKey; Icon: LucideIcon; tone: string }> = {
  saved: { key: 'sync.saved', Icon: CheckIcon, tone: 'text-muted-foreground' },
  saving: { key: 'sync.saving', Icon: LoaderCircleIcon, tone: 'text-muted-foreground' },
  offline: { key: 'sync.offline', Icon: CloudOffIcon, tone: 'text-muted-foreground' },
  error: { key: 'sync.error', Icon: TriangleAlertIcon, tone: 'text-danger' },
  tooLarge: { key: 'sync.tooLarge', Icon: TriangleAlertIcon, tone: 'text-danger' },
  blocked: { key: 'sync.blocked', Icon: TriangleAlertIcon, tone: 'text-danger' },
}

/**
 * Status do salvamento do conteúdo, discreto, ao lado do "Editada há…". Leitor e página na lixeira
 * não mostram nada. `aria-live="polite"`: o leitor de tela ouve as mudanças sem ser interrompido.
 */
export function SyncIndicator({ status }: { status: SyncStatus }) {
  const shown = useDelayedSaving(status)
  if (shown === 'readonly') return null
  const { key, Icon, tone } = VIEW[shown]
  return (
    <span
      role="status"
      aria-live="polite"
      data-sync-status={shown}
      // Sem `cn`: o tailwind-merge trata `text-meta` (tamanho) e a cor como conflito e tiraria o tamanho.
      className={`inline-flex min-w-0 items-center gap-1 text-meta ${tone}`}
    >
      <Icon
        className={cn('size-3.5 shrink-0', shown === 'saving' && 'motion-safe:animate-spin')}
        aria-hidden="true"
      />
      <span>{t(key)}</span>
    </span>
  )
}

/** Segura "Salvando…" por SAVING_DELAY_MS mostrando o status anterior; os outros passam na hora. */
function useDelayedSaving(status: SyncStatus): SyncStatus {
  const [previous, setPrevious] = useState(status)
  const [beforeSaving, setBeforeSaving] = useState(status)
  const [savingVisible, setSavingVisible] = useState(false)
  // Ajuste de estado durante o render quando o status muda (padrão do React, sem efeito em cascata).
  if (status !== previous) {
    setPrevious(status)
    if (status !== 'saving') {
      setBeforeSaving(status)
      setSavingVisible(false)
    }
  }
  useEffect(() => {
    if (status !== 'saving') return
    const timer = setTimeout(() => {
      setSavingVisible(true)
    }, SAVING_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [status])
  if (status !== 'saving') return status
  return savingVisible ? 'saving' : beforeSaving
}
