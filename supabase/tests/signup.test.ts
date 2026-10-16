// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

afterAll(async () => {
  await db.close()
})

const ID = '00000000-0000-4000-8000-00000000f001'
const ID_2 = '00000000-0000-4000-8000-00000000f002'

describe('cadastro', () => {
  it('cria perfil, workspace pessoal e membership de owner', async () => {
    await db.admin.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'fulana@example.test', '{"display_name":"Fulana"}')`,
      [ID],
    )

    const profiles = await db.rows('select id, display_name from public.profiles where id = $1', [
      ID,
    ])
    expect(profiles).toEqual([{ id: ID, display_name: 'Fulana' }])

    const workspaces = await db.rows<{
      name: string
      created_by: string
      home_page_id: string | null
      role: string
    }>(
      `select w.name, w.created_by, w.home_page_id, m.role
       from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
       where m.user_id = $1`,
      [ID],
    )
    expect(workspaces).toEqual([
      { name: 'Workspace pessoal', created_by: ID, home_page_id: null, role: 'owner' },
    ])
  })

  it('sem nome nos metadados, usa a parte local do e-mail', async () => {
    await db.admin.query(`insert into auth.users (id, email) values ($1, 'sicrano@example.test')`, [
      ID_2,
    ])
    const [profile] = await db.rows<{ display_name: string }>(
      'select display_name from public.profiles where id = $1',
      [ID_2],
    )
    expect(profile?.display_name).toBe('sicrano')
  })

  it('cada cadastro ganha o próprio workspace', async () => {
    const rows = await db.rows<{ n: number }>(
      'select count(distinct workspace_id)::int as n from public.workspace_members',
    )
    expect(rows[0]?.n).toBe(2)
  })

  it('o usuário consegue ler o próprio workspace logo após o cadastro', async () => {
    const rows = await db.as({ userId: ID }, (q) => q.rows('select id from public.workspaces'))
    expect(rows).toHaveLength(1)
  })

  it('apagar a conta não esbarra na regra do último owner', async () => {
    await db.admin.query('delete from auth.users where id = $1', [ID_2])
    const rows = await db.rows('select 1 from public.profiles where id = $1', [ID_2])
    expect(rows).toHaveLength(0)
  })
})
