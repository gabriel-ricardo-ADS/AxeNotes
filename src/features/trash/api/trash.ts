import { z } from 'zod'
import { mapTrashError, TrashActionError, type TrashedPage } from '@/features/trash/trash'
import { parsePageIcon } from '@/features/workspace/page-icon'
import { supabase } from '@/lib/supabase'

const TRASH_COLUMNS = 'id, parent_id, title, icon, trashed_at'
/** O PostgREST devolve no máximo 1000 linhas por consulta: a lixeira vem em lotes deste tamanho. */
const BATCH = 1000

const trashedRowSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  title: z.string(),
  icon: z.unknown(),
  trashed_at: z.string(),
})

function toTrashedPage(raw: unknown): TrashedPage {
  const row = trashedRowSchema.parse(raw)
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: parsePageIcon(row.icon),
    trashedAt: row.trashed_at,
  }
}

/**
 * Todas as páginas do workspace que estão na lixeira (a tela deriva as raízes no cliente). Mesma
 * paginação por cursor de `fetchPages`: `id > último`, até vir um lote vazio. A RLS de SELECT deixa
 * qualquer membro (inclusive leitor) ver estas linhas.
 */
export async function fetchTrashedPages(workspaceId: string): Promise<TrashedPage[]> {
  const rows = new Map<string, TrashedPage>()
  let cursor: string | null = null
  for (;;) {
    let query = supabase
      .from('pages')
      .select(TRASH_COLUMNS)
      .eq('workspace_id', workspaceId)
      .not('trashed_at', 'is', null)
      .order('id', { ascending: true })
      .limit(BATCH)
    if (cursor !== null) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw new Error('trash_fetch_failed')
    const batch = (data as unknown[]).map(toTrashedPage)
    for (const row of batch) rows.set(row.id, row)
    const last = batch[batch.length - 1]
    if (last === undefined) return [...rows.values()]
    cursor = last.id
  }
}

/** Manda a página e as subpáginas vivas para a lixeira (mesmo carimbo em todas). */
export async function trashPage(pageId: string): Promise<void> {
  const { error } = await supabase.rpc('trash_page', { p_page_id: pageId })
  if (error) throw new TrashActionError(mapTrashError(error))
}

/** Restaura a página e quem saiu junto com ela. Recusa (`parent_trashed`) se o pai ainda está na lixeira. */
export async function restorePage(pageId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_page', { p_page_id: pageId })
  if (error) throw new TrashActionError(mapTrashError(error))
}

/**
 * Apaga em definitivo uma página que já está na lixeira (o banco só deixa; o FK leva as descendentes).
 * A RLS não dá erro quando barra: a consulta só não atinge linha nenhuma (já apagada, restaurada em
 * outra aba ou sem permissão). Zero linhas precisa virar erro.
 */
export async function deletePagePermanently(pageId: string): Promise<void> {
  const { data, error } = await supabase.from('pages').delete().eq('id', pageId).select('id')
  if (error) throw new TrashActionError(mapTrashError(error))
  if (data.length === 0) throw new TrashActionError('unknown')
}
