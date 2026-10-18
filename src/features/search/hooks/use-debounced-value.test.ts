import { act, renderHook } from '@testing-library/react'
import { useDebouncedValue } from '@/features/search/hooks/use-debounced-value'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('starts with the initial value and only follows after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBe('a')

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(result.current).toBe('a')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ab')
  })

  it('merges fast changes into the last one (the delay restarts on each change)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: '' },
    })

    for (const value of ['e', 'es', 'est', 'estu']) {
      rerender({ value })
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(result.current).toBe('')
    }
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('estu')
  })

  it('does not schedule anything when the value comes back to the settled one', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    })
    rerender({ value: 'b' })
    rerender({ value: 'a' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe('a')
    expect(vi.getTimerCount()).toBe(0)
  })
})
