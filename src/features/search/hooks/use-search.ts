import { useQuery } from '@tanstack/react-query'
import { searchPages } from '@/features/search/api/search'
import { searchKeys } from '@/features/search/query-keys'
import { useWorkspace } from '@/features/workspace/hooks/use-workspace'

/**
 * Resultados para `term` (já normalizado; vazio = não consulta). A chave inclui o termo: uma resposta que
 * chega atrasada fica na entrada do termo antigo e nunca aparece no lugar da atual. Sem cache entre
 * consultas (`gcTime: 0`, `staleTime: 0`): a busca precisa refletir páginas renomeadas ou lixeadas agora há
 * pouco. Sem repetição automática: o erro mostra "Tentar de novo".
 */
export function useSearch(term: string) {
  const workspaceId = useWorkspace().data?.id

  return useQuery({
    queryKey: searchKeys.term(workspaceId, term),
    queryFn: ({ signal }) => searchPages(workspaceId ?? '', term, signal),
    enabled: workspaceId !== undefined && term !== '',
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
}
