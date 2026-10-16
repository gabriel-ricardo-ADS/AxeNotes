import { XIcon } from 'lucide-react'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { t } from '@/i18n'

/** Aviso de erro das ações da sidebar (árvore, favoritos), dispensável. Fica no topo, visível em qualquer seção. */
export function SidebarNotice() {
  const notice = useTreeUiStore((state) => state.notice)
  const setNotice = useTreeUiStore((state) => state.setNotice)

  if (notice === null) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-1 rounded-tag bg-red-block py-1 pr-1 pl-2 text-meta text-red"
    >
      <p className="flex-1 py-1">{notice}</p>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={() => {
          setNotice(null)
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-tag hover:bg-hover"
      >
        <XIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
