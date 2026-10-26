import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ICON_CHOICES, type PageIcon } from '@/features/workspace/page-icon'
import { t } from '@/i18n'

interface IconPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tem ícone hoje? Só então "Remover ícone" aparece. */
  hasIcon: boolean
  /** `null` remove o ícone. */
  onSelect: (icon: PageIcon | null) => void
  /** Texto de apoio do diálogo (o padrão fala do ícone da página). */
  description?: string
}

/** Seletor de ícone: grade simples de emojis curados, sem biblioteca. */
export function IconPickerDialog({
  open,
  onOpenChange,
  hasIcon,
  onSelect,
  description,
}: IconPickerDialogProps) {
  function choose(icon: PageIcon | null) {
    onSelect(icon)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workspace.icon.title')}</DialogTitle>
          <DialogDescription>{description ?? t('workspace.icon.description')}</DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label={t('workspace.icon.listLabel')}
          className="grid min-h-0 grid-cols-6 gap-1 overflow-y-auto px-4 pb-2"
        >
          {ICON_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={t('workspace.icon.use', { emoji })}
              onClick={() => {
                choose({ type: 'emoji', value: emoji })
              }}
              className="flex size-11 items-center justify-center rounded-tag text-xl hover:bg-hover md:size-10"
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
        {hasIcon ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="inline"
              className="w-full justify-start"
              onClick={() => {
                choose(null)
              }}
            >
              {t('workspace.icon.remove')}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
