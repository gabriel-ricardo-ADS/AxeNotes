import { useState } from 'react'
import { Outlet } from 'react-router'
import { MobileNav } from '@/app/layout/MobileNav'
import { Sidebar } from '@/app/layout/Sidebar'
import { TopBarSlotContext } from '@/app/layout/top-bar-context'
import { SearchDialog } from '@/features/search/components/SearchDialog'
import { useMediaQuery } from '@/hooks/use-media-query'
import { t } from '@/i18n'

/** A partir daqui a sidebar fica fixa; abaixo disso vira gaveta (igual ao `md` do Tailwind). */
export const DESKTOP_QUERY = '(min-width: 768px)'

/** Estrutura do app: sidebar fixa (desktop) ou gaveta pelo ☰ (mobile) + área de conteúdo. */
export function AppLayout() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null)

  return (
    <TopBarSlotContext.Provider value={topBarSlot}>
      <div className="flex h-dvh flex-col bg-background text-foreground md:flex-row">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-tag bg-popover px-3 py-2 text-ui focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
        >
          {t('layout.skipToContent')}
        </a>

        {isDesktop ? (
          <aside className="w-sidebar shrink-0 border-r bg-sidebar">
            <Sidebar />
          </aside>
        ) : (
          <MobileNav slotRef={setTopBarSlot} />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isDesktop ? (
            <div ref={setTopBarSlot} className="shrink-0 px-3 empty:hidden md:px-4" />
          ) : null}
          <main
            id="conteudo"
            tabIndex={-1}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto focus:outline-none"
          >
            <Outlet />
          </main>
        </div>

        <SearchDialog />
      </div>
    </TopBarSlotContext.Provider>
  )
}
