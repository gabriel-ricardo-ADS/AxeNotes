import { sanitizeRedirect } from '@/features/auth/redirect'

describe('sanitizeRedirect', () => {
  it('keeps internal paths with query and hash', () => {
    expect(sanitizeRedirect('/p/abc?x=1#topo')).toBe('/p/abc?x=1#topo')
    expect(sanitizeRedirect('/')).toBe('/')
  })

  it.each([
    '//evil.com',
    '//evil.com/entrar',
    'https://evil.com',
    'javascript:alert(1)',
    'p/abc',
    '/\\evil.com',
    '/a\\b',
    '/ok\nLocation: x',
    '/ok\tx',
  ])('rejects %j', (value) => {
    expect(sanitizeRedirect(value)).toBe('/')
  })

  it('rejects non-strings', () => {
    expect(sanitizeRedirect(undefined)).toBe('/')
    expect(sanitizeRedirect({ pathname: '/x' })).toBe('/')
  })

  it('does not send the user back to an auth screen', () => {
    expect(sanitizeRedirect('/entrar')).toBe('/')
    expect(sanitizeRedirect('/codigo?x=1')).toBe('/')
    expect(sanitizeRedirect('/recuperar-senha#a')).toBe('/')
    expect(sanitizeRedirect('/ENTRAR')).toBe('/')
    expect(sanitizeRedirect('/entrar/')).toBe('/')
    expect(sanitizeRedirect('/Criar-Conta/?x=1')).toBe('/')
  })
})
