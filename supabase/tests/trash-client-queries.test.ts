// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

// A lixeira como o CLIENTE (supabase-js → PostgREST) a usa na T4b. Cada consulta aqui é o SQL equivalente
// ao que o PostgREST emite, rodando com o papel `authenticated` e a RLS ligada. Se algum destes falhar,
// o app não pode ser entregue sem uma migration: pare e avise.

const { ana, bruno, carla, diego } = USERS
const actor = (userId: string) => ({ userId })

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
  // Cada teste começa com tudo fora da lixeira e sem as páginas que os testes anteriores criaram.
  await db.admin.exec(`
    delete from public.pages where title like 'T4b %';
    update public.pages set trashed_at = null;
    update public.workspaces set home_page_id = null;
    delete from public.user_favorites;
  `)
})

const trash = (userId: string, id: string) =>
  db.as(actor(userId), (q) => q.rows('select public.trash_page($1)', [id]))
const restore = (userId: string, id: string) =>
  db.as(actor(userId), (q) => q.rows('select public.restore_page($1)', [id]))

async function makePage(title: string, parentId: string | null, sortKey = 'a5'): Promise<string> {
  const [row] = await db.rows<{ id: string }>(
    `insert into public.pages (workspace_id, parent_id, title, sort_key, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [f.workspaceA, parentId, `T4b ${title}`, sortKey, ana],
  )
  if (!row) throw new Error('página não criada')
  return row.id
}

describe('listar a lixeira (fetchTrashedPages)', () => {
  // `.eq('workspace_id', ws).not('trashed_at', 'is', null).order('id').limit(1000)` e, nos lotes
  // seguintes, `.gt('id', último)`.
  const FIRST =
    'select id, parent_id, title, icon, trashed_at from public.pages where workspace_id = $1 and trashed_at is not null order by id asc limit 1000'
  const NEXT =
    'select id, parent_id, title, icon, trashed_at from public.pages where workspace_id = $1 and trashed_at is not null and id > $2 order by id asc limit 1000'

  it('lists trashed pages (with the parent and the stamp) for an editor and for a viewer', async () => {
    await trash(carla, PAGES.estudos)

    for (const userId of [carla, diego, ana]) {
      const rows = await db.as(actor(userId), (q) =>
        q.rows<{ id: string; parent_id: string | null; trashed_at: Date }>(FIRST, [f.workspaceA]),
      )
      expect(rows.map((row) => row.id)).toEqual([PAGES.estudos, PAGES.matematica, PAGES.algebra])
      expect(rows.find((row) => row.id === PAGES.matematica)?.parent_id).toBe(PAGES.estudos)
      // Toda a subárvore saiu junto: o mesmo carimbo, que a tela usa para achar as raízes.
      expect(new Set(rows.map((row) => String(row.trashed_at))).size).toBe(1)
    }
  })

  it('does not list pages that are not in the trash, nor anything to someone outside the workspace', async () => {
    await trash(carla, PAGES.leituras)

    const rows = await db.as(actor(carla), (q) => q.rows<{ id: string }>(FIRST, [f.workspaceA]))
    expect(rows.map((row) => row.id)).toEqual([PAGES.leituras])

    expect(await db.as(actor(bruno), (q) => q.rows(FIRST, [f.workspaceA]))).toEqual([])
    expect(await db.as(actor(bruno), (q) => q.rows(FIRST, [f.workspaceB]))).toEqual([])
  })

  it('continues after the last id of the previous batch (cursor), without repeating', async () => {
    await trash(carla, PAGES.estudos)
    const all = await db.as(actor(carla), (q) => q.rows<{ id: string }>(FIRST, [f.workspaceA]))
    const [first, ...rest] = all
    if (!first) throw new Error('lista vazia')

    const next = await db.as(actor(carla), (q) =>
      q.rows<{ id: string }>(NEXT, [f.workspaceA, first.id]),
    )
    expect(next.map((row) => row.id)).toEqual(rest.map((row) => row.id))

    const last = all[all.length - 1]
    expect(await db.as(actor(carla), (q) => q.rows(NEXT, [f.workspaceA, last?.id]))).toEqual([])
  })
})

describe('restaurar (restore_page)', () => {
  it('refuses to restore a child while its parent is still in the trash', async () => {
    await trash(carla, PAGES.estudos)

    await expect(restore(carla, PAGES.matematica)).rejects.toMatchObject({
      code: '23514',
      message: 'parent_trashed',
    })
    const still = await db.rows('select id from public.pages where trashed_at is not null')
    expect(still).toHaveLength(3)
  })

  it('restores a child trashed BEFORE its parent only after the parent is back, leaving it as its own root', async () => {
    await trash(carla, PAGES.algebra) // t1
    await trash(carla, PAGES.estudos) // t2: leva estudos e matematica; álgebra segue com t1

    await restore(carla, PAGES.estudos)

    const left = await db.rows<{ id: string }>(
      'select id from public.pages where trashed_at is not null',
    )
    expect(left.map((row) => row.id)).toEqual([PAGES.algebra])
    await restore(carla, PAGES.algebra)
    expect(await db.rows('select id from public.pages where trashed_at is not null')).toEqual([])
  })

  it('does not let a viewer restore', async () => {
    await trash(carla, PAGES.leituras)
    await expect(restore(diego, PAGES.leituras)).rejects.toMatchObject({ code: '42501' })
  })
})

describe('excluir definitivamente (delete … returning id)', () => {
  const del = (userId: string, id: string) =>
    db.as(actor(userId), (q) =>
      q.rows<{ id: string }>('delete from public.pages where id = $1 returning id', [id]),
    )

  it('only deletes a page that is already in the trash; a live page affects zero rows', async () => {
    const live = await makePage('viva', null)

    expect(await del(carla, live)).toEqual([])
    expect(await db.rows('select id from public.pages where id = $1', [live])).toHaveLength(1)

    await trash(carla, live)
    expect(await del(carla, live)).toEqual([{ id: live }])
  })

  it('affects zero rows for a viewer and for someone outside the workspace', async () => {
    const page = await makePage('alheia', null)
    await trash(carla, page)

    expect(await del(diego, page)).toEqual([])
    expect(await del(bruno, page)).toEqual([])
    expect(await db.rows('select id from public.pages where id = $1', [page])).toHaveLength(1)
  })

  it('takes every descendant along, including one trashed earlier, plus favorites and the home page link', async () => {
    const root = await makePage('raiz', null)
    const child = await makePage('filha', root)
    const grand = await makePage('neta', child)
    await trash(carla, child) // saiu antes
    await trash(carla, root)
    await db.admin.query(
      'insert into public.user_favorites (user_id, page_id, sort_key) values ($1, $2, $3)',
      [carla, grand, 'a0'],
    )
    await db.admin.query('update public.workspaces set home_page_id = $2 where id = $1', [
      f.workspaceA,
      root,
    ])

    expect(await del(carla, root)).toEqual([{ id: root }])

    expect(
      await db.rows('select id from public.pages where id = any($1)', [[root, child, grand]]),
    ).toEqual([])
    expect(
      await db.rows('select * from public.user_favorites where page_id = $1', [grand]),
    ).toEqual([])
    const [workspace] = await db.rows<{ home_page_id: string | null }>(
      'select home_page_id from public.workspaces where id = $1',
      [f.workspaceA],
    )
    expect(workspace?.home_page_id).toBeNull()
  })
})
