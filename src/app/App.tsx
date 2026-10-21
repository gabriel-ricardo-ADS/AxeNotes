import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { loadAppRoutes, loadAuthRoutes } from '@/app/route-modules'
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary'
import { ScreenLoading } from '@/components/ScreenLoading'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GuestOnly, RequireAuth } from '@/features/auth/guards'
import { lazyWithReload } from '@/lib/lazy-with-reload'
import { createQueryClient } from '@/lib/query-client'

const queryClient = createQueryClient()

const AuthLayout = lazyWithReload(() => loadAuthRoutes().then((m) => ({ default: m.AuthLayout })))
const SignInPage = lazyWithReload(() => loadAuthRoutes().then((m) => ({ default: m.SignInPage })))
const SignUpPage = lazyWithReload(() => loadAuthRoutes().then((m) => ({ default: m.SignUpPage })))
const VerifyCodePage = lazyWithReload(() =>
  loadAuthRoutes().then((m) => ({ default: m.VerifyCodePage })),
)
const RecoverPasswordPage = lazyWithReload(() =>
  loadAuthRoutes().then((m) => ({ default: m.RecoverPasswordPage })),
)
const AppLayout = lazyWithReload(() => loadAppRoutes().then((m) => ({ default: m.AppLayout })))
const HomePage = lazyWithReload(() => loadAppRoutes().then((m) => ({ default: m.HomePage })))
const PagePage = lazyWithReload(() => loadAppRoutes().then((m) => ({ default: m.PagePage })))
const TrashPage = lazyWithReload(() => loadAppRoutes().then((m) => ({ default: m.TrashPage })))
const NotFoundPage = lazyWithReload(() =>
  loadAppRoutes().then((m) => ({ default: m.NotFoundPage })),
)

/** Rotas do app, separadas do roteador para os testes usarem um MemoryRouter. */
export function AppRoutes() {
  const location = useLocation()

  // Um Suspense só: cada grupo de telas vem num chunk, então trocar de página dentro dele não suspende.
  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<ScreenLoading />}>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route element={<AuthLayout />}>
              <Route path="/entrar" element={<SignInPage />} />
              <Route path="/criar-conta" element={<SignUpPage />} />
              <Route path="/codigo" element={<VerifyCodePage />} />
              <Route path="/recuperar-senha" element={<RecoverPasswordPage />} />
            </Route>
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="p/:pageId" element={<PagePage />} />
              <Route path="lixeira" element={<TrashPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
