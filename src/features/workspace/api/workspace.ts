import { z } from 'zod'
import type { WorkspaceInfo } from '@/features/workspace/types'
import { supabase } from '@/lib/supabase'

const membershipSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
  workspaces: z.object({
    id: z.string(),
    name: z.string(),
    home_page_id: z.string().nullable(),
  }),
})

/**
 * Workspace do usuário logado. Por enquanto existe um só (o pessoal, criado no cadastro), então
 * pega o mais antigo; quando houver convites (Fase 11) entra um seletor. A RLS já limita a
 * `workspace_members` às linhas de quem divide workspace comigo, por isso o filtro por user_id.
 */
export async function fetchWorkspace(userId: string): Promise<WorkspaceInfo | null> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces(id, name, home_page_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw new Error('workspace_fetch_failed')

  const row = (data as unknown[] | null)?.[0]
  if (row === undefined) return null
  const parsed = membershipSchema.safeParse(row)
  if (!parsed.success) throw new Error('workspace_invalid')

  const { role, workspaces } = parsed.data
  return {
    id: workspaces.id,
    name: workspaces.name,
    homePageId: workspaces.home_page_id,
    role,
  }
}

/** `home_page_id` atual do workspace (null = ainda não existe). */
export async function fetchHomePageId(workspaceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('home_page_id')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error) throw new Error('workspace_fetch_failed')
  return data?.home_page_id ?? null
}

/**
 * Grava a página inicial SÓ se ainda estiver vazia (`where home_page_id is null`), para duas abas
 * não se sobrescreverem. Devolve se esta chamada foi a que gravou. A RLS só deixa o owner atualizar:
 * sem permissão a consulta não falha, apenas não atinge linha nenhuma (devolve false).
 */
export async function setHomePageIfEmpty(workspaceId: string, pageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ home_page_id: pageId })
    .eq('id', workspaceId)
    .is('home_page_id', null)
    .select('id')
  if (error) throw new Error('workspace_update_failed')
  return data.length > 0
}
