import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'
import { sanitizeRedirect } from '@/features/auth/redirect'
import { t } from '@/i18n'

/** Tela neutra (só o fundo) enquanto a sessão carrega: evita piscar o app ou o formulário. */
function AuthLoading() {
  return (
    <div role="status" className="h-dvh bg-background">
      <span className="sr-only">{t('auth.loading')}</span>
    </div>
  )
}

function readFrom(state: unknown): unknown {
  return typeof state === 'object' && state !== null && 'from' in state ? state.from : undefined
}

/** Rotas do app: sem sessão vai para /entrar e, depois de entrar, volta para onde estava. */
export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return <AuthLoading />
  if (auth.status === 'unauthenticated') {
    // Depois de "Sair" não se guarda a origem (aparelho pode passar para outra pessoa).
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/entrar" replace state={auth.signedOutByUser ? undefined : { from }} />
  }
  return <Outlet />
}

/** Telas de autenticação: só para quem não está logado. */
export function GuestOnly() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return <AuthLoading />

  // Na recuperação de senha a sessão já existe, mas a pessoa ainda precisa definir a nova senha.
  const finishingRecovery = auth.recovering && location.pathname === '/recuperar-senha'
  if (auth.status === 'authenticated' && !finishingRecovery) {
    return <Navigate to={sanitizeRedirect(readFrom(location.state))} replace />
  }
  return <Outlet />
}
