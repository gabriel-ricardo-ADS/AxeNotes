import { useEffect, useState } from 'react'

/** O valor só muda `delay` ms depois da última alteração; trocas mais rápidas se fundem na última. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (Object.is(value, debounced)) return
    const timer = window.setTimeout(() => {
      setDebounced(value)
    }, delay)
    return () => {
      window.clearTimeout(timer)
    }
  }, [value, delay, debounced])

  return debounced
}
