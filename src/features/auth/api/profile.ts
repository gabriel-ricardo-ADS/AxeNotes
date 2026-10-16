import { supabase } from '@/lib/supabase'

export interface Profile {
  displayName: string
}

/** Perfil do usuário logado (a RLS só deixa ler o próprio e o de quem divide workspace). */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error('profile_fetch_failed')
  return data ? { displayName: data.display_name } : null
}
