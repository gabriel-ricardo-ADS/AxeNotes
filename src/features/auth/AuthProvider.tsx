import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { signOut as apiSignOut, subscribeToAuthChanges } from '@/features/auth/api/auth'
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/features/auth/auth-context'
import { useTreeUiStore } from '@/features/workspace/tree-ui-store'
import { claimLocalData, readLocalDataOwner } from '@/lib/local-data-owner'
import { clientStateResetInProgress, resetClientState } from '@/lib/reset-client-state'

/** Quanto uma sessão nova espera a limpeza dos dados locais antes de desistir e sair. */
const LOCAL_DATA_RESET_TIMEOUT_MS = 10_000

/** `true` se a promise terminou dentro do prazo (a limpeza não rejeita: erros só vão para o log). */
function settleWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false)
    }, ms)
    void promise.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

interface SessionState {
  status: AuthStatus
  session: Session | null
}

/**
 * Mantém a sessão do Supabase em estado React, alimentada só por `onAuthStateChange` (o primeiro
 * evento, `INITIAL_SESSION`, encerra o carregamento). O callback é síncrono: nada de chamar o
 * Supabase de dentro dele. Ao sair (pelo botão, por sessão expirada ou em outra aba) ou ao trocar de
 * usuário, `resetClientState` apaga cache, stores, IndexedDB, service worker e Cache Storage. "Trocar
 * de usuário" inclui entrar com uma conta diferente do dono gravado dos dados locais
 * (src/lib/local-data-owner.ts), mesmo sem `SIGNED_OUT` antes; a sessão nova só é liberada depois da
 * limpeza, e aí os dados locais passam a ser dela.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null })
  const [recovering, setRecovering] = useState(false)
  const [signedOutByUser, setSignedOutByUser] = useState(false)
  const [localDataError, setLocalDataError] = useState(false)
  const signOutRequested = useRef(false)
  const currentUserId = useRef<string | null>(null)
  /** Limpeza do último logout (a do evento), para o "Sair" esperar a mesma em vez de repetir. */
  const pendingReset = useRef<Promise<void> | null>(null)

  /** Número do último evento: uma sessão segurada pela limpeza só entra se nada mais novo chegou. */
  const lastEvent = useRef(0)

  useEffect(() => {
    return subscribeToAuthChanges((event, session) => {
      const eventNumber = ++lastEvent.current
      const nextUserId = session?.user.id ?? null
      // Troca de conta com o app aberto, ou com ele fechado (a sessão de A expirou sem `SIGNED_OUT`
      // e B entrou): aí só o dono gravado dos dados locais denuncia que eles são de outra conta.
      const owner = readLocalDataOwner()
      const changedUser =
        (currentUserId.current !== null && currentUserId.current !== nextUserId) ||
        (nextUserId !== null && owner !== null && owner !== nextUserId)
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

      const next: SessionState = { status: session ? 'authenticated' : 'unauthenticated', session }
      const reset = clientStateResetInProgress()
      if (!session || !reset) {
        if (session) {
          claimLocalData(session.user.id)
          setLocalDataError(false)
        }
        setState(next)
        return
      }
      // Com uma limpeza em andamento (de outra conta ou do último logout), a sessão nova espera o
      // IndexedDB ser apagado: nada abre nem sincroniza página antes disso. Ao abrir o app fica em
      // `loading`; vinda das telas de entrar ou recuperar a senha, segue `unauthenticated` para elas
      // não desmontarem (a recuperação perderia a etapa).
      setState((current) => ({
        status: current.status === 'loading' ? 'loading' : 'unauthenticated',
        session: null,
      }))
      void settleWithin(reset, LOCAL_DATA_RESET_TIMEOUT_MS).then((settled) => {
        if (lastEvent.current !== eventNumber) return
        if (settled && claimLocalData(session.user.id)) {
          setLocalDataError(false)
          setState(next)
          return
        }
        // A limpeza falhou ou travou e os dados de outra conta seguem no aparelho: a sessão nova não
        // entra sobre eles. Sair dispara a limpeza de novo e a tela de entrar explica o que houve.
        setLocalDataError(true)
        apiSignOut().catch((error: unknown) => {
          console.error('Falha ao encerrar a sessão depois da limpeza dos dados locais', error)
        })
      })
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
    () => ({ ...state, recovering, signedOutByUser, localDataError, setRecovering, signOut }),
    [state, recovering, signedOutByUser, localDataError, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
