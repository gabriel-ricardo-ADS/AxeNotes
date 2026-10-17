import { mapTrashError } from '@/features/trash/trash'
import { t } from '@/i18n'

export type TrashAction = 'trash' | 'restore' | 'delete'

/** Mensagem em pt-BR para um erro de uma ação da lixeira. */
export function trashErrorMessage(action: TrashAction, error: unknown): string {
  const kind = mapTrashError(error)
  if (kind === 'forbidden') return t('trash.errors.forbidden')
  if (kind === 'parent_trashed' && action === 'restore') return t('trash.errors.restoreParentTrashed')
  return t(`trash.errors.${action}`)
}
