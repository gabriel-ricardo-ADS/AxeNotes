import { contentErrorKind } from '@/features/sync/api/page-content'

// O cliente real do Supabase exige as variáveis de ambiente (ausentes no CI); aqui nada chega à rede.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

describe('contentErrorKind', () => {
  it('reconhece a recusa por permissão e as mensagens de limite do servidor', () => {
    expect(contentErrorKind({ code: '42501', message: 'forbidden' }, true)).toBe('forbidden')
    expect(contentErrorKind({ code: '42501', message: 'permission denied' }, true)).toBe(
      'forbidden',
    )
    expect(contentErrorKind({ code: '22023', message: 'page_content_too_large' }, true)).toBe(
      'too_large',
    )
    expect(contentErrorKind({ code: '22023', message: 'page_content_batch_too_large' }, true)).toBe(
      'batch_too_large',
    )
    expect(contentErrorKind({ code: '22023', message: 'page_content_live_too_large' }, true)).toBe(
      'live_too_large',
    )
    expect(contentErrorKind({ code: '22023', message: 'page_content_invalid' }, true)).toBe(
      'invalid',
    )
  })

  it('sem rede: offline (navegador offline ou erro de fetch)', () => {
    expect(contentErrorKind({ message: 'qualquer' }, false)).toBe('offline')
    expect(contentErrorKind({ code: '', message: 'TypeError: Failed to fetch' }, true)).toBe(
      'offline',
    )
    expect(contentErrorKind({ code: '', message: 'Load failed' }, true)).toBe('offline')
  })

  it('o resto é desconhecido (tenta de novo)', () => {
    expect(contentErrorKind({ code: 'PGRST301', message: 'JWT expired' }, true)).toBe('unknown')
  })
})
