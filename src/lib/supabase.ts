import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { parseSupabaseEnv } from '@/lib/supabase-env'

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = parseSupabaseEnv(import.meta.env)

/**
 * Cliente do Supabase para o navegador, tipado com o schema. Só a chave anon/publishable: a
 * proteção dos dados é a RLS (nunca use a service_role aqui). Sem link mágico (DECISÃO-014),
 * então não há sessão a detectar na URL.
 */
export const supabase = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
