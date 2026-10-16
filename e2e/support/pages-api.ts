// Acesso direto à API (supabase-js) para os e2e da árvore de páginas: criar massa de teste e,
// principalmente, LIMPAR o que os testes criaram. Escreve no projeto REAL, só nos dados do usuário
// de teste 1 (E2E_EMAIL). Regras:
//   - todo título criado por teste começa com E2E_PREFIX ("e2e-");
//   - a limpeza só apaga páginas com esse prefixo, e só se a subárvore inteira também tiver;
//   - nada aqui imprime ids, e-mails ou tokens.
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { parseSupabaseEnv } from '../../src/lib/supabase-env'
import { authFile, E2E_USER_1 } from './env'

export const E2E_PREFIX = 'e2e-'
/** Acima disso a faxina PARA e avisa, em vez de apagar: algo saiu do controle. */
export const MAX_LEFTOVERS = 50

type Client = SupabaseClient<Database>

export interface ApiSession {
  client: Client
  userId: string
  workspaceId: string
}

function newClient(accessToken?: string): Client {
  const env = parseSupabaseEnv(process.env)
  return createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  })
}

/** `sub` do JWT (id do usuário), sem rede. */
function userIdFromToken(accessToken: string): string {
  const payload = accessToken.split('.')[1] ?? ''
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }
  if (!json.sub) throw new Error('Token de sessão sem usuário.')
  return json.sub
}

/** Token da sessão que o setup do projeto salvou (evita um novo login a cada teste). */
function tokenFromStorageState(project: string): string | null {
  try {
    const state = JSON.parse(readFileSync(authFile(project), 'utf8')) as {
      origins?: { localStorage?: { name: string; value: string }[] }[]
    }
    for (const origin of state.origins ?? []) {
      for (const item of origin.localStorage ?? []) {
        if (item.name.startsWith('sb-') && item.name.endsWith('-auth-token')) {
          const session = JSON.parse(item.value) as { access_token?: string }
          if (session.access_token) return session.access_token
        }
      }
    }
  } catch {
    // sem arquivo ou formato inesperado: cai para o login
  }
  return null
}

async function workspaceOf(client: Client, userId: string): Promise<string> {
  const { data, error } = await client
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  const workspaceId = data?.[0]?.workspace_id
  if (error || !workspaceId) throw new Error('Não foi possível achar o workspace do usuário de teste.')
  return workspaceId
}

async function signInWithPassword(): Promise<ApiSession> {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword(E2E_USER_1)
  if (error) throw new Error('Não foi possível entrar com o usuário de teste 1.')
  return { client, userId: data.user.id, workspaceId: await workspaceOf(client, data.user.id) }
}

const sessions = new Map<string, Promise<ApiSession>>()

/**
 * Cliente da API como o usuário de teste 1, reaproveitando a sessão salva do projeto (um login por
 * projeto, como na T3a). Se o token não servir mais, entra com a senha uma vez. Cache por worker.
 */
export function apiSession(project: string): Promise<ApiSession> {
  const cached = sessions.get(project)
  if (cached) return cached

  const created = (async () => {
    const token = tokenFromStorageState(project)
    if (token) {
      try {
        const client = newClient(token)
        const userId = userIdFromToken(token)
        return { client, userId, workspaceId: await workspaceOf(client, userId) }
      } catch {
        // token expirado: segue para o login
      }
    }
    return signInWithPassword()
  })()
  sessions.set(project, created)
  return created
}

/** Login com a senha, para a faxina inicial (roda antes dos setups dos projetos). */
export const apiSessionBySignIn = signInWithPassword

/** Prefixo exclusivo de um teste: os 3 projetos rodam em paralelo no mesmo usuário. */
export function newRunPrefix(project: string): string {
  return `${E2E_PREFIX}${project}-${randomBytes(3).toString('hex')}-`
}

interface PageRef {
  id: string
  parent_id: string | null
  title: string
}

async function listAllPages(client: Client, workspaceId: string): Promise<PageRef[]> {
  const pages: PageRef[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('pages')
      .select('id, parent_id, title')
      .eq('workspace_id', workspaceId)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error('Não foi possível listar as páginas para a limpeza.')
    pages.push(...data)
    if (data.length < 1000) return pages
  }
}

export interface CleanupResult {
  removed: number
  skipped: number
}

/**
 * Apaga as páginas cujo título começa com `prefix` (e as subpáginas delas, que também precisam ter o
 * prefixo). Primeiro manda para a lixeira (`trash_page`), depois apaga (`delete`, que o banco só
 * permite para quem está na lixeira). Subárvore com alguma página SEM o prefixo não é tocada.
 * Com `limit`, se houver mais páginas com o prefixo que isso, não apaga nada e lança erro.
 */
export async function removePagesWithPrefix(
  session: ApiSession,
  prefix: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<CleanupResult> {
  const pages = await listAllPages(session.client, session.workspaceId)
  const marked = pages.filter((page) => page.title.startsWith(prefix))
  if (marked.length > limit) {
    throw new Error(
      `Há ${String(marked.length)} páginas com o prefixo "${prefix}" (limite ${String(limit)}). ` +
        'Nada foi apagado: confira o usuário de teste antes de rodar de novo.',
    )
  }

  const byId = new Map(pages.map((page) => [page.id, page]))
  const children = new Map<string, PageRef[]>()
  for (const page of pages) {
    if (page.parent_id === null) continue
    children.set(page.parent_id, [...(children.get(page.parent_id) ?? []), page])
  }
  const subtreeIsAllMarked = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return true
    seen.add(id)
    const page = byId.get(id)
    if (!page?.title.startsWith(prefix)) return false
    return (children.get(id) ?? []).every((child) => subtreeIsAllMarked(child.id, seen))
  }

  // Só as "raízes" do conjunto marcado: o delete em cascata leva o resto.
  const tops = marked.filter((page) => {
    const parent = page.parent_id === null ? undefined : byId.get(page.parent_id)
    return !parent?.title.startsWith(prefix)
  })

  let removed = 0
  let skipped = 0
  for (const top of tops) {
    if (!subtreeIsAllMarked(top.id)) {
      skipped += 1
      continue
    }
    const trashed = await session.client.rpc('trash_page', { p_page_id: top.id })
    if (trashed.error) throw new Error('Não foi possível mandar uma página de teste para a lixeira.')
    const deleted = await session.client.from('pages').delete().eq('id', top.id)
    if (deleted.error) throw new Error('Não foi possível apagar uma página de teste.')
    removed += 1
  }
  return { removed, skipped }
}

/** Cria uma página de teste (como o app faria), com o prefixo no título. Devolve o id. */
export async function createTestPage(
  session: ApiSession,
  input: { title: string; parentId?: string | null; sortKey: string },
): Promise<string> {
  if (!input.title.startsWith(E2E_PREFIX)) throw new Error('Título de teste sem o prefixo e2e-.')
  const id = crypto.randomUUID()
  const { error } = await session.client.from('pages').insert({
    id,
    workspace_id: session.workspaceId,
    parent_id: input.parentId ?? null,
    title: input.title,
    sort_key: input.sortKey,
    created_by: session.userId,
  })
  if (error) throw new Error('Não foi possível criar a página de teste.')
  return id
}
