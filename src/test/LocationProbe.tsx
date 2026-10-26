import { useLocation } from 'react-router'

/** Mostra o caminho atual (e o state) para o teste conferir navegações. */
export function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname + location.hash}
    </output>
  )
}
