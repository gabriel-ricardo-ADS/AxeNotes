import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().trim().min(1),
})

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
