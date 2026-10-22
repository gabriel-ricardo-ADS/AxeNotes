import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

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

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return value
}
