// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

// Favoritos e recentes como o CLIENTE (supabase-js → PostgREST) os grava e lê na T4a. Cada consulta
// aqui é o SQL equivalente ao que o PostgREST emite, rodando com o papel `authenticated` e a RLS ligada.
// Se algum destes falhar, o app não pode ser entregue sem uma migration: pare e avise.

const { ana, carla, diego } = USERS
const actor = (userId: string) => ({ userId })
const RLS_DENIED = { code: '42501' }

let db: TestDb
let f: Fixtures

beforeAll(async () => {
  db = await createTestDb()
  f = await seedFixtures(db)
}, 60_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.admin.exec('delete from public.user_favorites; delete from public.user_recents;')
})

describe('favoritar: upsert com ignoreDuplicates (ON CONFLICT DO NOTHING)', () => {
  const favorite = (userId: string, pageId: string, sortKey: string) =>
    db.as(actor(userId), (q) =>
      q.run(
        `insert into public.user_favorites (page_id, sort_key) values ($1, $2)
         on conflict (user_id, page_id) do nothing`,
        [pageId, sortKey],
      ),
    )

  it('grava uma vez; repetir (outra aba) não erra nem troca a chave de ordem', async () => {
    await favorite(carla, PAGES.estudos, 'a0')
    await favorite(carla, PAGES.estudos, 'a5')
    const rows = await db.as(actor(carla), (q) =>
      q.rows<{ page_id: string; sort_key: string }>(
        'select page_id, sort_key from public.user_favorites',
      ),
    )
    expect(rows).toEqual([{ page_id: PAGES.estudos, sort_key: 'a0' }])
  })

  it('o leitor (viewer) também favorita: é dado por usuário', async () => {
    await favorite(diego, PAGES.leituras, 'a0')
    const rows = await db.as(actor(diego), (q) => q.rows('select * from public.user_favorites'))
    expect(rows).toHaveLength(1)
  })

  it('recusa página de outro workspace e cada um só enxerga os próprios favoritos', async () => {
    await expect(favorite(carla, PAGES.segredo, 'a0')).rejects.toMatchObject(RLS_DENIED)
    await favorite(carla, PAGES.estudos, 'a0')
    expect(await db.as(actor(ana), (q) => q.rows('select * from public.user_favorites'))).toEqual(
      [],
    )
  })

  it('favorita enviada para a lixeira ainda é listada (o cliente esconde); restaurar não perde nada', async () => {
    await favorite(carla, PAGES.leituras, 'a0')
    await db.admin.query('update public.pages set trashed_at = now() where id = $1', [
      PAGES.leituras,
    ])
    try {
      const rows = await db.as(actor(carla), (q) =>
        q.rows('select page_id from public.user_favorites order by sort_key'),
      )
      expect(rows).toEqual([{ page_id: PAGES.leituras }])
    } finally {
      await db.admin.query('update public.pages set trashed_at = null where id = $1', [
        PAGES.leituras,
      ])
    }
  })

  it('desfavoritar apaga só a linha do próprio usuário', async () => {
    await favorite(carla, PAGES.estudos, 'a0')
    await favorite(diego, PAGES.estudos, 'a0')
    const removed = await db.as(actor(carla), (q) =>
      q.run('delete from public.user_favorites where user_id = $1 and page_id = $2', [
        carla,
        PAGES.estudos,
      ]),
    )
    const foreign = await db.as(actor(carla), (q) =>
      q.run('delete from public.user_favorites where user_id = $1 and page_id = $2', [
        diego,
        PAGES.estudos,
      ]),
    )
    expect(removed).toBe(1)
    expect(foreign).toBe(0)
    expect(await db.rows('select * from public.user_favorites')).toHaveLength(1)
  })
})

describe('recentes: upsert só com page_id e visited_at', () => {
  const visit = (userId: string, pageId: string, at: string) =>
    db.as(actor(userId), (q) =>
      q.run(
        `insert into public.user_recents (page_id, visited_at) values ($1, $2)
         on conflict (user_id, page_id)
         do update set page_id = excluded.page_id, visited_at = excluded.visited_at`,
        [pageId, at],
      ),
    )

  it('cria e depois renova visited_at na mesma linha', async () => {
    await visit(carla, PAGES.estudos, '2026-10-01T10:00:00Z')
    await visit(carla, PAGES.estudos, '2026-10-02T10:00:00Z')
    const rows = await db.as(actor(carla), (q) =>
      q.rows<{ visited_at: string }>('select visited_at from public.user_recents'),
    )
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0]?.visited_at ?? '').toISOString()).toBe('2026-10-02T10:00:00.000Z')
  })

  it('o leitor (viewer) registra visita; página inacessível é recusada', async () => {
    await visit(diego, PAGES.leituras, '2026-10-01T10:00:00Z')
    await expect(visit(diego, PAGES.segredo, '2026-10-01T10:00:00Z')).rejects.toMatchObject(
      RLS_DENIED,
    )
    expect(
      await db.as(actor(diego), (q) => q.rows('select * from public.user_recents')),
    ).toHaveLength(1)
  })

  it('lista as mais recentes primeiro, com limite', async () => {
    await visit(carla, PAGES.estudos, '2026-10-01T10:00:00Z')
    await visit(carla, PAGES.leituras, '2026-10-03T10:00:00Z')
    await visit(carla, PAGES.matematica, '2026-10-02T10:00:00Z')
    const rows = await db.as(actor(carla), (q) =>
      q.rows<{ page_id: string }>(
        'select page_id, visited_at from public.user_recents order by visited_at desc limit 2',
      ),
    )
    expect(rows.map((row) => row.page_id)).toEqual([PAGES.leituras, PAGES.matematica])
  })

  describe('limpeza do excesso (guarda as 50 mais recentes)', () => {
    async function seedManyPages(count: number): Promise<string[]> {
      const rows = await db.rows<{ id: string }>(
        `insert into public.pages (workspace_id, title, sort_key, created_by)
         select $1, 'Página de teste ' || n, 'z' || n, $2 from generate_series(1, $3) as n
         returning id`,
        [f.workspaceA, ana, count],
      )
      return rows.map((row) => row.id)
    }

    it('apaga só o que é mais antigo que a 50ª, e só do próprio usuário', async () => {
      const ids = await seedManyPages(55)
      for (const [index, id] of ids.entries()) {
        const at = new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString()
        await visit(carla, id, at)
      }
      await visit(diego, ids[0] ?? '', '2026-09-01T00:00:00Z')

      const fifty = await db.as(actor(carla), (q) =>
        q.rows<{ visited_at: string }>(
          'select visited_at from public.user_recents order by visited_at desc limit 50',
        ),
      )
      expect(fifty).toHaveLength(50)
      const cutoff = fifty[49]?.visited_at ?? ''

      // `.delete().eq('user_id', …).lt('visited_at', corte)`
      const removed = await db.as(actor(carla), (q) =>
        q.run('delete from public.user_recents where user_id = $1 and visited_at < $2', [
          carla,
          cutoff,
        ]),
      )
      expect(removed).toBe(5)
      expect(
        await db.as(actor(carla), (q) => q.rows('select * from public.user_recents')),
      ).toHaveLength(50)

      // O corte não toca nas linhas dos outros, nem mesmo mirando o user_id deles.
      const foreign = await db.as(actor(carla), (q) =>
        q.run('delete from public.user_recents where user_id = $1 and visited_at < $2', [
          diego,
          cutoff,
        ]),
      )
      expect(foreign).toBe(0)
      expect(
        await db.as(actor(diego), (q) => q.rows('select * from public.user_recents')),
      ).toHaveLength(1)
    })
  })
})
