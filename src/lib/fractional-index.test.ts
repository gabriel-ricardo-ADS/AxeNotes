import { describe, expect, it } from 'vitest'
import { keyAtIndex, keyBetween } from '@/lib/fractional-index'

describe('keyBetween', () => {
  it('creates a first key and keys at both ends', () => {
    const first = keyBetween(null, null)
    expect(keyBetween(first, null) > first).toBe(true)
    expect(keyBetween(null, first) < first).toBe(true)
  })

  it('creates a key strictly between two siblings, many times in a row', () => {
    let low = keyBetween(null, null)
    const high = keyBetween(low, null)
    for (let i = 0; i < 50; i += 1) {
      const middle = keyBetween(low, high)
      expect(middle > low).toBe(true)
      expect(middle < high).toBe(true)
      low = middle
    }
  })

  it('does not throw when two tabs produced the same key: goes right after it', () => {
    const key = keyBetween(null, null)
    const result = keyBetween(key, key)
    expect(result > key).toBe(true)
  })

  it('sorts with plain string comparison, which is not what localeCompare does', () => {
    // Ordem "C" (bytes): maiúsculas antes de minúsculas. localeCompare diria o contrário.
    const text = (value: string): string => value
    const low = text('Zz')
    const high = text('a0')
    expect(low < high).toBe(true)
    expect(low.localeCompare(high)).toBeGreaterThan(0)
    const middle = keyBetween(low, high)
    expect(middle > low && middle < high).toBe(true)
  })
})

describe('keyAtIndex', () => {
  const keys = ['a0', 'a1', 'a2']

  it('inserts at the start, in the middle and at the end', () => {
    expect(keyAtIndex(keys, 0) < 'a0').toBe(true)
    const middle = keyAtIndex(keys, 1)
    expect(middle > 'a0' && middle < 'a1').toBe(true)
    expect(keyAtIndex(keys, 3) > 'a2').toBe(true)
  })

  it('clamps an index outside the list and handles an empty list', () => {
    expect(keyAtIndex(keys, 99) > 'a2').toBe(true)
    expect(keyAtIndex(keys, -5) < 'a0').toBe(true)
    expect(keyAtIndex([], 0)).toBe(keyBetween(null, null))
  })
})
