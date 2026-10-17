/** Chave do TanStack Query da lixeira (por workspace: a lista é de todos os membros). */
export const trashKeys = {
  list: (workspaceId: string | undefined) => ['trash', workspaceId] as const,
}
