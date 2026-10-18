import { describe, expect, it } from 'vitest'
import { formatEditedAgo, formatTrashedAgo } from '@/lib/relative-time'

const now = new Date('2026-10-16T12:00:00Z')

describe('formatEditedAgo', () => {
  it('says how many days ago, in pt-BR', () => {
    expect(formatEditedAgo('2026-09-27T12:00:00Z', now)).toBe('Editada há 19 dias')
  })

  it('handles hours, minutes and "just now"', () => {
    expect(formatEditedAgo('2026-10-16T09:00:00Z', now)).toBe('Editada há cerca de 3 horas')
    expect(formatEditedAgo('2026-10-16T11:55:00Z', now)).toBe('Editada há 5 minutos')
    expect(formatEditedAgo('2026-10-16T11:59:50Z', now)).toBe('Editada há menos de um minuto')
  })

  it('never shows the future when the device clock is behind', () => {
    expect(formatEditedAgo('2026-10-16T12:30:00Z', now)).toBe('Editada há menos de um minuto')
  })

  it('returns nothing for an invalid date', () => {
    expect(formatEditedAgo('não é data', now)).toBe('')
  })
})

describe('formatTrashedAgo', () => {
  it('says how long ago the page went to the trash, in pt-BR', () => {
    expect(formatTrashedAgo('2026-10-13T12:00:00Z', now)).toBe('Excluída há 3 dias')
    expect(formatTrashedAgo('2026-10-16T11:59:50Z', now)).toBe('Excluída há menos de um minuto')
  })

  it('accepts the timestamp format the database returns and ignores an invalid date', () => {
    expect(formatTrashedAgo('2026-10-13T12:00:00.123456+00:00', now)).toBe('Excluída há 3 dias')
    expect(formatTrashedAgo('?', now)).toBe('')
  })
})
