import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/**
 * `loading` até o primeiro evento de sessão do Supabase; depois `authenticated` ou
 * `unauthenticated`.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/** O que o `AuthProvider` entrega a quem chama `useAuth`. */
export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  /**
   * Verdadeiro entre o código de recuperação aceito e a nova senha salva. Nessa janela já existe
   * sessão, mas a pessoa precisa ficar na tela de recuperação (a guarda "só deslogado" respeita).
   */
  recovering: boolean
  /** A sessão acabou porque a pessoa clicou em "Sair": não guardar a rota de origem. */
  signedOutByUser: boolean
  /**
   * A última entrada foi desfeita porque não deu para apagar deste aparelho os dados locais de outra
   * conta (src/lib/local-data-owner.ts). A tela de entrar avisa; some na próxima entrada que der certo.
   */
  localDataError: boolean
  setRecovering: (value: boolean) => void
  signOut: () => Promise<void>
}

/** Contexto da sessão; leia por `useAuth`, que lança erro fora do `AuthProvider`. */
export const AuthContext = createContext<AuthContextValue | null>(null)

/** Sessão e ações de autenticação do `AuthProvider`. Lança erro se usado fora dele. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return value
}
