import { parseSupabaseEnv } from '@/lib/supabase-env'

// URL e chave fictícias.
const URL = 'https://exemplo.supabase.co'

describe('parseSupabaseEnv', () => {
  it('accepts a valid URL and key', () => {
    const env = parseSupabaseEnv({
      VITE_SUPABASE_URL: URL,
      VITE_SUPABASE_ANON_KEY: 'chave-ficticia',
    })

    expect(env.VITE_SUPABASE_URL).toBe(URL)
  })

  it('names the missing variables in the error', () => {
    expect(() => parseSupabaseEnv({})).toThrow(/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
  })

  it('rejects an invalid URL without echoing the values', () => {
    const call = () =>
      parseSupabaseEnv({
        VITE_SUPABASE_URL: 'nao-e-url',
        VITE_SUPABASE_ANON_KEY: 'segredo-ficticio',
      })

    expect(call).toThrow(/VITE_SUPABASE_URL/)
    expect(call).not.toThrow(/segredo-ficticio|nao-e-url/)
  })

  it('rejects a blank key', () => {
    expect(() =>
      parseSupabaseEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: '  ' }),
    ).toThrow(/VITE_SUPABASE_ANON_KEY/)
  })
})
