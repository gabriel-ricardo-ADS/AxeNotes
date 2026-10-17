import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { separateCount, type TrashRoot } from '@/features/trash/trash'
import { t } from '@/i18n'

interface DeleteForeverDialogProps {
  /** Página a excluir; null = fechado. */
  root: TrashRoot | null
  /** O servidor ainda está apagando. */
  deleting: boolean
  onConfirm: () => void
  onClose: () => void
}

function descriptionFor(root: TrashRoot): string {
  const count = root.descendantCount
  if (count === 0) return t('trash.dialog.descriptionAlone')
  if (count === 1) return t('trash.dialog.descriptionOne')
  return t('trash.dialog.descriptionMany', { count })
}

/**
 * Confirmação de "Excluir definitivamente". O foco inicial fica em Cancelar (padrão do AlertDialog).
 * A contagem inclui TODAS as subpáginas, porque o banco apaga todas (inclusive as que foram para a
 * lixeira antes e aparecem como linhas separadas na lista).
 */
export function DeleteForeverDialog({
  root,
  deleting,
  onConfirm,
  onClose,
}: DeleteForeverDialogProps) {
  const title = root === null ? '' : root.page.title || t('workspace.tree.untitled')
  return (
    <AlertDialog
      open={root !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>{t('trash.dialog.title', { title })}</AlertDialogTitle>
        {root === null ? null : (
          <AlertDialogDescription>
            {descriptionFor(root)}
            {separateCount(root) > 0 ? (
              <span className="mt-2 block">{t('trash.dialog.separate')}</span>
            ) : null}
          </AlertDialogDescription>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost" disabled={deleting}>
              {t('common.cancel')}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={(event) => {
                // Fica aberto (com "Excluindo…") até o servidor responder.
                event.preventDefault()
                onConfirm()
              }}
            >
              {deleting ? t('trash.deleting') : t('trash.deleteForever')}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
