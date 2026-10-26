import { z } from 'zod'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** https, ou http só para o Supabase local (`supabase start`). */
function isSecureUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
  } catch {
    return false
  }
}

/** Chave de serviço (service_role/secret) nunca pode ir para o bundle do navegador. */
function isServiceKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true
  const payload = value.split('.')[1]
  if (payload === undefined) return false
  try {
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return (
      typeof json === 'object' && json !== null && 'role' in json && json.role === 'service_role'
    )
  } catch {
    return false
  }
}

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url().refine(isSecureUrl),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !isServiceKey(value)),
})

/** Variáveis do Supabase já validadas (URL https e chave anon/publishable). */
export type SupabaseEnv = z.infer<typeof envSchema>

/**
 * Valida as variáveis do Supabase. O erro cita só os NOMES das variáveis com problema, nunca
 * os valores (a chave não deve aparecer em logs).
 */
export function parseSupabaseEnv(env: Record<string, unknown>): SupabaseEnv {
  const result = envSchema.safeParse(env)
  if (result.success) return result.data

  const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))]
  throw new Error(
    `Variáveis de ambiente do Supabase ausentes ou inválidas: ${names.join(', ')}. ` +
      'Copie .env.example para .env.local e preencha (use a chave anon/publishable).',
  )
}
