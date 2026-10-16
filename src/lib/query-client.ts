import { QueryClient } from '@tanstack/react-query'

/** Cria o cliente do TanStack Query (uma instância por app; testes criam a própria). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  })
}
