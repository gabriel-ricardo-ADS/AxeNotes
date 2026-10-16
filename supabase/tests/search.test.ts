// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

const { ana, bruno, diego } = USERS

let db: TestDb
let f: Fixtures

beforeAll(async () => {
  db = await createTestDb()
  f = await seedFixtures(db)
  const extra = ['Cálculo diferencial', '100% focado', 'a_b', 'Reunião de acompanhamento', 'ação']
  for (const [i, title] of extra.entries()) {
    await db.admin.query(
      `insert into public.pages (workspace_id, title, sort_key, created_by)
       values ($1, $2, $3, $4)`,
      [f.workspaceA, title, `b${String(i)}`, ana],
    )
  }
}, 60_000)

afterAll(async () => {
  await db.close()
})

const search = (userId: string, workspaceId: string, query: string, limit?: number) =>
  db.as({ userId }, async (q) =>
    (
      await q.rows<{ title: string }>('select title from public.search_pages($1, $2, $3)', [
        workspaceId,
        query,
        limit ?? 20,
      ])
    ).map((r) => r.title),
  )

describe('search_pages', () => {
  it('ignora acentos e maiúsculas, nos dois lados', async () => {
    expect(await search(diego, f.workspaceA, 'calculo')).toEqual(['Cálculo diferencial'])
    expect(await search(diego, f.workspaceA, 'CÁLCULO')).toEqual(['Cálculo diferencial'])
    expect(await search(diego, f.workspaceA, 'reuniao')).toEqual(['Reunião de acompanhamento'])
    expect(await search(diego, f.workspaceA, 'acao')).toEqual(['ação'])
  })

  it('acha no meio do título e põe os títulos que começam com o termo primeiro', async () => {
    const titles = await search(diego, f.workspaceA, 'a')
    // 'ação', 'a_b' e 'Álgebra linear' começam com "a" (sem acento); os demais só contêm.
    expect(titles.slice(0, 3)).toEqual(expect.arrayContaining(['ação', 'a_b', 'Álgebra linear']))
    expect(titles).toContain('Matemática')
    expect(titles).not.toContain('Estudos') // sem "a"
  })

  it('trata % _ e \\ como texto comum', async () => {
    expect(await search(diego, f.workspaceA, '%')).toEqual(['100% focado'])
    expect(await search(diego, f.workspaceA, '_')).toEqual(['a_b'])
    expect(await search(diego, f.workspaceA, '\\')).toEqual([])
  })

  it('termo vazio ou só com espaços não devolve nada', async () => {
    expect(await search(diego, f.workspaceA, '')).toEqual([])
    expect(await search(diego, f.workspaceA, '   ')).toEqual([])
  })

  it('esconde a lixeira', async () => {
    await db.as({ userId: ana }, (q) => q.rows('select public.trash_page($1)', [PAGES.leituras]))
    expect(await search(diego, f.workspaceA, 'leituras')).toEqual([])
    await db.as({ userId: ana }, (q) => q.rows('select public.restore_page($1)', [PAGES.leituras]))
    expect(await search(diego, f.workspaceA, 'leituras')).toEqual(['Leituras'])
  })

  it('respeita o workspace e a RLS: B não encontra nada de A', async () => {
    expect(await search(bruno, f.workspaceA, 'estudos')).toEqual([])
    expect(await search(bruno, f.workspaceB, 'diario')).toEqual(['Diário do Bruno'])
    expect(await search(diego, f.workspaceB, 'diario')).toEqual([])
  })

  it('limita a quantidade de resultados', async () => {
    expect(await search(diego, f.workspaceA, 'a', 2)).toHaveLength(2)
    expect((await search(diego, f.workspaceA, 'a', 0)).length).toBe(1)
    expect((await search(diego, f.workspaceA, 'a', 1000)).length).toBeLessThanOrEqual(50)
  })
})
