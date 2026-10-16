/** Chave do TanStack Query dos favoritos (por usuário: são dados pessoais). */
export const favoriteKeys = {
  list: (userId: string | undefined) => ['favorites', userId] as const,
}
