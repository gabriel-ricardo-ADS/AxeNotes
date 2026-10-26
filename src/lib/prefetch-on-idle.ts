// Adianta o download de um chunk lazy (ex.: o editor) para quando o navegador estiver ocioso, para
// que a tela abra sem esperar a rede. Só esquenta o cache: quem usa o chunk continua chamando o
// import normalmente (e é lá que fica a recarga quando o chunk sumiu depois de um deploy).

/** Parte da Network Information API (não existe no Safari nem nos tipos do DOM). */
interface ConnectionInfo {
  saveData?: boolean
  effectiveType?: string
}

/**
 * Dependências do navegador, injetáveis nos testes: agendar em ocioso, rede e economia de
 * dados.
 */
export interface PrefetchDeps {
  /** Agenda `run` para um momento ocioso. */
  schedule: (run: () => void) => void
  online: () => boolean
  connection: () => ConnectionInfo | undefined
}

/** Sem requestIdleCallback (Safari), espera um pouco depois da montagem. */
const FALLBACK_DELAY_MS = 2_000
/** O requestIdleCallback roda no máximo depois disso, mesmo sem ocioso. */
const IDLE_TIMEOUT_MS = 5_000
const SLOW_CONNECTIONS = new Set(['slow-2g', '2g'])

const browserDeps: PrefetchDeps = {
  schedule: (run) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
    } else {
      window.setTimeout(run, FALLBACK_DELAY_MS)
    }
  },
  online: () => navigator.onLine,
  connection: () => (navigator as Navigator & { connection?: ConnectionInfo }).connection,
}

// Nos testes não há prefetch: importaria o BlockNote em todo teste que monta o app. Quem testa o
// comportamento passa as deps.
const defaultDeps = import.meta.env.MODE === 'test' ? null : browserDeps

const started = new WeakSet<() => Promise<unknown>>()

/**
 * Chama `load` uma vez, em tempo ocioso. Não faz nada offline, com economia de dados ligada ou em
 * conexão 2G. Uma falha é ignorada: sem recarga, sem erro na tela.
 */
export function prefetchOnIdle(
  load: () => Promise<unknown>,
  deps: PrefetchDeps | null = defaultDeps,
): void {
  if (deps === null || started.has(load)) return
  const connection = deps.connection()
  if (!deps.online() || connection?.saveData === true) return
  if (connection?.effectiveType !== undefined && SLOW_CONNECTIONS.has(connection.effectiveType)) {
    return
  }
  started.add(load)
  deps.schedule(() => {
    load().catch(() => undefined)
  })
}
