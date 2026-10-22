import type { QueryClient } from '@tanstack/react-query'
import { resetAllStores } from '@/lib/create-store'

/**
 * Bancos IndexedDB do app, para navegadores sem `indexedDB.databases()`. Vazio por enquanto: quem
 * criar um banco (ex.: y-indexeddb na Fase 2) registra o nome aqui.
 */
export const KNOWN_IDB_DATABASES: readonly string[] = []

let pending: Promise<void> | null = null

/**
 * Ponto ÚNICO de limpeza do cliente ao sair (ou ao trocar de conta). Apaga o cache do TanStack
 * Query e devolve as stores Zustand ao estado inicial na hora, antes do próximo render; depois apaga
 * IndexedDB, service workers e Cache Storage. Erros de limpeza só vão para o log: o logout segue.
 * Chamadas enquanto uma limpeza está em andamento recebem a mesma promise (roda uma vez por logout).
 * A sessão do Supabase não é tocada aqui: o `signOut` cuida dela.
 */
export function resetClientState(queryClient: QueryClient): Promise<void> {
  if (pending) return pending
  void queryClient.cancelQueries()
  queryClient.clear()
  resetAllStores()
  pending = clearBrowserStorage().finally(() => {
    pending = null
  })
  return pending
}

async function clearBrowserStorage(): Promise<void> {
  const steps: [string, () => Promise<void>][] = [
    ['IndexedDB', deleteDatabases],
    ['service worker', unregisterServiceWorkers],
    ['Cache Storage', deleteCaches],
  ]
  const results = await Promise.allSettled(steps.map(([, run]) => run()))
  results.forEach((result, index) => {
    // Só o nome da etapa e o erro do navegador: nada de dados da conta no log.
    if (result.status === 'rejected') {
      console.error(`Falha ao limpar ${steps[index]?.[0] ?? ''} no logout`, result.reason)
    }
  })
}

async function deleteDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const names =
    typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).flatMap((info) => (info.name ? [info.name] : []))
      : KNOWN_IDB_DATABASES
  await Promise.all(names.map(deleteDatabase))
}

/** Resolve também em `blocked` (conexão aberta em outra aba): o banco some quando ela fechar. */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => {
      resolve()
    }
    request.onblocked = () => {
      resolve()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('deleteDatabase falhou'))
    }
  })
}

async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}

async function deleteCaches(): Promise<void> {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}
