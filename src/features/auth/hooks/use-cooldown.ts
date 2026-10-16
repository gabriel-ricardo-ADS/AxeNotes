import { useCallback, useEffect, useState } from 'react'

/**
 * Contagem regressiva para o "reenviar código" (espera entre reenvios). Usa o relógio, não só o
 * intervalo, para continuar certa se a aba ficar em segundo plano.
 */
export function useCooldown(seconds: number, startActive = false) {
  const [endsAt, setEndsAt] = useState<number | null>(() =>
    startActive ? Date.now() + seconds * 1000 : null,
  )
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (endsAt === null) return
    const id = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= endsAt) setEndsAt(null)
    }, 250)
    return () => {
      clearInterval(id)
    }
  }, [endsAt])

  const start = useCallback(() => {
    const current = Date.now()
    setNow(current)
    setEndsAt(current + seconds * 1000)
  }, [seconds])

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000))
  return { remaining, start }
}
