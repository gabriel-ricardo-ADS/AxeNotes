import { localDataBelongsTo } from '@/lib/local-data-owner'
import { readSyncMetaEntries } from '@/lib/sync-meta-read'

/**
 * Ponte entre o "Sair" (chunk das rotas) e a sincronização do conteúdo (chunk do editor), sem trazer
 * o Yjs para o chunk das rotas: o sync registra aqui, ao carregar, uma função que tenta enviar o
 * pendente e devolve quantas páginas ainda ficaram sem sincronizar.
 */
type PendingContentFlusher = (timeoutMs: number) => Promise<number>

let flusher: PendingContentFlusher | null = null

/** Registra quem sabe enviar o conteúdo pendente (o sync, ao carregar). Devolve o cancelamento. */
export function registerPendingContentFlusher(fn: PendingContentFlusher): () => void {
  flusher = fn
  return () => {
    if (flusher === fn) flusher = null
  }
}

/**
 * Tenta enviar o conteúdo pendente (com limite de tempo) ANTES do logout: depois do `signOut` a
 * sessão já não vale e o envio falharia. Sem o sync carregado (ex.: offline sem o chunk do editor),
 * não há como enviar: conta as páginas `dirty` dos metadados para o "Sair" perguntar mesmo assim,
 * mas só se os dados locais são de `userId` (os de outra conta não são deste logout).
 */
export async function flushPendingContent(
  timeoutMs: number,
  userId: string | null,
): Promise<{ pending: number }> {
  if (!flusher) {
    if (!localDataBelongsTo(userId)) return { pending: 0 }
    const entries = await readSyncMetaEntries()
    return { pending: entries.filter((entry) => entry.state === 'dirty').length }
  }
  try {
    return { pending: await flusher(timeoutMs) }
  } catch (error) {
    console.error('Falha ao enviar o conteúdo pendente antes de sair', error)
    return { pending: 1 }
  }
}
