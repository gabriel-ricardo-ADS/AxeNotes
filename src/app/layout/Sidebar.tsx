import { HouseIcon, Trash2Icon } from 'lucide-react'
import { NavLink } from 'react-router'
import { SidebarNotice } from '@/app/layout/SidebarNotice'
import { FavoritesSection } from '@/features/favorites/components/FavoritesSection'
import { RecentsSection } from '@/features/recents/components/RecentsSection'
import { SearchButton } from '@/features/search/components/SearchButton'
import { UserMenu } from '@/features/auth/components/UserMenu'
import { PagesSection } from '@/features/workspace/components/PagesSection'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface SidebarProps {
  /** Chamado ao ativar um link; a gaveta mobile usa para se fechar. */
  onNavigate?: () => void
}

/** Conteúdo da sidebar, igual na barra fixa (desktop) e na gaveta (mobile). */
export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <nav
      aria-label={t('layout.sidebar.label')}
      className="flex h-full flex-col gap-5 overflow-y-auto px-2 py-3 text-ui"
    >
      <p className="px-2 font-semibold text-strong">{t('app.name')}</p>

      <ul className="flex flex-col gap-0.5">
        <li>
          <SearchButton />
        </li>
        <li>
          <NavLink
            to="/"
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-2 rounded-tag px-2 text-muted-foreground transition-colors duration-(--duration-ui) hover:bg-hover md:min-h-8',
                isActive && 'bg-hover font-medium text-strong',
              )
            }
          >
            <HouseIcon className="size-4 shrink-0" aria-hidden="true" />
            {t('layout.sidebar.home')}
          </NavLink>
        </li>
      </ul>

      <SidebarNotice />

      <FavoritesSection onNavigate={onNavigate} />

      <PagesSection onNavigate={onNavigate} />

      <RecentsSection onNavigate={onNavigate} />

      {/* Rodapé: "Lixeira" acima da conta; o mt-auto empurra os dois para o fim da barra. */}
      <div className="mt-auto flex flex-col gap-2">
        <NavLink
          to="/lixeira"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-2 rounded-tag px-2 text-muted-foreground transition-colors duration-(--duration-ui) hover:bg-hover md:min-h-8',
              isActive && 'bg-hover font-medium text-strong',
            )
          }
        >
          <Trash2Icon className="size-4 shrink-0" aria-hidden="true" />
          {t('layout.sidebar.trash')}
        </NavLink>
        <UserMenu />
      </div>
    </nav>
  )
}
