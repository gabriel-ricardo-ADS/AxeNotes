import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
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

const ok = { data: {}, error: null }

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
  signInWithPassword: vi.fn(() => Promise.resolve(ok)),
  signUp: vi.fn(() => Promise.resolve(ok)),
  verifyOtp: vi.fn(() => Promise.resolve(ok)),
  resend: vi.fn(() => Promise.resolve(ok)),
  resetPasswordForEmail: vi.fn(() => Promise.resolve(ok)),
  updateUser: vi.fn(() => Promise.resolve(ok)),
  signOut: vi.fn(() => {
    emitAuthEvent('SIGNED_OUT', null)
    return Promise.resolve({ error: null })
  }),
}

export const fakeSupabase = { auth: fakeAuth, from: vi.fn() }

/** Zera chamadas e ouvintes entre testes. */
export function resetFakeSupabase() {
  listeners.clear()
  for (const fn of Object.values(fakeAuth)) fn.mockClear()
  fakeSupabase.from.mockReset()
}
