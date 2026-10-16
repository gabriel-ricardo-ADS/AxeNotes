import type { PageRow } from '@/features/workspace/types'

/** Quantos recentes a sidebar (e a busca vazia) mostram. */
export const RECENTS_SHOWN = 8
/** Quantos o app guarda por usuário; o que passa disso é apagado (best effort) depois de uma visita. */
export const RECENTS_KEPT = 50
/** Reabrir a MESMA página dentro deste tempo não grava outra visita. */
export const RECENT_REPEAT_MS = 30_000

/** Visita do usuário a uma página (`user_recents`); `visitedAt` é ISO 8601. */
export interface RecentEntry {
  pageId: string
  visitedAt: string
}

function time(iso: string): number {
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

/** Mais recente primeiro; empate pelo id da página, para a ordem ser estável. */
export function compareRecents(a: RecentEntry, b: RecentEntry): number {
  const diff = time(b.visitedAt) - time(a.visitedAt)
  if (diff !== 0) return diff < 0 ? -1 : 1
  if (a.pageId < b.pageId) return -1
  if (a.pageId > b.pageId) return 1
  return 0
}

/**
 * Páginas recentes para mostrar: sem as que não estão em `pages` (lixeira, apagadas, sem acesso) e
 * sem a página inicial (já tem item próprio na sidebar), limitadas a `limit`.
 */
export function visibleRecents(
  entries: readonly RecentEntry[],
  pages: readonly PageRow[],
  homeId: string | null,
  limit: number = RECENTS_SHOWN,
): PageRow[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const result: PageRow[] = []
  for (const entry of [...entries].sort(compareRecents)) {
    if (result.length >= limit) break
    if (entry.pageId === homeId) continue
    const page = byId.get(entry.pageId)
    if (page) result.push(page)
  }
  return result
}

/** A lista depois de uma visita: a página sobe para o topo (sem duplicar) e a lista respeita o teto. */
export function withVisit(
  entries: readonly RecentEntry[],
  pageId: string,
  visitedAt: string,
): RecentEntry[] {
  const others = entries.filter((entry) => entry.pageId !== pageId)
  return [{ pageId, visitedAt }, ...others].sort(compareRecents).slice(0, RECENTS_KEPT)
}

/**
 * `visited_at` da última visita que ainda cabe no teto, quando a lista já está cheia. O que for
 * MAIS ANTIGO que isso pode ser apagado (`lt`, então empates com o corte ficam). Nulo se há folga.
 */
export function trimCutoff(entries: readonly RecentEntry[]): string | null {
  if (entries.length < RECENTS_KEPT) return null
  const sorted = [...entries].sort(compareRecents)
  return sorted[RECENTS_KEPT - 1]?.visitedAt ?? null
}

export interface LastVisitWrite {
  /** `usuário:página`. */
  key: string
  /** Instante (ms) da gravação. */
  at: number
}

/**
 * Deve gravar esta visita? Não, se foi a mesma página (do mesmo usuário) gravada há pouco: cobre o
 * modo estrito do React, re-render e reabrir na hora. Ir A → B → A grava de novo, para a ordem
 * refletir a última visita.
 */
export function shouldRecord(last: LastVisitWrite | null, key: string, now: number): boolean {
  if (last?.key !== key) return true
  return now - last.at >= RECENT_REPEAT_MS || now < last.at
}
