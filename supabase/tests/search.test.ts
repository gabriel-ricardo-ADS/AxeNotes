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

describe('search_pages no corpo (page_texts)', () => {
  const setText = (userId: string, pageId: string, text: string) =>
    db.as({ userId }, (q) => q.rows('select public.set_page_text($1, $2, null)', [pageId, text]))

  const hits = (userId: string, workspaceId: string, query: string) =>
    db.as({ userId }, (q) =>
      q.rows<{ title: string; snippet: string | null }>(
        'select title, snippet from public.search_pages($1, $2, 20)',
        [workspaceId, query],
      ),
    )

  it('acha palavra do corpo sem acento e sem diferenciar maiúsculas, com trecho', async () => {
    await setText(ana, PAGES.matematica, 'Revisar o Teorema de Pitágoras antes da prova.')
    expect(await hits(diego, f.workspaceA, 'pitagoras')).toEqual([
      { title: 'Matemática', snippet: 'Revisar o Teorema de Pitágoras antes da prova.' },
    ])
    expect(await hits(diego, f.workspaceA, 'TEOREMA')).toHaveLength(1)
  })

  it('o trecho corta o texto longo em volta do termo, com reticências', async () => {
    const text = `${'antes '.repeat(40)}palavrachave${' depois'.repeat(40)}`
    await setText(ana, PAGES.algebra, text)
    const [hit] = await hits(diego, f.workspaceA, 'palavrachave')
    expect(hit?.snippet?.startsWith('…')).toBe(true)
    expect(hit?.snippet?.endsWith('…')).toBe(true)
    expect(hit?.snippet).toContain('palavrachave')
    expect(hit?.snippet?.length ?? 0).toBeLessThanOrEqual(162)
  })

  it('título vem antes do corpo e, quando o título casa, não há trecho', async () => {
    await setText(ana, PAGES.estudos, 'Uma nota sobre cálculo diferencial.')
    const result = await hits(diego, f.workspaceA, 'calculo')
    expect(result.map((r) => r.title)).toEqual(['Cálculo diferencial', 'Estudos'])
    expect(result[0]?.snippet).toBeNull()
    expect(result[1]?.snippet).toContain('cálculo')
  })

  it('respeita a RLS e a lixeira', async () => {
    await setText(ana, PAGES.leituras, 'segredo de leitura zzqx')
    expect(await hits(bruno, f.workspaceA, 'zzqx')).toEqual([])
    expect(await hits(bruno, f.workspaceB, 'zzqx')).toEqual([])
    await db.as({ userId: ana }, (q) => q.rows('select public.trash_page($1)', [PAGES.leituras]))
    expect(await hits(diego, f.workspaceA, 'zzqx')).toEqual([])
    await db.as({ userId: ana }, (q) => q.rows('select public.restore_page($1)', [PAGES.leituras]))
    expect(await hits(diego, f.workspaceA, 'zzqx')).toHaveLength(1)
  })

  it('corpo de página de outro workspace não aparece mesmo para quem lê os dois', async () => {
    await setText(bruno, PAGES.segredo, 'texto exclusivo qwzk')
    expect(await hits(bruno, f.workspaceA, 'qwzk')).toEqual([])
    expect(await hits(bruno, f.workspaceB, 'qwzk')).toHaveLength(1)
  })

  it('o filtro do corpo usa o índice trigram (mesma expressão do índice)', async () => {
    const plan = await db.admin.transaction(async (tx) => {
      await tx.exec('set local enable_seqscan = off')
      const result = await tx.query<{ 'QUERY PLAN': string }>(
        `explain select t.page_id from public.page_texts t
         where public.immutable_unaccent(lower(t.text)) like '%' || $1 || '%' escape '\\'`,
        ['pitagoras'],
      )
      return result.rows.map((row) => row['QUERY PLAN']).join('\n')
    })
    expect(plan).toContain('page_texts_text_search_idx')
  })

  it('com RLS (authenticated), o corpo fica limitado às páginas do workspace', async () => {
    // Sob RLS o `like` (não leakproof) não vira condição de índice; o join por workspace evita
    // percorrer page_texts de todos os workspaces.
    const plan = await db.as({ userId: ana }, async (q) => {
      await q.rows('set local enable_seqscan = off')
      const rows = await q.rows<{ 'QUERY PLAN': string }>(
        `explain select t.page_id from public.page_texts t
         join public.pages p on p.id = t.page_id and p.workspace_id = $1
         where public.immutable_unaccent(lower(t.text)) like '%' || $2 || '%' escape '\\'`,
        [f.workspaceA, 'pitagoras'],
      )
      return rows.map((row) => row['QUERY PLAN']).join('\n')
    })
    expect(plan).toContain('pages_tree_idx')
    expect(plan).toContain('page_texts_pkey')
    expect(plan).not.toMatch(/Seq Scan on page_texts/)
  })
})

describe('permissões da search_pages recriada', () => {
  it('anon não executa; authenticated executa', async () => {
    await expect(
      db.as('anon', (q) =>
        q.rows('select * from public.search_pages($1, $2, 20)', [f.workspaceA, 'x']),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(search(diego, f.workspaceA, 'x')).resolves.toBeDefined()
  })
})
