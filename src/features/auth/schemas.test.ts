import {
  emailSchema,
  newPasswordSchema,
  normalizeCode,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  verifyCodeSchema,
} from '@/features/auth/schemas'

describe('signUpSchema', () => {
  const valid = { name: '  Ana Teste ', email: ' ANA@Exemplo.com ', password: 'senha-forte-1' }

  it('trims the name and lowercases the e-mail', () => {
    const result = signUpSchema.parse(valid)

    expect(result.name).toBe('Ana Teste')
    expect(result.email).toBe('ana@exemplo.com')
  })

  it('requires a name of up to 100 characters', () => {
    expect(signUpSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...valid, name: 'a'.repeat(101) }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...valid, name: 'a'.repeat(100) }).success).toBe(true)
  })

  it('requires a valid e-mail', () => {
    const result = signUpSchema.safeParse({ ...valid, email: 'sem-arroba' })

    expect(result.success).toBe(false)
    if (!result.success) expect(toFieldErrors(result.error).email).toBe('Informe um e-mail válido.')
  })

  it('requires at least 8 characters in the password', () => {
    expect(signUpSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...valid, password: '12345678' }).success).toBe(true)
  })
})

describe('password limit', () => {
  it('counts 72 BYTES, not characters', () => {
    // 72 caracteres ASCII = 72 bytes: ok.
    expect(newPasswordSchema.safeParse({ password: 'a'.repeat(72) }).success).toBe(true)
    expect(newPasswordSchema.safeParse({ password: 'a'.repeat(73) }).success).toBe(false)
    // 40 caracteres de 2 bytes = 80 bytes: passa em caracteres, mas deve falhar em bytes.
    expect(newPasswordSchema.safeParse({ password: 'é'.repeat(40) }).success).toBe(false)
    expect(newPasswordSchema.safeParse({ password: 'é'.repeat(36) }).success).toBe(true)
  })

  it('counts emoji by their UTF-8 size (4 bytes each)', () => {
    expect(newPasswordSchema.safeParse({ password: '🔒'.repeat(18) }).success).toBe(true)
    expect(newPasswordSchema.safeParse({ password: '🔒'.repeat(19) }).success).toBe(false)
  })
})

describe('signInSchema', () => {
  it('only requires a non-empty password (no strength rules at login)', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })
})

describe('emailSchema and verifyCodeSchema', () => {
  it('normalizes the e-mail', () => {
    expect(emailSchema.parse({ email: ' A@B.co ' }).email).toBe('a@b.co')
  })

  it('requires exactly 6 digits in the code', () => {
    const base = { email: 'a@b.co' }

    expect(verifyCodeSchema.safeParse({ ...base, code: '123456' }).success).toBe(true)
    expect(verifyCodeSchema.safeParse({ ...base, code: '12345' }).success).toBe(false)
    expect(verifyCodeSchema.safeParse({ ...base, code: '1234567' }).success).toBe(false)
    expect(verifyCodeSchema.safeParse({ ...base, code: '12345a' }).success).toBe(false)
  })
})

describe('normalizeCode', () => {
  it('keeps only digits and limits to 6', () => {
    expect(normalizeCode('123 456')).toBe('123456')
    expect(normalizeCode('12-34-56-78')).toBe('123456')
    expect(normalizeCode('abc')).toBe('')
  })
})
