import { act, renderHook } from '@testing-library/react'
import { useCooldown } from '@/features/auth/hooks/use-cooldown'

describe('useCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts idle', () => {
    const { result } = renderHook(() => useCooldown(60))

    expect(result.current.remaining).toBe(0)
  })

  it('counts down after start() and returns to zero', () => {
    const { result } = renderHook(() => useCooldown(60))

    act(() => {
      result.current.start()
    })
    expect(result.current.remaining).toBe(60)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.remaining).toBe(50)

    act(() => {
      vi.advanceTimersByTime(50_000)
    })
    expect(result.current.remaining).toBe(0)
  })

  it('can start already running', () => {
    const { result } = renderHook(() => useCooldown(60, true))

    expect(result.current.remaining).toBe(60)
  })
})
