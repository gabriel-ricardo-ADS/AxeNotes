/** Chave do TanStack Query da busca: inclui o workspace e o TERMO, então cada termo tem a própria resposta. */
export const searchKeys = {
  term: (workspaceId: string | undefined, term: string) => ['search', workspaceId, term] as const,
}
