import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'
import { act } from '@testing-library/react'

// Cliente do Supabase falso para os testes: `vi.mock('@/lib/supabase', async () => ({ supabase:
// (await import('@/test/fake-supabase')).fakeSupabase }))`. Dados fictícios.

type Listener = (event: AuthChangeEvent, session: Session | null) => void

const listeners = new Set<Listener>()

/** Entrega um evento de autenticação aos ouvintes, como o supabase-js faria. */
export function emitAuthEvent(event: AuthChangeEvent, session: Session | null) {
  act(() => {
    for (const listener of [...listeners]) listener(event, session)
  })
}

export function fakeSession(userId = 'user-1'): Session {
  return {
    access_token: 'token-ficticio',
    refresh_token: 'refresh-ficticio',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, email: 'ana@exemplo.test' },
  } as unknown as Session
}

interface Result {
  data: object
  error: AuthError | null
}

const ok: Result = { data: {}, error: null }
const resolvesOk = () => vi.fn<(arg?: unknown) => Promise<Result>>(() => Promise.resolve(ok))

export const fakeAuth = {
  onAuthStateChange: vi.fn((listener: Listener) => {
    listeners.add(listener)
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(listener)
          },
        },
      },
    }
  }),
  signInWithPassword: resolvesOk(),
  signUp: resolvesOk(),
  verifyOtp: resolvesOk(),
  resend: resolvesOk(),
  resetPasswordForEmail: resolvesOk(),
  updateUser: resolvesOk(),
  signOut: vi.fn<(arg?: { scope?: string }) => Promise<{ error: null }>>((arg) => {
    // `others` encerra só as sessões dos outros aparelhos: esta continua logada.
    if (arg?.scope !== 'others') emitAuthEvent('SIGNED_OUT', null)
    return Promise.resolve({ error: null })
  }),
}

export const fakeSupabase = { auth: fakeAuth, from: vi.fn() }

/** Zera chamadas e ouvintes entre testes. */
export function resetFakeSupabase() {
  listeners.clear()
  for (const fn of Object.values(fakeAuth)) fn.mockReset()
  fakeSupabase.from.mockReset()
}

/** Faz a consulta de `profiles` devolver este nome (ou nenhum perfil, com null). */
export function mockProfile(displayName: string | null) {
  const row = displayName === null ? null : { display_name: displayName }
  fakeSupabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
    }),
  })
}
