// Smoke de RLS no projeto REAL do Supabase. Só leitura: nenhum insert/update/delete. Usa os dois
// usuários de teste (E2E_*) e a chave anon; não imprime e-mails, ids ou tokens.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/database.types'
import { parseSupabaseEnv } from '../src/lib/supabase-env'
import { E2E_USER_1, E2E_USER_2, hasBothE2EUsers, type TestUser } from './support/env'

type Client = SupabaseClient<Database>

function readEnv() {
  try {
    return parseSupabaseEnv(process.env)
  } catch {
    return null
  }
}

const env = readEnv()

function newClient(): Client {
  if (!env) throw new Error('Variáveis do Supabase ausentes.')
  return createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function signedIn(user: TestUser): Promise<{ client: Client; userId: string }> {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword(user)
  if (error) throw new Error('Não foi possível entrar com o usuário de teste.')
  return { client, userId: data.user.id }
}

async function workspaceIds(client: Client, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
  expect(error).toBeNull()
  return (data ?? []).map((row) => row.workspace_id)
}

// Um único worker (e um único login por usuário) para o arquivo todo.
test.describe.configure({ mode: 'serial' })

test.describe('RLS no projeto real (somente leitura)', () => {
  test.skip(
    env === null || !hasBothE2EUsers,
    'Faltam VITE_SUPABASE_* ou os dois usuários E2E_* em .env.local.',
  )

  let user1: Client
  let user2: Client
  let user1Id: string
  let user2Id: string
  let user1Workspaces: string[]
  let user2Workspaces: string[]

  test.beforeAll(async () => {
    const first = await signedIn(E2E_USER_1)
    const second = await signedIn(E2E_USER_2)
    user1 = first.client
    user2 = second.client
    user1Id = first.userId
    user2Id = second.userId
    user1Workspaces = await workspaceIds(user1, user1Id)
    user2Workspaces = await workspaceIds(user2, user2Id)
  })

  test.afterAll(async () => {
    // Encerra só estas sessões de teste.
    await Promise.all([
      user1.auth.signOut({ scope: 'local' }),
      user2.auth.signOut({ scope: 'local' }),
    ])
  })

  test('each test user has a personal workspace, and they are different', () => {
    expect(user1Id).not.toBe(user2Id)
    expect(user1Workspaces.length).toBeGreaterThan(0)
    expect(user2Workspaces.length).toBeGreaterThan(0)
    expect(user1Workspaces.filter((id) => user2Workspaces.includes(id))).toEqual([])
  })

  test('user 1 sees only their own profile', async () => {
    const { data, error } = await user1.from('profiles').select('id')

    expect(error).toBeNull()
    expect((data ?? []).map((row) => row.id)).toEqual([user1Id])
  })

  test('user 1 sees only their own workspaces', async () => {
    const { data, error } = await user1.from('workspaces').select('id')

    expect(error).toBeNull()
    expect((data ?? []).map((row) => row.id).sort()).toEqual([...user1Workspaces].sort())
  })

  test("user 2 does not see user 1's workspace, not even by id", async () => {
    for (const id of user1Workspaces) {
      const { data, error } = await user2.from('workspaces').select('id').eq('id', id)
      expect(error).toBeNull()
      expect(data).toEqual([])

      const members = await user2.from('workspace_members').select('user_id').eq('workspace_id', id)
      expect(members.error).toBeNull()
      expect(members.data).toEqual([])

      const pages = await user2.from('pages').select('id').eq('workspace_id', id)
      expect(pages.error).toBeNull()
      expect(pages.data).toEqual([])
    }
  })

  test("user 2 does not see user 1's profile", async () => {
    const { data, error } = await user2.from('profiles').select('id').eq('id', user1Id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('members and pages of user 1 belong only to their workspaces', async () => {
    const members = await user1.from('workspace_members').select('workspace_id, user_id')
    expect(members.error).toBeNull()
    for (const row of members.data ?? []) {
      expect(user1Workspaces).toContain(row.workspace_id)
      expect(row.user_id).toBe(user1Id)
    }

    const pages = await user1.from('pages').select('workspace_id')
    expect(pages.error).toBeNull()
    for (const row of pages.data ?? []) expect(user1Workspaces).toContain(row.workspace_id)
  })

  for (const table of ['profiles', 'workspaces', 'workspace_members', 'pages'] as const) {
    test(`anonymous visitors get nothing from ${table}`, async () => {
      const anon = newClient()

      const { data } = await anon.from(table).select('*').limit(5)

      // A API devolve erro de permissão (sem grants para anon) ou lista vazia (RLS): nunca linhas.
      expect(data ?? []).toEqual([])
    })
  }
})
