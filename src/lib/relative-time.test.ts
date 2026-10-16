import { describe, expect, it } from 'vitest'
import { formatEditedAgo } from '@/lib/relative-time'

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
