import { ptBR } from '@/i18n/pt-BR'
import { t } from '@/i18n'

describe('t', () => {
  it('returns the pt-BR text for a nested key', () => {
    expect(t('layout.sidebar.home')).toBe(ptBR.layout.sidebar.home)
    expect(t('app.name')).toBe('AxeNotes')
  })

  it('falls back to the key when it does not exist', () => {
    // @ts-expect-error chave inexistente de propósito: o tipo deveria recusá-la
    expect(t('nao.existe')).toBe('nao.existe')
  })

  it('does not return a branch of the tree as text', () => {
    // @ts-expect-error "layout" é um grupo, não um texto
    expect(t('layout')).toBe('layout')
  })
})
