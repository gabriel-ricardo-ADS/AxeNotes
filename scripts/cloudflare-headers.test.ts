// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseHeadersFile } from './cloudflare-headers.ts'

const file = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

/** `default-src 'self'; img-src a b` → { 'default-src': ["'self'"], 'img-src': ['a', 'b'] } */
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name = '', ...sources]) => [name, sources]),
  )
}

describe('parseHeadersFile', () => {
  it('reads the /* rule, ignoring comments and blank lines (LF or CRLF)', () => {
    const source = '# comentário\r\n\r\n/*\r\n  X-A: 1\r\n  # outro\r\n  X-B: dois: três\r\n'

    expect(parseHeadersFile(source)).toEqual({ 'X-A': '1', 'X-B': 'dois: três' })
  })

  it.each([
    ['another rule', '/*\n  X-A: 1\n/assets/*\n  X-B: 2\n'],
    ['a rule other than /*', '/app/*\n  X-A: 1\n'],
    ['a header outside the rule', '  X-A: 1\n/*\n  X-B: 2\n'],
    ['a detach line', '/*\n  ! X-A\n'],
    ['a line without a colon', '/*\n  X-A 1\n'],
    ['an empty value', '/*\n  X-A:\n'],
    ['a repeated header', '/*\n  X-A: 1\n  x-a: 2\n'],
    ['no rule at all', '# só comentário\n'],
    ['a rule without headers', '/*\n'],
  ])('fails on an unsupported format: %s', (_label, source) => {
    expect(() => parseHeadersFile(source)).toThrow()
  })
})

describe('public/_headers', () => {
  const headers = parseHeadersFile(file)

  it('has the minimal CSP', () => {
    const csp = directives(headers['Content-Security-Policy'] ?? '')

    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['script-src']).toEqual(["'self'"])
    // 'unsafe-inline' só por causa do <style> do react-remove-scroll-bar (Radix); ver docs/DEPLOY.md.
    expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"])
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:'])
    expect(csp['font-src']).toEqual(["'self'"])
    expect(csp['connect-src']).toEqual(["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
    expect(csp['object-src']).toEqual(["'none'"])
    // Script inline segue proibido em qualquer caso.
    expect(csp['script-src']).not.toContain("'unsafe-inline'")
    expect(csp['script-src']).not.toContain("'unsafe-eval'")
  })

  it('has the other security headers', () => {
    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    })
    expect(headers['Permissions-Policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    )
  })

  it('keeps every line under the Cloudflare limit (2,000 characters)', () => {
    for (const line of file.split('\n')) expect(line.length).toBeLessThan(2000)
  })
})
