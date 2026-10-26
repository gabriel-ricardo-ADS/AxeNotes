import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageSearchPanel } from '@/features/search/components/PageSearchPanel'
import { PAGE_SEARCH_DIALOG_CLASS } from '@/features/search/components/SearchDialog'
import { useVisualViewport } from '@/features/search/hooks/use-visual-viewport'
import { t } from '@/i18n'

interface PagePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A página escolhida; o diálogo fecha sozinho depois. */
  onPick: (pageId: string) => void
  /** Páginas fora da lista (a própria página do link). */
  excludeIds?: readonly string[]
  /** Para onde o foco vai ao fechar (o editor); sem isto, o Radix devolve a quem abriu. */
  onCloseFocus?: () => void
}

/**
 * Seletor de página do "Link para página": a mesma busca do Ctrl/Cmd+K (recentes com o campo vazio,
 * título e corpo com termo), mas escolher devolve o id em vez de navegar.
 */
export function PagePickerDialog({
  open,
  onOpenChange,
  onPick,
  excludeIds,
  onCloseFocus,
}: PagePickerDialogProps) {
  const [term, setTerm] = useState('')
  const [content, setContent] = useState<HTMLElement | null>(null)
  useVisualViewport(content, open)

  const change = (next: boolean) => {
    if (!next) setTerm('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        ref={setContent}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          content?.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!onCloseFocus) return
          event.preventDefault()
          onCloseFocus()
        }}
        className={PAGE_SEARCH_DIALOG_CLASS}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('editor.pagePicker.title')}</DialogTitle>
          <DialogDescription>{t('editor.pagePicker.description')}</DialogDescription>
        </DialogHeader>
        {open ? (
          <PageSearchPanel
            term={term}
            onTermChange={setTerm}
            inputLabel={t('editor.pagePicker.inputLabel')}
            {...(excludeIds ? { excludeIds } : {})}
            onPick={(item) => {
              onPick(item.id)
              change(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
