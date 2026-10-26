/**
 * `location.state` das telas de autenticação. O e-mail viaja aqui (não na URL, que vai para
 * histórico e logs). Como o PWA do iOS pode ser reaberto sem esse estado, toda leitura é defensiva.
 */
export interface CodeRouteState {
  /** E-mail para o qual o código foi enviado, quando já se sabe. */
  email?: string
  /** O código acabou de ser enviado (inicia a espera do "reenviar"). */
  sent?: boolean
  /** Rota de origem, para voltar depois do login. */
  from?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Rota de origem guardada por `RequireAuth` (ainda sem sanitizar: use `sanitizeRedirect`). */
export function readFrom(state: unknown): string | undefined {
  return isRecord(state) && typeof state.from === 'string' ? state.from : undefined
}

/**
 * Lê, de forma defensiva, o `location.state` da tela do código (o PWA do iOS pode abrir sem
 * ele).
 */
export function readCodeState(state: unknown): CodeRouteState {
  if (!isRecord(state)) return {}
  const out: CodeRouteState = {}
  if (typeof state.email === 'string' && state.email !== '') out.email = state.email
  if (state.sent === true) out.sent = true
  const from = readFrom(state)
  if (from !== undefined) out.from = from
  return out
}
