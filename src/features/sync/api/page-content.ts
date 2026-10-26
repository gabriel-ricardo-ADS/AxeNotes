import { z } from 'zod'
import { fromBase64, toBase64 } from '@/features/sync/base64'
import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/** Uma linha viva de `page_contents` (docs/adr/0001-conteudo-yjs.md). */
export interface ContentRow {
  id: number
  kind: 'update' | 'snapshot'
  data: Uint8Array
  coversUpTo: number | null
  byteSize: number
}

/**
 * Por que o servidor recusou. `too_large`: um update acima de 1 MiB ou snapshot acima de 8 MiB;
 * `batch_too_large`: lote acima de 100 itens ou 2 MiB; `live_too_large`: a página passou de 32 MiB
 * vivos (o cliente compacta); `forbidden`: leitor, sem acesso ou página na lixeira; `offline`: sem rede.
 */
export type ContentErrorKind =
  | 'too_large'
  | 'batch_too_large'
  | 'live_too_large'
  | 'invalid'
  | 'forbidden'
  | 'offline'
  | 'unknown'

/** Erro de uma chamada de conteúdo, já classificado em `ContentErrorKind` (sem dados da página). */
export class ContentSyncError extends Error {
  constructor(readonly kind: ContentErrorKind) {
    super(`content_sync_${kind}`)
  }
}

/** O que a sincronização usa do servidor. Os testes trocam por um fake em memória. */
export interface PageContentApi {
  /** Linhas vivas em ordem de id; com `after`, só as de id maior. */
  fetch: (pageId: string, after: number | null) => Promise<ContentRow[]>
  /** Grava os updates; devolve os ids na ordem. */
  append: (pageId: string, updates: Uint8Array[]) => Promise<number[]>
  /** Grava o snapshot cobrindo `upTo`; `false` = outro aparelho já compactou até lá. */
  compact: (pageId: string, snapshot: Uint8Array, upTo: number) => Promise<boolean>
  setText: (pageId: string, text: string, json: Json | null) => Promise<void>
}

const rowSchema = z.object({
  id: z.number().int(),
  kind: z.enum(['update', 'snapshot']),
  data: z.string(),
  covers_up_to: z.number().int().nullable(),
  byte_size: z.number().int(),
})

const MESSAGE_KINDS: Record<string, ContentErrorKind> = {
  page_content_too_large: 'too_large',
  page_text_too_large: 'too_large',
  page_content_batch_too_large: 'batch_too_large',
  page_content_live_too_large: 'live_too_large',
  page_content_invalid: 'invalid',
}

interface ErrorLike {
  code?: string
  message?: string
}

/** Erro do PostgREST/fetch → motivo. Sem rede o supabase-js devolve o TypeError do fetch como mensagem. */
export function contentErrorKind(error: ErrorLike, online: boolean): ContentErrorKind {
  if (error.code === '42501') return 'forbidden'
  const byMessage = error.message === undefined ? undefined : MESSAGE_KINDS[error.message]
  if (byMessage) return byMessage
  if (
    !online ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message ?? '')
  ) {
    return 'offline'
  }
  return 'unknown'
}

function fail(error: ErrorLike): never {
  throw new ContentSyncError(contentErrorKind(error, navigator.onLine))
}

/** Os RPCs de verdade. O cliente nunca lê nem escreve `page_contents` direto (bytea viraria hex). */
export const supabasePageContentApi: PageContentApi = {
  fetch: async (pageId, after) => {
    const { data, error } = await supabase.rpc('get_page_content', {
      p_page_id: pageId,
      ...(after === null ? {} : { p_after: after }),
    })
    if (error) fail(error)
    return z
      .array(rowSchema)
      .parse(data)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        data: fromBase64(row.data),
        coversUpTo: row.covers_up_to,
        byteSize: row.byte_size,
      }))
  },
  append: async (pageId, updates) => {
    const { data, error } = await supabase.rpc('append_page_updates', {
      p_page_id: pageId,
      p_updates: updates.map(toBase64),
    })
    if (error) fail(error)
    return z.array(z.number().int()).parse(data)
  },
  compact: async (pageId, snapshot, upTo) => {
    const { data, error } = await supabase.rpc('compact_page_content', {
      p_page_id: pageId,
      p_snapshot: toBase64(snapshot),
      p_up_to: upTo,
    })
    if (error) fail(error)
    return z.boolean().parse(data)
  },
  setText: async (pageId, text, json) => {
    const { error } = await supabase.rpc('set_page_text', {
      p_page_id: pageId,
      p_text: text,
      p_json: json,
    })
    if (error) fail(error)
  },
}
