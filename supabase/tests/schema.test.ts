// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, migrationFiles, readSupabaseFile, type TestDb } from './helpers/db.ts'

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('guarda-corpo do schema public', () => {
  it('toda tabela tem RLS ligada e ao menos uma política', async () => {
    const tables = await db.rows<{ name: string; rls: boolean; policies: number }>(
      `select c.relname as name, c.relrowsecurity as rls,
              (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
       order by c.relname`,
    )
    expect(tables.map((t) => t.name)).toEqual([
      'pages',
      'profiles',
      'user_favorites',
      'user_recents',
      'workspace_members',
      'workspaces',
    ])
    for (const table of tables) {
      expect(table.rls, `RLS desligada em ${table.name}`).toBe(true)
      expect(table.policies, `${table.name} sem política`).toBeGreaterThan(0)
    }
  })

  it('nenhuma política libera tudo (using/with check true)', async () => {
    const policies = await db.rows<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
       where schemaname = 'public' and (qual is not distinct from 'true' or with_check is not distinct from 'true')`,
    )
    expect(policies).toEqual([])
  })

  it('todas as políticas são só para authenticated', async () => {
    const policies = await db.rows<{ tablename: string; policyname: string; roles: string }>(
      `select tablename, policyname, roles::text from pg_policies
       where schemaname = 'public' and roles::text <> '{authenticated}'`,
    )
    expect(policies).toEqual([])
  })

  it('anon não tem privilégio algum nas tabelas nem nas funções', async () => {
    const tables = await db.rows<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
         and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,references,trigger,truncate'))`,
    )
    expect(tables).toEqual([])

    const functions = await db.rows<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
    )
    expect(functions).toEqual([])
  })

  it('authenticated só executa as funções pensadas para a API', async () => {
    const functions = await db.rows<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
       order by p.proname`,
    )
    expect(functions.map((f) => f.name)).toEqual([
      'can_access_page',
      'immutable_unaccent',
      'is_workspace_member',
      'restore_page',
      'search_pages',
      'trash_page',
    ])
  })

  it('funções security definer fixam o search_path vazio', async () => {
    const functions = await db.rows<{ name: string; config: string | null }>(
      `select p.proname as name, array_to_string(p.proconfig, ',') as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef`,
    )
    expect(functions.length).toBeGreaterThan(0)
    for (const fn of functions) {
      expect(fn.config, `${fn.name} sem search_path vazio`).toContain('search_path=""')
    }
  })

  it('nenhuma função em public ficou sem search_path fixo', async () => {
    const functions = await db.rows<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and not coalesce(p.proconfig::text like '%search_path=%', false)`,
    )
    expect(functions).toEqual([])
  })

  it('o app não escreve nas colunas de controle', async () => {
    const cols = await db.rows<{ table_name: string; column_name: string; privilege_type: string }>(
      `select table_name, column_name, privilege_type
       from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public'
         and ((table_name = 'pages' and column_name in ('workspace_id', 'trashed_at', 'created_by', 'last_edited_by', 'last_edited_at') and privilege_type = 'UPDATE')
           or (table_name = 'workspaces' and column_name in ('id', 'created_by') and privilege_type in ('UPDATE', 'INSERT'))
           or (table_name = 'workspace_members' and column_name <> 'role' and privilege_type = 'UPDATE'))`,
    )
    expect(cols).toEqual([])
  })
})

describe('migrações e seed', () => {
  it('as migrações têm timestamps únicos e crescentes', () => {
    const files = migrationFiles()
    expect(files.length).toBeGreaterThan(0)
    const stamps = files.map((f) => f.split('_')[0])
    expect(new Set(stamps).size).toBe(stamps.length)
    expect(stamps.every((s) => /^\d{14}$/.test(s ?? ''))).toBe(true)
  })

  it('a seed fictícia carrega sobre as migrações e respeita a RLS', async () => {
    await db.admin.exec(readSupabaseFile('seed.sql'))

    const ana = '00000000-0000-4000-8000-0000000000a1'
    const bruno = '00000000-0000-4000-8000-0000000000b1'

    const anaPages = await db.as({ userId: ana }, (q) => q.rows('select id from public.pages'))
    const brunoPages = await db.as({ userId: bruno }, (q) => q.rows('select id from public.pages'))
    expect(anaPages).toHaveLength(6)
    expect(brunoPages).toHaveLength(1)

    const favorites = await db.as({ userId: ana }, (q) =>
      q.rows('select * from public.user_favorites'),
    )
    expect(favorites).toHaveLength(2)

    const [home] = await db.as({ userId: ana }, (q) =>
      q.rows<{ title: string }>(
        'select p.title from public.workspaces w join public.pages p on p.id = w.home_page_id',
      ),
    )
    expect(home?.title).toBe('Início')
  })
})
