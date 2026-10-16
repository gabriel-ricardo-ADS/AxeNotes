import { insertPage, trashAndDeletePage } from '@/features/workspace/api/pages'
import { fetchHomePageId, setHomePageIfEmpty } from '@/features/workspace/api/workspace'
import { t } from '@/i18n'
import { keyBetween } from '@/lib/fractional-index'

/** Serializa entre abas (Web Locks, Safari 15.4+); sem a API, segue só com as outras defesas. */
async function withLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return run()
  return navigator.locks.request(name, run)
}

async function createHomeIfMissing(workspaceId: string, userId: string): Promise<string | null> {
  // Relê dentro do lock: outra aba pode ter criado a página enquanto esta esperava.
  const existing = await fetchHomePageId(workspaceId)
  if (existing !== null) return existing

  const id = crypto.randomUUID()
  await insertPage({
    id,
    workspaceId,
    parentId: null,
    title: t('home.title'),
    icon: null,
    sortKey: keyBetween(null, null),
    createdBy: userId,
  })

  if (await setHomePageIfEmpty(workspaceId, id)) return id

  // O update condicional não gravou nada: outro cliente chegou antes (ou a RLS barrou). Reler
  // o workspace e só apagar a própria página se a atual for OUTRA. Nunca a página vencedora.
  const current = await fetchHomePageId(workspaceId)
  if (current === id) return id
  try {
    await trashAndDeletePage(id)
  } catch {
    // Sobrou uma página vazia sem uso; não vale quebrar a tela por causa dela.
  }
  return current
}

const inFlight = new Map<string, Promise<string | null>>()

/**
 * Garante a página inicial do workspace e devolve o id (ou null se não foi possível criar).
 * Corrida entre abas: (1) uma só chamada por workspace neste documento (StrictMode, remontagens);
 * (2) lock entre abas; (3) `update … where home_page_id is null`, quem perde não apaga a vencedora.
 */
export function ensureHomePage(workspaceId: string, userId: string): Promise<string | null> {
  const running = inFlight.get(workspaceId)
  if (running) return running

  const promise = withLock(`axenotes-home-${workspaceId}`, () =>
    createHomeIfMissing(workspaceId, userId),
  ).finally(() => {
    inFlight.delete(workspaceId)
  })
  inFlight.set(workspaceId, promise)
  return promise
}
