// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

const { carla } = USERS
const actor = (userId: string) => ({ userId })
const CHECK_VIOLATION = { code: '23514' }

let db: TestDb
let f: Fixtures

beforeAll(async () => {
  db = await createTestDb()
  f = await seedFixtures(db)
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('upsert como o supabase-js faz (todas as colunas do payload no SET)', () => {
  it('favoritos', async () => {
    const upsert = (sortKey: string) =>
      db.as(actor(carla), (q) =>
        q.run(
          `insert into public.user_favorites (page_id, sort_key) values ($1, $2)
           on conflict (user_id, page_id)
           do update set page_id = excluded.page_id, sort_key = excluded.sort_key`,
          [PAGES.estudos, sortKey],
        ),
      )
    await upsert('a0')
    await upsert('a1')
    const rows = await db.as(actor(carla), (q) =>
      q.rows<{ sort_key: string }>('select sort_key from public.user_favorites'),
    )
    expect(rows).toEqual([{ sort_key: 'a1' }])
  })

  it('recentes', async () => {
    const upsert = (at: string) =>
      db.as(actor(carla), (q) =>
        q.run(
          `insert into public.user_recents (page_id, visited_at) values ($1, $2)
           on conflict (user_id, page_id)
           do update set page_id = excluded.page_id, visited_at = excluded.visited_at`,
          [PAGES.estudos, at],
        ),
      )
    await upsert('2026-03-01T10:00:00Z')
    await upsert('2026-03-02T10:00:00Z')
    const rows = await db.as(actor(carla), (q) => q.rows('select * from public.user_recents'))
    expect(rows).toHaveLength(1)
  })

  it('o upsert não deixa apontar para página inacessível nem trocar o dono', async () => {
    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.user_recents set page_id = $1', [PAGES.segredo]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.as(actor(carla), (q) => q.run('update public.user_recents set user_id = $1', [USERS.ana])),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('limites de tamanho', () => {
  it('título, nome do workspace, ícone e nome de exibição têm teto', async () => {
    const insert = (title: string, icon: unknown = null) =>
      db.as(actor(carla), (q) =>
        q.run(
          `insert into public.pages (workspace_id, title, icon, sort_key, created_by)
           values ($1, $2, $3, 'a9', $4)`,
          [f.workspaceA, title, icon, carla],
        ),
      )
    expect(await insert('x'.repeat(500))).toBe(1)
    await expect(insert('x'.repeat(501))).rejects.toMatchObject(CHECK_VIOLATION)
    await expect(insert('ok', { type: 'emoji', value: 'x'.repeat(3000) })).rejects.toMatchObject(
      CHECK_VIOLATION,
    )

    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.profiles set display_name = $2 where id = $1', [
          carla,
          'x'.repeat(101),
        ]),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
  })

  it('o cadastro corta nomes enormes em vez de falhar', async () => {
    const id = '00000000-0000-4000-8000-00000000f0f1'
    await db.admin.query(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [id, 'longo@example.test', JSON.stringify({ display_name: 'n'.repeat(500) })],
    )
    const [profile] = await db.rows<{ display_name: string }>(
      'select display_name from public.profiles where id = $1',
      [id],
    )
    expect(profile?.display_name).toHaveLength(100)
  })
})
