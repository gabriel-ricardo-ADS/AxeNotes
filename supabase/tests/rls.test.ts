// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

const { ana, bruno, carla, diego } = USERS
const actor = (userId: string) => ({ userId })

const FORBIDDEN = { code: '42501' } // permissão negada / violação de RLS
const CHECK_VIOLATION = { code: '23514' }
const FK_VIOLATION = { code: '23503' }

let db: TestDb
let f: Fixtures

beforeAll(async () => {
  db = await createTestDb()
  f = await seedFixtures(db)
}, 60_000)

afterAll(async () => {
  await db.close()
})

const insertPage = (
  workspaceId: string,
  createdBy: string,
  title = 'Nova',
  parentId?: string,
): [string, unknown[]] => [
  `insert into public.pages (workspace_id, parent_id, title, sort_key, created_by)
   values ($1, $2, $3, 'a5', $4) returning id`,
  [workspaceId, parentId ?? null, title, createdBy],
]

describe('anon', () => {
  it('não acessa nenhuma tabela', async () => {
    for (const table of [
      'profiles',
      'workspaces',
      'workspace_members',
      'pages',
      'user_favorites',
      'user_recents',
    ]) {
      await expect(
        db.as('anon', (q) => q.rows(`select * from public.${table}`)),
      ).rejects.toMatchObject(FORBIDDEN)
    }
  })

  it('não executa as funções da API', async () => {
    await expect(
      db.as('anon', (q) => q.rows('select public.search_pages($1, $2)', [f.workspaceA, 'a'])),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as('anon', (q) => q.rows('select public.trash_page($1)', [PAGES.estudos])),
    ).rejects.toMatchObject(FORBIDDEN)
  })
})

