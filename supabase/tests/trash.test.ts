// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

const { ana, bruno, carla, diego } = USERS
const actor = (userId: string) => ({ userId })

const CHECK_VIOLATION = { code: '23514' }
const FORBIDDEN = { code: '42501' }

let db: TestDb
let f: Fixtures

beforeAll(async () => {
  db = await createTestDb()
  f = await seedFixtures(db)
}, 60_000)

afterAll(async () => {
  await db.close()
})

const trash = (userId: string, id: string) =>
  db.as(actor(userId), (q) => q.rows('select public.trash_page($1)', [id]))
const restore = (userId: string, id: string) =>
  db.as(actor(userId), (q) => q.rows('select public.restore_page($1)', [id]))
const trashedIds = async () =>
  (
    await db.rows<{ id: string }>(
      'select id from public.pages where trashed_at is not null order by id',
    )
  ).map((r) => r.id)

describe('lixeira em cascata', () => {
  it('levar uma página leva as subpáginas e restaurar traz tudo de volta', async () => {
    await trash(carla, PAGES.estudos)
    expect(await trashedIds()).toEqual([PAGES.estudos, PAGES.matematica, PAGES.algebra])

    const stamps = await db.rows<{ n: number }>(
      'select count(distinct trashed_at)::int as n from public.pages where trashed_at is not null',
    )
    expect(stamps[0]?.n).toBe(1)

    await restore(carla, PAGES.estudos)
    expect(await trashedIds()).toEqual([])
  })

  it('enviar duas vezes à lixeira não muda o carimbo', async () => {
    await trash(carla, PAGES.leituras)
    const [first] = await db.rows<{ trashed_at: Date }>(
      'select trashed_at from public.pages where id = $1',
      [PAGES.leituras],
    )
    await trash(carla, PAGES.leituras)
    const [second] = await db.rows<{ trashed_at: Date }>(
      'select trashed_at from public.pages where id = $1',
      [PAGES.leituras],
    )
    expect(second?.trashed_at).toEqual(first?.trashed_at)
    await restore(carla, PAGES.leituras)
  })

  it('restaurar a raiz não traz subpágina que já estava na lixeira antes', async () => {
    await db.admin.query(
      "update public.pages set trashed_at = '2026-01-01T00:00:00Z' where id = $1",
      [PAGES.algebra],
    )
    await trash(ana, PAGES.estudos)
    await restore(ana, PAGES.estudos)

    expect(await trashedIds()).toEqual([PAGES.algebra])
    await db.admin.query('update public.pages set trashed_at = null where id = $1', [PAGES.algebra])
  })

  it('não restaura uma subpágina cujo pai continua na lixeira', async () => {
    await trash(carla, PAGES.estudos)
    await expect(restore(carla, PAGES.matematica)).rejects.toMatchObject(CHECK_VIOLATION)
    await restore(carla, PAGES.estudos)
    expect(await trashedIds()).toEqual([])
  })

  it('restaurar uma subpágina isolada não toca no resto', async () => {
    await trash(carla, PAGES.algebra)
    await trash(carla, PAGES.estudos)
    // álgebra saiu antes; ao restaurar a raiz ela continua na lixeira
    expect(await trashedIds()).toEqual([PAGES.estudos, PAGES.matematica, PAGES.algebra])
    await restore(carla, PAGES.estudos)
    expect(await trashedIds()).toEqual([PAGES.algebra])
    await restore(carla, PAGES.algebra)
    expect(await trashedIds()).toEqual([])
  })

  it('leitor e não-membro não enviam nem restauram', async () => {
    await trash(ana, PAGES.leituras)
    await expect(trash(diego, PAGES.estudos)).rejects.toMatchObject(FORBIDDEN)
    await expect(restore(diego, PAGES.leituras)).rejects.toMatchObject(FORBIDDEN)
    await expect(restore(bruno, PAGES.leituras)).rejects.toMatchObject(FORBIDDEN)
    expect(await trashedIds()).toEqual([PAGES.leituras])
    await restore(ana, PAGES.leituras)
  })

  it('não dá para criar nem mover página para baixo de uma página na lixeira', async () => {
    await trash(carla, PAGES.leituras)
    await expect(
      db.as(actor(carla), (q) =>
        q.run(
          "insert into public.pages (workspace_id, parent_id, title, sort_key, created_by) values ($1, $2, 'Filha', 'a0', $3)",
          [f.workspaceA, PAGES.leituras, carla],
        ),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.pages set parent_id = $2 where id = $1', [
          PAGES.matematica,
          PAGES.leituras,
        ]),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
    await restore(carla, PAGES.leituras)
  })
})

describe('exclusão definitiva', () => {
  it('só vale para páginas na lixeira e leva as subpáginas junto', async () => {
    const del = (userId: string, id: string) =>
      db.as(actor(userId), (q) => q.run('delete from public.pages where id = $1', [id]))

    expect(await del(carla, PAGES.estudos)).toBe(0) // fora da lixeira

    await trash(carla, PAGES.estudos)
    expect(await del(diego, PAGES.estudos)).toBe(0) // leitor
    expect(await del(bruno, PAGES.estudos)).toBe(0) // não-membro
    expect(await del(carla, PAGES.estudos)).toBe(1)

    const remaining = await db.rows<{ id: string }>(
      'select id from public.pages where workspace_id = $1',
      [f.workspaceA],
    )
    expect(remaining.map((p) => p.id)).toEqual([PAGES.leituras])
  })

  it('apagar a página inicial limpa home_page_id', async () => {
    await db.admin.query('update public.workspaces set home_page_id = $2 where id = $1', [
      f.workspaceA,
      PAGES.leituras,
    ])
    await trash(carla, PAGES.leituras)
    await db.as(actor(carla), (q) =>
      q.run('delete from public.pages where id = $1', [PAGES.leituras]),
    )
    const [ws] = await db.rows<{ home_page_id: string | null }>(
      'select home_page_id from public.workspaces where id = $1',
      [f.workspaceA],
    )
    expect(ws?.home_page_id).toBeNull()
  })
})
