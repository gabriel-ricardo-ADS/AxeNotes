/** Chaves do TanStack Query da feature (todas incluem o usuário ou o workspace). */
export const workspaceKeys = {
  workspace: (userId: string | undefined) => ['workspace', userId] as const,
  pages: (workspaceId: string | undefined) => ['pages', workspaceId] as const,
  page: (pageId: string) => ['page', pageId] as const,
  home: (workspaceId: string | undefined) => ['home-page', workspaceId] as const,
}
