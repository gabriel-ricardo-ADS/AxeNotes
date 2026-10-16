/** Rotas de autenticação: voltar para elas depois do login não faz sentido. */
const AUTH_PATHS = ['/entrar', '/criar-conta', '/codigo', '/recuperar-senha']

// Caracteres de controle (inclui quebra de linha e tabulação).
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/ // eslint-disable-line no-control-regex

/**
 * Valida a rota de origem guardada no `location.state` antes de redirecionar. Só aceita caminhos
 * internos ("/algo"): rejeita "//host", barra invertida, URLs absolutas e caracteres de controle.
 */
export function sanitizeRedirect(from: unknown): string {
  if (typeof from !== 'string') return '/'
  if (!from.startsWith('/') || from.startsWith('//')) return '/'
  if (from.includes('\\') || CONTROL_CHARS.test(from)) return '/'

  const pathname = from.split(/[?#]/, 1)[0] ?? '/'
  if (AUTH_PATHS.includes(pathname)) return '/'
  return from
}
