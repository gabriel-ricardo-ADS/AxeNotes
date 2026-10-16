import type { PageIcon } from '@/features/workspace/page-icon'

/** Página como a árvore e a tela da página a enxergam (sem conteúdo; ele chega na Fase 2). */
export interface PageRow {
  id: string
  parentId: string | null
  title: string
  icon: PageIcon | null
  sortKey: string
  /** ISO 8601, vem de `pages.last_edited_at`. */
  lastEditedAt: string
}

/** Workspace do usuário (hoje só o pessoal, sem seletor) e o papel dele nele. */
export interface WorkspaceInfo {
  id: string
  name: string
  homePageId: string | null
  role: 'owner' | 'editor' | 'viewer'
}

export function canEdit(workspace: WorkspaceInfo): boolean {
  return workspace.role === 'owner' || workspace.role === 'editor'
}
