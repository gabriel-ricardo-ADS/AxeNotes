// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS, type Fixtures } from './helpers/fixtures.ts'

// A busca como o CLIENTE (supabase-js → PostgREST) a usa na T4c: `supabase.rpc('search_pages', { p_workspace_id,
// p_query, p_limit })` vira uma chamada com ARGUMENTOS NOMEADOS. Aqui rodo o SQL equivalente com o papel
// `authenticated` e a RLS ligada. Se algum destes falhar, o app não pode ser entregue sem uma migration:
// pare e avise.

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
    delete from public.pages where title like 'T4c %';
    update public.pages set trashed_at = null;
  `)
})

const CALL =
  'select id, workspace_id, parent_id, title, icon, last_edited_at from public.search_pages(p_workspace_id := $1, p_query := $2, p_limit := $3)'

interface Hit {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  icon: unknown
  last_edited_at: Date
}

const search = (userId: string, workspaceId: string, query: string, limit = 20) =>
  db.as(actor(userId), (q) => q.rows<Hit>(CALL, [workspaceId, query, limit]))
const titles = async (userId: string, workspaceId: string, query: string, limit = 20) =>
  (await search(userId, workspaceId, query, limit)).map((row) => row.title)

async function makePage(title: string, sortKey = 'a5'): Promise<string> {
  const [row] = await db.rows<{ id: string }>(
    `insert into public.pages (workspace_id, title, sort_key, created_by)
     values ($1, $2, $3, $4) returning id`,
    [f.workspaceA, title, sortKey, ana],
  )
  if (!row) throw new Error('página não criada')
  return row.id
}

describe('search_pages como o cliente chama (T4c)', () => {
  it('ignores accents and case, in the term and in the title', async () => {
    await makePage('T4c Cálculo diferencial')
    await makePage('T4c Reunião semanal')

    expect(await titles(diego, f.workspaceA, 'calculo')).toEqual(['T4c Cálculo diferencial'])
    expect(await titles(diego, f.workspaceA, 'CÁLCULO')).toEqual(['T4c Cálculo diferencial'])
    expect(await titles(diego, f.workspaceA, 't4c reuniao')).toEqual(['T4c Reunião semanal'])
    expect(await titles(diego, f.workspaceA, 'Álgebra')).toEqual(['Álgebra linear'])
  })

  it('returns exactly the columns the client validates, with the parent', async () => {
    const [hit] = await search(ana, f.workspaceA, 'algebra')
    expect(hit && Object.keys(hit).sort()).toEqual(
      ['icon', 'id', 'last_edited_at', 'parent_id', 'title', 'workspace_id'].sort(),
    )
    expect(hit?.id).toBe(PAGES.algebra)
    expect(hit?.parent_id).toBe(PAGES.matematica)
    expect(hit?.workspace_id).toBe(f.workspaceA)
  })

  it('hides the trash, and shows the page again after restoring it', async () => {
    await db.as(actor(carla), (q) => q.rows('select public.trash_page($1)', [PAGES.estudos]))
    // A subárvore inteira saiu junto.
    expect(await titles(diego, f.workspaceA, 'estudos')).toEqual([])
    expect(await titles(diego, f.workspaceA, 'matematica')).toEqual([])
    expect(await titles(diego, f.workspaceA, 'algebra')).toEqual([])

    await db.as(actor(carla), (q) => q.rows('select public.restore_page($1)', [PAGES.estudos]))
    expect(await titles(diego, f.workspaceA, 'estudos')).toEqual(['Estudos'])
    expect(await titles(diego, f.workspaceA, 'algebra')).toEqual(['Álgebra linear'])
  })

  it('works for the owner, an editor and a viewer of the workspace', async () => {
    for (const userId of [ana, carla, diego]) {
      expect(await titles(userId, f.workspaceA, 'leituras')).toEqual(['Leituras'])
    }
  })

  it('returns nothing to someone outside the workspace, and nothing of theirs to the others', async () => {
    expect(await titles(bruno, f.workspaceA, 'estudos')).toEqual([])
    expect(await titles(bruno, f.workspaceB, 'diario')).toEqual(['Diário do Bruno'])
    expect(await titles(diego, f.workspaceB, 'diario')).toEqual([])
  })

  it('clamps the limit to 1..50 (the client asks for 20)', async () => {
    for (let i = 0; i < 60; i++) await makePage(`T4c lote ${String(i).padStart(2, '0')}`)

    expect(await titles(diego, f.workspaceA, 'lote', 20)).toHaveLength(20)
    expect(await titles(diego, f.workspaceA, 'lote', 0)).toHaveLength(1)
    expect(await titles(diego, f.workspaceA, 'lote', -5)).toHaveLength(1)
    expect(await titles(diego, f.workspaceA, 'lote', 1000)).toHaveLength(50)
  })

  it('treats % _ and \\ as plain text, sent raw by the client', async () => {
    await makePage('T4c 100% focado')
    await makePage('T4c a_b')
    await makePage('T4c caminho\\arquivo')
    await makePage('T4c abc')

    expect(await titles(diego, f.workspaceA, '100%')).toEqual(['T4c 100% focado'])
    expect(await titles(diego, f.workspaceA, '%')).toEqual(['T4c 100% focado'])
    expect(await titles(diego, f.workspaceA, 'a_b')).toEqual(['T4c a_b']) // "_" não é "qualquer letra"
    expect(await titles(diego, f.workspaceA, 'o\\a')).toEqual(['T4c caminho\\arquivo'])
    expect(await titles(diego, f.workspaceA, '\\')).toEqual(['T4c caminho\\arquivo'])
  })

  it('returns nothing for an empty term or one with only spaces, without an error', async () => {
    expect(await titles(diego, f.workspaceA, '')).toEqual([])
    expect(await titles(diego, f.workspaceA, '   ')).toEqual([])
    expect(await titles(diego, f.workspaceA, '\t\n')).toEqual([])
  })

  it('trims the term and accepts a very long one without an error', async () => {
    expect(await titles(diego, f.workspaceA, '  leituras  ')).toEqual(['Leituras'])
    expect(await titles(diego, f.workspaceA, 'a'.repeat(1000))).toEqual([])
    expect(await titles(diego, f.workspaceA, 'a'.repeat(200))).toEqual([])
  })

  it('is not callable by anon', async () => {
    await expect(
      db.as('anon', (q) => q.rows(CALL, [f.workspaceA, 'estudos', 20])),
    ).rejects.toThrow()
  })
})
