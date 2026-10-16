import { AuthError } from '@supabase/supabase-js'
import { AuthFlowError, authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { t } from '@/i18n'

function authError(code: string | undefined, status: number | undefined, name = 'AuthApiError') {
  const error = new AuthError('mensagem interna do servidor', status, code)
  error.name = name
  return error
}

describe('mapAuthError', () => {
  it.each([
    ['invalid_credentials', 400, 'invalid_credentials'],
    ['email_not_confirmed', 400, 'email_not_confirmed'],
    ['over_email_send_rate_limit', 429, 'rate_limited'],
    ['over_request_rate_limit', 429, 'rate_limited'],
    ['otp_expired', 403, 'invalid_code'],
    ['weak_password', 422, 'weak_password'],
    ['same_password', 422, 'same_password'],
    ['validation_failed', 400, 'unknown'],
    ['user_already_exists', 422, 'unknown'],
  ] as const)('maps %s (HTTP %i) to %s', (code, status, kind) => {
    expect(mapAuthError(authError(code, status))).toBe(kind)
  })

  it('treats any 429 as a rate limit, even without a code', () => {
    expect(mapAuthError(authError(undefined, 429))).toBe('rate_limited')
  })

  it('detects network failures', () => {
    expect(mapAuthError(authError(undefined, 0, 'AuthRetryableFetchError'))).toBe('network')
    expect(mapAuthError(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('falls back to unknown for anything else', () => {
    expect(mapAuthError(new Error('boom'))).toBe('unknown')
    expect(mapAuthError(null)).toBe('unknown')
    expect(mapAuthError('texto')).toBe('unknown')
  })

  it('keeps the kind of an AuthFlowError', () => {
    expect(mapAuthError(new AuthFlowError('invalid_code'))).toBe('invalid_code')
  })
})

describe('authErrorMessageKey', () => {
  it('uses generic pt-BR messages that never reveal whether an e-mail exists', () => {
    expect(t(authErrorMessageKey('invalid_credentials'))).toBe('E-mail ou senha incorretos.')
    expect(t(authErrorMessageKey('unknown'))).toBe('Algo deu errado. Tente novamente.')
  })

  it('never exposes the server message', () => {
    const kind = mapAuthError(authError('invalid_credentials', 400))

    expect(t(authErrorMessageKey(kind))).not.toContain('servidor')
  })
})
