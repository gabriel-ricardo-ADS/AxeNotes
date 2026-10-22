import { z } from 'zod'
import { parsePageIcon, type PageIcon } from '@/features/workspace/page-icon'
import type { PageRow } from '@/features/workspace/types'
import { supabase } from '@/lib/supabase'
import { parseSupabaseEnv } from '@/lib/supabase-env'

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

/**
 * Todas as páginas do workspace fora da lixeira (só o necessário para a árvore). Paginação por cursor
 * (`id > último`): inserir ou apagar entre dois lotes não pula nem repete linhas. O fim é quando o lote
 * vem vazio, então um `max_rows` do servidor menor que BATCH também não trunca a lista.
 */
export async function fetchPages(workspaceId: string): Promise<PageRow[]> {
  const rows = new Map<string, PageRow>()
  let cursor: string | null = null
  for (;;) {
    let query = supabase
      .from('pages')
      .select(PAGE_COLUMNS)
      .eq('workspace_id', workspaceId)
      .is('trashed_at', null)
      .order('id', { ascending: true })
      .limit(BATCH)
    if (cursor !== null) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw new Error('pages_fetch_failed')
    const batch = (data as unknown[]).map(toPageRow)
    for (const row of batch) rows.set(row.id, row)
    const last = batch[batch.length - 1]
    if (last === undefined) return [...rows.values()]
    cursor = last.id
  }
}

/** Página aberta pela rota: a da lixeira também abre, só para leitura. */
export interface FoundPage {
  page: PageRow
  trashed: boolean
}

const trashedAtSchema = z.object({ trashed_at: z.string().nullable() })

/**
 * Uma página, inclusive na lixeira (abre só para leitura). null se não existe ou a RLS não deixa ver
 * (indistinguível de propósito); quem vê a lixeira já é membro do workspace, então nada vaza.
 */
export async function fetchPage(pageId: string): Promise<FoundPage | null> {
  const { data, error } = await supabase
    .from('pages')
    .select(`${PAGE_COLUMNS}, trashed_at`)
    .eq('id', pageId)
    .maybeSingle()
  if (error) throw new Error('pages_fetch_failed')
  if (data === null) return null
  return { page: toPageRow(data), trashed: trashedAtSchema.parse(data).trashed_at !== null }
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

function toDbPatch(patch: PagePatch) {
  return {
    ...(patch.parentId !== undefined && { parent_id: patch.parentId }),
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.icon !== undefined && { icon: patch.icon }),
    ...(patch.sortKey !== undefined && { sort_key: patch.sortKey }),
  }
}

const idRowsSchema = z.array(z.object({ id: z.string() }))

/**
 * O mesmo PATCH, mas por `fetch` com `keepalive: true`: o navegador termina o envio mesmo se a página
 * for recarregada ou fechada logo depois (o `fetch` comum é cancelado). Só para o salvamento ao sair
 * da página. O token vai só no header `Authorization`, para o próprio host do Supabase (como o
 * supabase-js faz); nunca na URL. Corpo pequeno: `keepalive` limita o total em voo a 64 KiB.
 */
async function updatePageKeepalive(pageId: string, patch: PagePatch, accessToken: string) {
  const env = parseSupabaseEnv(import.meta.env)
  const url = new URL('/rest/v1/pages', env.VITE_SUPABASE_URL)
  url.searchParams.set('id', `eq.${pageId}`)
  url.searchParams.set('select', 'id')
  const response = await fetch(url, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(toDbPatch(patch)),
  })
  if (!response.ok) throw new Error('pages_update_failed')
  return idRowsSchema.parse(await response.json())
}

/**
 * Atualiza só as colunas permitidas ao cliente (parent_id, title, icon, sort_key). Com `keepaliveToken`
 * (salvamento ao sair da página) usa o envio que sobrevive ao recarregar.
 */
export async function updatePage(
  pageId: string,
  patch: PagePatch,
  options?: { keepaliveToken?: string },
): Promise<void> {
  let rows: readonly unknown[]
  if (options?.keepaliveToken !== undefined) {
    rows = await updatePageKeepalive(pageId, patch, options.keepaliveToken)
  } else {
    const { data, error } = await supabase
      .from('pages')
      .update(toDbPatch(patch))
      .eq('id', pageId)
      .select('id')
    if (error) throw new Error('pages_update_failed')
    rows = data
  }
  // A RLS não dá erro quando barra: a consulta só não atinge linha nenhuma (leitor, página apagada
  // em outra aba, página na lixeira). Isso precisa virar erro, ou o cache otimista ficaria errado.
  if (rows.length === 0) throw new Error('pages_update_failed')
}

/** Manda para a lixeira e apaga em definitivo (o banco só deixa apagar quem já está na lixeira). */
export async function trashAndDeletePage(pageId: string): Promise<void> {
  const trashed = await supabase.rpc('trash_page', { p_page_id: pageId })
  if (trashed.error) throw new Error('pages_trash_failed')
  const { data, error } = await supabase.from('pages').delete().eq('id', pageId).select('id')
  if (error || data.length === 0) throw new Error('pages_delete_failed')
}
