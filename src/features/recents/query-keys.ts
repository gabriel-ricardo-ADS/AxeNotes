/** Chave do TanStack Query dos recentes (por usuário: são dados pessoais). */
export const recentKeys = {
  list: (userId: string | undefined) => ['recents', userId] as const,
}
