import { MenuIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Sidebar } from '@/app/layout/Sidebar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useSearchStore } from '@/features/search/search-store'
import { t } from '@/i18n'

interface MobileNavProps {
  /** Recebe o elemento onde a tela da página coloca o breadcrumb (portal). */
  slotRef: (element: HTMLElement | null) => void
}

/** Barra superior do mobile com o botão ☰, que abre a sidebar numa gaveta. Só pelo botão. */
export function MobileNav({ slotRef }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  // A busca abre por cima da gaveta (a gaveta fica por baixo); ao escolher um resultado, a gaveta fecha.
  const pickCount = useSearchStore((state) => state.pickCount)
  const seenPicks = useRef(pickCount)
  useEffect(() => {
    if (pickCount === seenPicks.current) return
    seenPicks.current = pickCount
    setOpen(false)
  }, [pickCount])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <header className="group/bar flex h-12 shrink-0 items-center gap-1 border-b px-1 pt-[env(safe-area-inset-top)] box-content">
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={t('layout.openMenu')}
            data-search-return=""
            className="flex size-11 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover"
          >
            <MenuIcon className="size-5" aria-hidden="true" />
          </button>
        </SheetTrigger>
        <span className="font-semibold text-strong group-has-[[data-top-bar]]/bar:hidden">
          {t('app.name')}
        </span>
        <div ref={slotRef} className="flex min-w-0 flex-1 items-center" />
      </header>

      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[min(18rem,85vw)] bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t('layout.sidebar.drawerTitle')}</SheetTitle>
          <SheetDescription>{t('layout.sidebar.drawerDescription')}</SheetDescription>
        </SheetHeader>
        <Sidebar
          onNavigate={() => {
            setOpen(false)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}
