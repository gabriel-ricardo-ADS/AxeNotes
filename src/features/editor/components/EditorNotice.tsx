import { XIcon } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

/** Aviso curto do editor: `info` some sozinho; `error` fica até ser dispensado. */
export interface EditorNoticeValue {
  kind: 'info' | 'error'
  text: string
}

/** Quanto tempo um aviso `info` fica na tela. */
const INFO_MS = 2500

/**
 * Aviso flutuante no rodapé da tela (fica visível com a página rolada e no celular, onde o aviso da
 * sidebar estaria escondido na gaveta). `role="status"` para `info`, `role="alert"` para `error`.
 */
export function EditorNotice({
  notice,
  onDismiss,
}: {
  notice: EditorNoticeValue | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (notice?.kind !== 'info') return
    const timer = window.setTimeout(onDismiss, INFO_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [notice, onDismiss])

  return (
    // Sempre montada: leitores de tela só anunciam mudanças de uma região que já existia.
    <div
      role={notice?.kind === 'error' ? 'alert' : 'status'}
      className="axn-editor-notice fixed inset-x-0 z-50 flex justify-center px-4"
    >
      {notice ? (
        <p
          className={cn(
            'axn-editor-notice-card flex items-center gap-1 rounded-card border bg-popover py-1 pr-1 pl-3 text-ui shadow-lg',
            notice.kind === 'error' ? 'text-red' : 'text-strong',
          )}
        >
          <span className="flex-1 py-1">{notice.text}</span>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={onDismiss}
            className="flex size-11 shrink-0 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover md:size-8"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </p>
      ) : null}
    </div>
  )
}
