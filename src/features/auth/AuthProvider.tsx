import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { signOut as apiSignOut, subscribeToAuthChanges } from '@/features/auth/api/auth'
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/features/auth/auth-context'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { resetClientState } from '@/lib/reset-client-state'

interface SessionState {
  status: AuthStatus
  session: Session | null
}

/**
 * Mantém a sessão do Supabase em estado React, alimentada só por `onAuthStateChange` (o primeiro
 * evento, `INITIAL_SESSION`, encerra o carregamento). O callback é síncrono: nada de chamar o
 * Supabase de dentro dele. Ao sair (pelo botão, por sessão expirada ou em outra aba) ou ao trocar de
 * usuário, `resetClientState` apaga cache, stores, IndexedDB, service worker e Cache Storage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null })
  const [recovering, setRecovering] = useState(false)
  const [signedOutByUser, setSignedOutByUser] = useState(false)
  const signOutRequested = useRef(false)
  const currentUserId = useRef<string | null>(null)
  /** Limpeza do último logout (a do evento), para o "Sair" esperar a mesma em vez de repetir. */
  const pendingReset = useRef<Promise<void> | null>(null)

  useEffect(() => {
    return subscribeToAuthChanges((event, session) => {
      const nextUserId = session?.user.id ?? null
      const changedUser = currentUserId.current !== null && currentUserId.current !== nextUserId
      if (event === 'SIGNED_OUT' || changedUser) {
        // A parte síncrona (cache e stores) roda já, antes do render com o novo estado.
        pendingReset.current = resetClientState(queryClient)
      } else if (session) {
        pendingReset.current = null
      }
      // Liga a árvore ao usuário logo de saída (assim a árvore, que pode montar depois, não perde o
      // que expandiu ao montar).
      useTreeUiStore.getState().bindUser(session?.user.id)
      currentUserId.current = nextUserId

      // PASSWORD_RECOVERY é só reforço: a tela de recuperação já marca `recovering` por conta própria.
      if (event === 'PASSWORD_RECOVERY' && session) setRecovering(true)
      if (!session) setRecovering(false)

      setSignedOutByUser(event === 'SIGNED_OUT' && signOutRequested.current)
      if (event === 'SIGNED_OUT') signOutRequested.current = false

      setState({ status: session ? 'authenticated' : 'unauthenticated', session })
    })
  }, [queryClient])

  const signOut = useCallback(async () => {
    signOutRequested.current = true
    try {
      await apiSignOut()
    } catch (error) {
      signOutRequested.current = false
      throw error
    }
    // O `SIGNED_OUT` já disparou a limpeza; espera a mesma (ou roda, se o evento não veio).
    await (pendingReset.current ?? resetClientState(queryClient))
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, recovering, signedOutByUser, setRecovering, signOut }),
    [state, recovering, signedOutByUser, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
