import type { TranslationKey } from '@/i18n'

/**
 * Categorias de falha de autenticação que a interface sabe explicar (cada uma tem texto em
 * pt-BR).
 */
export type AuthFailureKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'invalid_code'
  | 'weak_password'
  | 'same_password'
  | 'network'
  | 'unknown'

/** Erro de um fluxo de autenticação, já reduzido a uma categoria (sem texto do servidor). */
export class AuthFlowError extends Error {
  readonly kind: AuthFailureKind

  constructor(kind: AuthFailureKind) {
    super(kind)
    this.name = 'AuthFlowError'
    this.kind = kind
  }
}

interface ErrorLike {
  name?: unknown
  code?: unknown
  status?: unknown
}

/**
 * Reduz qualquer erro do supabase-js a uma categoria. Nunca repassa `message` do servidor (pode
 * revelar se um e-mail existe) e nunca registra nada em log.
 */
export function mapAuthError(error: unknown): AuthFailureKind {
  if (error instanceof AuthFlowError) return error.kind
  if (error instanceof TypeError) return 'network'
  if (typeof error !== 'object' || error === null) return 'unknown'

  const { name, code, status } = error as ErrorLike

  switch (code) {
    case 'invalid_credentials':
      return 'invalid_credentials'
    case 'email_not_confirmed':
      return 'email_not_confirmed'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate_limited'
    // O GoTrue usa otp_expired tanto para código vencido quanto para código errado.
    case 'otp_expired':
      return 'invalid_code'
    case 'weak_password':
      return 'weak_password'
    case 'same_password':
      return 'same_password'
    default:
      break
  }

  if (status === 429) return 'rate_limited'
  if (name === 'AuthRetryableFetchError') return 'network'
  return 'unknown'
}

const MESSAGE_KEYS = {
  invalid_credentials: 'auth.errors.invalidCredentials',
  email_not_confirmed: 'auth.errors.emailNotConfirmed',
  rate_limited: 'auth.errors.rateLimited',
  invalid_code: 'auth.errors.invalidCode',
  weak_password: 'auth.errors.weakPassword',
  same_password: 'auth.errors.samePassword',
  network: 'auth.errors.network',
  unknown: 'auth.errors.unknown',
} as const satisfies Record<AuthFailureKind, TranslationKey>

/** Chave do texto (pt-BR) para mostrar ao usuário. */
export function authErrorMessageKey(kind: AuthFailureKind): TranslationKey {
  return MESSAGE_KEYS[kind]
}