describe('workspaces e membros', () => {
  it('B não vê o workspace de A nem seus membros', async () => {
    const workspaces = await db.as(actor(bruno), (q) =>
      q.rows<{ id: string }>('select id from public.workspaces'),
    )
    expect(workspaces.map((w) => w.id)).toEqual([f.workspaceB])

    const members = await db.as(actor(bruno), (q) =>
      q.rows('select * from public.workspace_members where workspace_id = $1', [f.workspaceA]),
    )
    expect(members).toHaveLength(0)
  })

  it('B não enxerga perfis de quem não divide workspace com ele', async () => {
    const profiles = await db.as(actor(bruno), (q) =>
      q.rows<{ id: string }>('select id from public.profiles'),
    )
    expect(profiles.map((p) => p.id)).toEqual([bruno])
  })

  it('membros veem a lista de membros e os perfis uns dos outros', async () => {
    const members = await db.as(actor(carla), (q) =>
      q.rows<{ user_id: string }>(
        'select user_id from public.workspace_members where workspace_id = $1',
        [f.workspaceA],
      ),
    )
    expect(members.map((m) => m.user_id).sort()).toEqual([ana, carla, diego].sort())

    const profiles = await db.as(actor(carla), (q) =>
      q.rows<{ id: string }>('select id from public.profiles'),
    )
    expect(profiles.map((p) => p.id)).toContain(ana)
    expect(profiles.map((p) => p.id)).not.toContain(bruno)
  })

  it('só o owner altera o workspace', async () => {
    const rename = (userId: string) =>
      db.as(actor(userId), (q) =>
        q.run("update public.workspaces set name = 'Renomeado' where id = $1", [f.workspaceA]),
      )
    expect(await rename(bruno)).toBe(0)
    expect(await rename(diego)).toBe(0)
    expect(await rename(carla)).toBe(0)
    expect(await rename(ana)).toBe(1)
  })

  it('ninguém cria workspace nem membro pelo cliente', async () => {
    await expect(
      db.as(actor(ana), (q) => q.run("insert into public.workspaces (name) values ('Outro')")),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(ana), (q) =>
        q.run(
          "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')",
          [f.workspaceA, bruno],
        ),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(bruno), (q) =>
        q.run(
          "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')",
          [f.workspaceA, bruno],
        ),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('editor e leitor não mudam papéis; o owner muda', async () => {
    const setRole = (userId: string, target: string, role: string) =>
      db.as(actor(userId), (q) =>
        q.run(
          'update public.workspace_members set role = $3 where workspace_id = $1 and user_id = $2',
          [f.workspaceA, target, role],
        ),
      )
    expect(await setRole(carla, diego, 'editor')).toBe(0)
    expect(await setRole(diego, diego, 'owner')).toBe(0)
    expect(await setRole(bruno, diego, 'owner')).toBe(0)
    expect(await setRole(ana, diego, 'editor')).toBe(1)
    expect(await setRole(ana, diego, 'viewer')).toBe(1)
  })

  it('não deixa o workspace sem dono', async () => {
    await expect(
      db.as(actor(ana), (q) =>
        q.run(
          "update public.workspace_members set role = 'editor' where workspace_id = $1 and user_id = $2",
          [f.workspaceA, ana],
        ),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
    await expect(
      db.as(actor(ana), (q) =>
        q.run('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [
          f.workspaceA,
          ana,
        ]),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
  })

  it('cada membro pode sair, mas ninguém remove outro sem ser owner', async () => {
    const remove = (userId: string, target: string) =>
      db.as(actor(userId), (q) =>
        q.run('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [
          f.workspaceA,
          target,
        ]),
      )
    expect(await remove(diego, carla)).toBe(0)
    expect(await remove(bruno, carla)).toBe(0)

    // Diego sai e é readmitido (como o convite fará na Fase 11).
    expect(await remove(diego, diego)).toBe(1)
    await db.admin.query(
      "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')",
      [f.workspaceA, diego],
    )
  })

  it('cada um edita só o próprio perfil', async () => {
    const rename = (userId: string, target: string) =>
      db.as(actor(userId), (q) =>
        q.run("update public.profiles set display_name = 'Mudou' where id = $1", [target]),
      )
    expect(await rename(ana, carla)).toBe(0)
    expect(await rename(carla, carla)).toBe(1)
  })

  it('o owner define a página inicial, e só entre páginas do próprio workspace', async () => {
    const setHome = (userId: string, pageId: string) =>
      db.as(actor(userId), (q) =>
        q.run('update public.workspaces set home_page_id = $2 where id = $1', [
          f.workspaceA,
          pageId,
        ]),
      )
    expect(await setHome(ana, PAGES.leituras)).toBe(1)
    await expect(setHome(ana, PAGES.segredo)).rejects.toMatchObject(FK_VIOLATION)
    expect(await setHome(carla, PAGES.estudos)).toBe(0)
  })
})

describe('pages: quem não é membro', () => {
  it('B não lê as páginas de A e só vê as próprias', async () => {
    const pages = await db.as(actor(bruno), (q) =>
      q.rows<{ id: string }>('select id from public.pages'),
    )
    expect(pages.map((p) => p.id)).toEqual([PAGES.segredo])
  })

  it('B não cria página em A, nem uma página de B sob um pai de A', async () => {
    await expect(
      db.as(actor(bruno), (q) => q.rows(...insertPage(f.workspaceA, bruno))),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(bruno), (q) =>
        q.rows(...insertPage(f.workspaceB, bruno, 'Intruso', PAGES.estudos)),
      ),
    ).rejects.toMatchObject(FK_VIOLATION)
  })

  it('B não edita, move nem apaga páginas de A', async () => {
    const run = (sql: string) => db.as(actor(bruno), (q) => q.run(sql, [PAGES.estudos]))
    expect(await run("update public.pages set title = 'Hackeado' where id = $1")).toBe(0)
    expect(await run('update public.pages set parent_id = null where id = $1')).toBe(0)
    expect(await run('delete from public.pages where id = $1')).toBe(0)
    await expect(
      db.as(actor(bruno), (q) => q.rows('select public.trash_page($1)', [PAGES.estudos])),
    ).rejects.toMatchObject(FORBIDDEN)

    const [page] = await db.rows<{ title: string; trashed_at: Date | null }>(
      'select title, trashed_at from public.pages where id = $1',
      [PAGES.estudos],
    )
    expect(page).toMatchObject({ title: 'Estudos', trashed_at: null })
  })

  it('B não move uma página dele para o workspace de A', async () => {
    await expect(
      db.as(actor(bruno), (q) =>
        q.run('update public.pages set workspace_id = $2 where id = $1', [
          PAGES.segredo,
          f.workspaceA,
        ]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
  })
})

describe('pages: leitor', () => {
  it('lê as páginas do workspace', async () => {
    const pages = await db.as(actor(diego), (q) =>
      q.rows<{ id: string }>('select id from public.pages where workspace_id = $1', [f.workspaceA]),
    )
    expect(pages.map((p) => p.id)).toEqual(expect.arrayContaining([PAGES.estudos, PAGES.algebra]))
  })

  it('não cria, edita, move, apaga nem manda para a lixeira', async () => {
    await expect(
      db.as(actor(diego), (q) => q.rows(...insertPage(f.workspaceA, diego))),
    ).rejects.toMatchObject(FORBIDDEN)
    const run = (sql: string) => db.as(actor(diego), (q) => q.run(sql, [PAGES.leituras]))
    expect(await run("update public.pages set title = 'Mudou' where id = $1")).toBe(0)
    expect(await run('update public.pages set parent_id = null where id = $1')).toBe(0)
    expect(await run('delete from public.pages where id = $1')).toBe(0)
    await expect(
      db.as(actor(diego), (q) => q.rows('select public.trash_page($1)', [PAGES.leituras])),
    ).rejects.toMatchObject(FORBIDDEN)

    const [page] = await db.rows<{ title: string }>(
      'select title from public.pages where id = $1',
      [PAGES.leituras],
    )
    expect(page?.title).toBe('Leituras')
  })
})

describe('pages: editor', () => {
  it('cria, edita e move páginas, e o servidor registra quem editou', async () => {
    const [created] = await db.as(actor(carla), (q) =>
      q.rows<{ id: string }>(...insertPage(f.workspaceA, carla, 'Rascunho')),
    )
    expect(created).toBeDefined()
    const id = created?.id ?? ''

    expect(
      await db.as(actor(carla), (q) =>
        q.run("update public.pages set title = 'Rascunho 2', parent_id = $2 where id = $1", [
          id,
          PAGES.leituras,
        ]),
      ),
    ).toBe(1)

    const [page] = await db.rows<{ title: string; parent_id: string; last_edited_by: string }>(
      'select title, parent_id, last_edited_by from public.pages where id = $1',
      [id],
    )
    expect(page).toEqual({ title: 'Rascunho 2', parent_id: PAGES.leituras, last_edited_by: carla })
  })

  it('não cria página em nome de outra pessoa', async () => {
    await expect(
      db.as(actor(carla), (q) => q.rows(...insertPage(f.workspaceA, ana))),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('não troca o workspace da página nem mexe em trashed_at direto', async () => {
    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.pages set workspace_id = $2 where id = $1', [
          PAGES.leituras,
          f.workspaceB,
        ]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.pages set trashed_at = now() where id = $1', [PAGES.leituras]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('não cria ciclos nem coloca página sob ela mesma', async () => {
    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.pages set parent_id = $2 where id = $1', [
          PAGES.estudos,
          PAGES.algebra,
        ]),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
    await expect(
      db.as(actor(carla), (q) =>
        q.run('update public.pages set parent_id = $1 where id = $1', [PAGES.estudos]),
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION)
  })

  it('não gerencia membros', async () => {
    expect(
      await db.as(actor(carla), (q) =>
        q.run(
          "update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2",
          [f.workspaceA, carla],
        ),
      ),
    ).toBe(0)
  })
})

describe('favoritos e recentes', () => {
  it('são privados por usuário', async () => {
    await db.as(actor(carla), (q) =>
      q.run("insert into public.user_favorites (page_id, sort_key) values ($1, 'a0')", [
        PAGES.estudos,
      ]),
    )
    await db.as(actor(carla), (q) =>
      q.run('insert into public.user_recents (page_id) values ($1)', [PAGES.estudos]),
    )

    const countOf = (userId: string, table: string) =>
      db.as(actor(userId), async (q) => (await q.rows(`select * from public.${table}`)).length)
    expect(await countOf(carla, 'user_favorites')).toBe(1)
    expect(await countOf(carla, 'user_recents')).toBe(1)
    expect(await countOf(ana, 'user_favorites')).toBe(0)
    expect(await countOf(ana, 'user_recents')).toBe(0)
    expect(await countOf(bruno, 'user_favorites')).toBe(0)
  })

  it('não aceitam página inacessível nem em nome de outro usuário', async () => {
    await expect(
      db.as(actor(diego), (q) =>
        q.run("insert into public.user_favorites (page_id, sort_key) values ($1, 'a0')", [
          PAGES.segredo,
        ]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(diego), (q) =>
        q.run('insert into public.user_recents (page_id) values ($1)', [PAGES.segredo]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(diego), (q) =>
        q.run(
          "insert into public.user_favorites (user_id, page_id, sort_key) values ($1, $2, 'a0')",
          [carla, PAGES.leituras],
        ),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('o upsert de recentes renova visited_at', async () => {
    const visit = (at: string) =>
      db.as(actor(carla), (q) =>
        q.run(
          `insert into public.user_recents (page_id, visited_at) values ($1, $2)
           on conflict (user_id, page_id) do update set visited_at = excluded.visited_at`,
          [PAGES.estudos, at],
        ),
      )
    await visit('2026-01-01T10:00:00Z')
    await visit('2026-02-02T10:00:00Z')
    const rows = await db.as(actor(carla), (q) =>
      q.rows<{ visited_at: Date }>(
        'select visited_at from public.user_recents where page_id = $1',
        [PAGES.estudos],
      ),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.visited_at.toISOString()).toBe('2026-02-02T10:00:00.000Z')
  })

  it('somem quando o usuário perde o acesso à página', async () => {
    await db.admin.query(
      'delete from public.workspace_members where workspace_id = $1 and user_id = $2',
      [f.workspaceA, carla],
    )
    const rows = await db.as(actor(carla), (q) => q.rows('select * from public.user_favorites'))
    expect(rows).toHaveLength(0)
    await db.admin.query(
      "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'editor')",
      [f.workspaceA, carla],
    )
  })
})
