// Depois de um deploy novo, a aba aberta ainda aponta para chunks com o hash antigo. No Cloudflare
// Pages o arquivo que não existe volta como o index.html (fallback de SPA, 200, text/html) e o
// import dinâmico falha por MIME. A saída é recarregar UMA vez para pegar o index.html novo.

/** Quanto tempo uma recarga recente impede outra (proteção contra loop). */
export const RELOAD_GUARD_MS = 10_000
/** Chave do sessionStorage com a hora da última recarga por chunk antigo. */
export const RELOAD_KEY = 'axenotes:chunk-reload-at'

/**
 * Mensagens dos navegadores quando o import dinâmico (ou o preload do Vite) não consegue BUSCAR o
 * módulo: rede, 404 ou MIME errado. Um erro lançado pelo próprio código do módulo não casa aqui.
 */
const CHUNK_LOAD_ERROR = new RegExp(
  [
    'Failed to fetch dynamically imported module', // Chrome/Edge (inclui o caso de MIME)
    'error loading dynamically imported module', // Firefox
    'Importing a module script failed', // Safari
    'Unable to preload CSS', // preload do Vite
    'not a valid JavaScript MIME type',
    'Expected a JavaScript(-or-Wasm)? module script',
  ].join('|'),
  'i',
)

/** O erro é uma falha de BUSCAR um módulo (rede, 404, MIME errado) e não do código dele? */
export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_ERROR.test(error.message)
}

/** Dependências do navegador, injetáveis nos testes: storage, recarga e relógio. */
export interface ReloadDeps {
  storage: () => Storage
  reload: () => void
  now: () => number
}

const browserDeps: ReloadDeps = {
  storage: () => window.sessionStorage,
  reload: () => {
    window.location.reload()
  },
  now: () => Date.now(),
}

let reloading = false

/**
 * Recarrega a página se `error` for falha de carregamento de chunk e não houve recarga nos últimos
 * RELOAD_GUARD_MS. Devolve `true` se a recarga foi pedida (quem chamou deve esperar por ela). Sem
 * sessionStorage (Safari privado com storage bloqueado) não recarrega: sem como lembrar, poderia
 * entrar em loop.
 */
export function reloadOnChunkError(error: unknown, deps: ReloadDeps = browserDeps): boolean {
  if (!isChunkLoadError(error)) return false
  if (reloading) return true
  try {
    const storage = deps.storage()
    const last = Number(storage.getItem(RELOAD_KEY) ?? 0)
    const now = deps.now()
    if (now - last < RELOAD_GUARD_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reloading = true
  deps.reload()
  return true
}

/** Só para testes. */
export function resetChunkReloadForTests(): void {
  reloading = false
}
