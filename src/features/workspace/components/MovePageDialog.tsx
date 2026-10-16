import { useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageIconView } from '@/features/workspace/components/PageIconView'
import { buildPageTree, flattenVisible, validateMove } from '@/features/workspace/tree'
import type { PageRow } from '@/features/workspace/types'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface MovePageDialogProps {
  /** Página a mover; `null` fecha o diálogo. */
  page: PageRow | null
  rows: readonly PageRow[]
  homeId: string | null
  onClose: () => void
  /** Destino: id da nova página pai, ou `null` para a raiz. A página vira a última filha. */
  onMove: (pageId: string, parentId: string | null) => void
}

const optionClass =
  'flex min-h-11 w-full items-center gap-2 rounded-tag px-2 text-left text-ui hover:bg-hover disabled:pointer-events-none disabled:opacity-40 md:min-h-8'

/**
 * "Mover para…": caminho de mover SEM arrastar (teclado, leitor de tela, toque). Lista a árvore
 * inteira como destinos; a própria página e as descendentes ficam desabilitadas (criariam ciclo).
 */
export function MovePageDialog({ page, rows, homeId, onClose, onMove }: MovePageDialogProps) {
  const options = useMemo(() => {
    const tree = buildPageTree(rows, homeId)
    return flattenVisible(tree, new Set(rows.map((row) => row.id)))
  }, [rows, homeId])

  const title = page === null ? '' : page.title || t('workspace.tree.untitled')

  return (
    <Dialog
      open={page !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workspace.move.title', { title })}</DialogTitle>
          <DialogDescription>{t('workspace.move.description')}</DialogDescription>
        </DialogHeader>
        {page === null ? null : (
          <ul
            aria-label={t('workspace.move.listLabel')}
            className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-3"
          >
            <li>
              <button
                type="button"
                className={optionClass}
                onClick={() => {
                  onMove(page.id, null)
                }}
              >
                {t('workspace.move.root')}
              </button>
            </li>
            {options.map((item) => (
              <li key={item.page.id}>
                <button
                  type="button"
                  disabled={validateMove(rows, page.id, item.page.id) !== 'ok'}
                  className={cn(optionClass)}
                  style={{ paddingInlineStart: `${String(0.5 + (item.level - 1) * 1)}rem` }}
                  onClick={() => {
                    onMove(page.id, item.page.id)
                  }}
                >
                  <PageIconView icon={item.page.icon} />
                  <span className="truncate">{item.page.title || t('workspace.tree.untitled')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
