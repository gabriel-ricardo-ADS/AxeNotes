import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthFlowError, mapAuthError } from '@/features/auth/errors'
import { supabase } from '@/lib/supabase'

// Funções sobre o cliente do Supabase. Os componentes só veem `AuthFlowError` (categoria do erro):
// nada de mensagem do servidor, e nenhuma senha, código ou token vai para log.

function fail(error: unknown): never {
  throw new AuthFlowError(mapAuthError(error))
}

/** Dados do formulário de cadastro; `name` vira o `display_name` do perfil. */
export interface SignUpInput {
  name: string
  email: string
  password: string
}

/** Cria a conta (e-mail + senha) e dispara o e-mail com o código de confirmação. */
export async function signUp({ name, email, password }: SignUpInput): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // O trigger de cadastro lê display_name para criar o perfil.
    options: { data: { display_name: name } },
  })
  if (error) fail(error)
}

/** Confirma o cadastro com o código de 6 dígitos; se der certo, o Supabase já abre a sessão. */
export async function verifySignupCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
  if (error) fail(error)
}

/** Reenvia o e-mail com o código de confirmação do cadastro. */
export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) fail(error)
}

/**
 * Entra com e-mail e senha. A sessão chega ao app pelo `subscribeToAuthChanges`, não pelo retorno.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) fail(error)
}

/** Também serve de "reenviar": o Supabase não tem `resend` para recuperação de senha. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) fail(error)
}

/** Se der certo, o Supabase já abre uma sessão: falta só definir a nova senha. */
export async function verifyRecoveryCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })
  if (error) fail(error)
}

/** Define a nova senha do usuário da sessão atual (etapa final da recuperação de senha). */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) fail(error)
}

/**
 * Encerra as sessões dos OUTROS aparelhos (mantém esta). Chamado depois de trocar a senha na
 * recuperação: quem esqueceu a senha pode estar com a conta comprometida. Falha não é crítica.
 */
export async function signOutOtherSessions(): Promise<void> {
  await supabase.auth.signOut({ scope: 'others' })
}

/** "Sair" encerra só este aparelho (o padrão do Supabase, `global`, derrubaria todos). */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) fail(error)
}

/** Usuário da sessão guardada (a do JWT que o próximo pedido vai usar), sem ir à rede. */
export async function currentSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** Função chamada a cada mudança de sessão (entrar, sair, renovar token, recuperação de senha). */
export type AuthListener = (event: AuthChangeEvent, session: Session | null) => void

/** Assina mudanças de sessão e devolve a função de cancelar. O listener precisa ser síncrono. */
export function subscribeToAuthChanges(listener: AuthListener): () => void {
  const { data } = supabase.auth.onAuthStateChange(listener)
  return () => {
    data.subscription.unsubscribe()
  }
}
