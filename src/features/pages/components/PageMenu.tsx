import { EllipsisIcon } from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTrashPage } from '@/features/trash/hooks/use-trash-page'
import { t } from '@/i18n'

interface PageMenuProps {
  pageId: string
  /** Erro da ação, mostrado pela própria página (a gaveta mobile está fechada: a sidebar não aparece). */
  onError: (message: string) => void
  /** Chamado ao começar uma ação, para limpar o erro anterior. */
  onStart: () => void
}

/**
 * Menu "…" do topo da página. Hoje só tem "Mover para a lixeira"; quem chama só renderiza este menu
 * quando a ação existe (editor, e a página não é a inicial nem contém a inicial). O item fica desabilitado
 * ("Movendo…") enquanto o servidor responde: a página só sai da tela depois que ele aceita.
 */
export function PageMenu({ pageId, onError, onStart }: PageMenuProps) {
  const { trashPage } = useTrashPage()
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)

  async function handleTrash() {
    setMoving(true)
    onStart()
    try {
      await trashPage(pageId, { confirmFirst: true, onError })
    } finally {
      setMoving(false)
      setOpen(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('trash.pageMenu')}
          className="flex size-11 shrink-0 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover hover:text-strong md:size-8"
        >
          <EllipsisIcon className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={moving}
          onSelect={(event) => {
            // Mantém o menu aberto até o servidor responder, para o "Movendo…" aparecer.
            event.preventDefault()
            void handleTrash()
          }}
        >
          {moving ? t('trash.moving') : t('workspace.tree.moveToTrash')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
