import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TopBarSlotContext } from '@/app/layout/top-bar-context'

/** Conteúdo que aparece na faixa do topo (breadcrumb da página); as demais telas deixam vazia. */
export function TopBarPortal({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarSlotContext)
  if (!slot) return null
  return createPortal(
    <div data-top-bar className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3">
      {children}
    </div>,
    slot,
  )
}
