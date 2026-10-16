import { describe, expect, it } from 'vitest'
import { ICON_CHOICES, pageIconSchema, parsePageIcon } from '@/features/workspace/page-icon'

describe('parsePageIcon', () => {
  it('accepts an emoji icon', () => {
    expect(parsePageIcon({ type: 'emoji', value: '📚' })).toEqual({ type: 'emoji', value: '📚' })
  })

  it('accepts emojis with variation selectors and ZWJ sequences', () => {
    expect(parsePageIcon({ type: 'emoji', value: '❤️' })).not.toBeNull()
    expect(parsePageIcon({ type: 'emoji', value: '🧑‍💻' })).not.toBeNull()
  })

  it('turns anything else into no icon, never throwing', () => {
    expect(parsePageIcon(null)).toBeNull()
    expect(parsePageIcon(undefined)).toBeNull()
    expect(parsePageIcon('📚')).toBeNull()
    expect(parsePageIcon({ type: 'url', value: 'https://exemplo.test/a.png' })).toBeNull()
    expect(parsePageIcon({ type: 'emoji', value: '' })).toBeNull()
    expect(parsePageIcon({ type: 'emoji', value: 'abc' })).toBeNull()
    expect(parsePageIcon({ type: 'emoji', value: '📚'.repeat(20) })).toBeNull()
    expect(parsePageIcon({ type: 'emoji' })).toBeNull()
  })
})

describe('ICON_CHOICES', () => {
  it('only offers icons the schema accepts, without repeats', () => {
    for (const value of ICON_CHOICES) {
      expect(pageIconSchema.safeParse({ type: 'emoji', value }).success, value).toBe(true)
    }
    expect(new Set(ICON_CHOICES).size).toBe(ICON_CHOICES.length)
  })
})
