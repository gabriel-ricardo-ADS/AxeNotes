import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { t } from '@/i18n'

/** Casca das telas de autenticação: cartão central, mobile-first, com o nome do app (sem logo). */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-foreground sm:justify-center sm:pt-8">
      <main id="conteudo" className="w-full max-w-sm">
        <p className="mb-6 text-center text-h3 font-semibold text-strong">{t('app.name')}</p>
        <Outlet />
      </main>
    </div>
  )
}

interface AuthCardProps {
  title: string
  description?: string | undefined
  children: ReactNode
}

/** Cartão de cada tela: título (h1), descrição e o conteúdo (formulário e links). */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section className="rounded-card border bg-sidebar p-5 sm:p-6">
      <h1 className="text-h2 font-semibold text-strong">{title}</h1>
      {description ? <p className="mt-2 text-ui text-muted-foreground">{description}</p> : null}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  )
}
