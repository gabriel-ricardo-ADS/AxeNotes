import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppLayout } from '@/app/layout/AppLayout'
import { NotFoundPage } from '@/app/NotFoundPage'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GuestOnly, RequireAuth } from '@/features/auth/guards'
import { RecoverPasswordPage } from '@/features/auth/pages/RecoverPasswordPage'
import { SignInPage } from '@/features/auth/pages/SignInPage'
import { SignUpPage } from '@/features/auth/pages/SignUpPage'
import { VerifyCodePage } from '@/features/auth/pages/VerifyCodePage'
import { HomePage } from '@/features/home/HomePage'
import { PagePage } from '@/features/pages/PagePage'
import { createQueryClient } from '@/lib/query-client'

const queryClient = createQueryClient()

/** Rotas do app, separadas do roteador para os testes usarem um MemoryRouter. */
export function AppRoutes() {
  return (
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
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
