import { z } from 'zod'
import { parsePageIcon, type PageIcon } from '@/features/workspace/page-icon'
import type { PageRow } from '@/features/workspace/types'
import { supabase } from '@/lib/supabase'

const PAGE_COLUMNS = 'id, parent_id, title, icon, sort_key, last_edited_at'
/** O PostgREST devolve no máximo 1000 linhas por consulta: a lista vem em lotes deste tamanho. */
const BATCH = 1000

const pageDbRowSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  title: z.string(),
  icon: z.unknown(),
  sort_key: z.string(),
  last_edited_at: z.string(),
})

function toPageRow(raw: unknown): PageRow {
  const row = pageDbRowSchema.parse(raw)
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: parsePageIcon(row.icon),
    sortKey: row.sort_key,
    lastEditedAt: row.last_edited_at,
  }
}

/** Todas as páginas do workspace fora da lixeira (só o necessário para a árvore). */
export async function fetchPages(workspaceId: string): Promise<PageRow[]> {
  const rows: PageRow[] = []
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from('pages')
      .select(PAGE_COLUMNS)
      .eq('workspace_id', workspaceId)
      .is('trashed_at', null)
      .order('id', { ascending: true })
      .range(from, from + BATCH - 1)
    if (error) throw new Error('pages_fetch_failed')
    rows.push(...(data as unknown[]).map(toPageRow))
    if (data.length < BATCH) return rows
  }
}

/** Uma página; null se não existe, está na lixeira ou a RLS não deixa ver (indistinguível de propósito). */
export async function fetchPage(pageId: string): Promise<PageRow | null> {
  const { data, error } = await supabase
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('id', pageId)
    .is('trashed_at', null)
    .maybeSingle()
  if (error) throw new Error('pages_fetch_failed')
  return data === null ? null : toPageRow(data)
}

export interface NewPage {
  id: string
  workspaceId: string
  parentId: string | null
  title: string
  icon: PageIcon | null
  sortKey: string
  createdBy: string
}

/**
 * Cria a página com o id gerado no cliente e SEM `RETURNING`: a política de SELECT poderia não
 * enxergar a linha recém-inserida. Só as colunas que o banco permite inserir.
 */
export async function insertPage(page: NewPage): Promise<void> {
  const { error } = await supabase.from('pages').insert({
    id: page.id,
    workspace_id: page.workspaceId,
    parent_id: page.parentId,
    title: page.title,
    icon: page.icon,
    sort_key: page.sortKey,
    created_by: page.createdBy,
  })
  if (error) throw new Error('pages_insert_failed')
}

export interface PagePatch {
  parentId?: string | null
  title?: string
  icon?: PageIcon | null
  sortKey?: string
}

/** Atualiza só as colunas permitidas ao cliente (parent_id, title, icon, sort_key). */
export async function updatePage(pageId: string, patch: PagePatch): Promise<void> {
  const { error } = await supabase
    .from('pages')
    .update({
      ...(patch.parentId !== undefined && { parent_id: patch.parentId }),
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.icon !== undefined && { icon: patch.icon }),
      ...(patch.sortKey !== undefined && { sort_key: patch.sortKey }),
    })
    .eq('id', pageId)
  if (error) throw new Error('pages_update_failed')
}

/** Manda para a lixeira e apaga em definitivo (o banco só deixa apagar quem já está na lixeira). */
export async function trashAndDeletePage(pageId: string): Promise<void> {
  const trashed = await supabase.rpc('trash_page', { p_page_id: pageId })
  if (trashed.error) throw new Error('pages_trash_failed')
  const { error } = await supabase.from('pages').delete().eq('id', pageId)
  if (error) throw new Error('pages_delete_failed')
}
