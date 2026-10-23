// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createTestDb, type TestDb } from './helpers/db.ts'
import { PAGES, seedFixtures, USERS } from './helpers/fixtures.ts'

const { ana, bruno, carla, diego } = USERS
const actor = (userId: string) => ({ userId })

const FORBIDDEN = { code: '42501' }
const INVALID = { code: '22023' }
const MIB = 1024 * 1024

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await seedFixtures(db)
}, 60_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.admin.query('delete from public.page_contents')
  await db.admin.query('delete from public.page_texts')
})

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const bytesOf = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'))
const filler = (size: number) => b64(new Uint8Array(size).fill(7))

interface ContentRow {
  id: number
  kind: string
  data: string
  covers_up_to: number | null
  byte_size: number
}

const append = (userId: string, pageId: string, updates: string[]) =>
  db.as(actor(userId), async (q) => {
    const [row] = await q.rows<{ ids: number[] | null }>(
      'select public.append_page_updates($1, $2)::int[] as ids',
      [pageId, updates],
    )
    return row?.ids ?? []
  })

const read = (userId: string, pageId: string, after: number | null = null) =>
  db.as(actor(userId), (q) =>
    q.rows<ContentRow>(
      `select id::int as id, kind, data, covers_up_to::int as covers_up_to, byte_size
       from public.get_page_content($1, $2)`,
      [pageId, after],
    ),
  )

const compact = (userId: string, pageId: string, snapshot: string, upTo: number) =>
  db.as(actor(userId), async (q) => {
    const [row] = await q.rows<{ done: boolean }>(
      'select public.compact_page_content($1, $2, $3) as done',
      [pageId, snapshot, upTo],
    )
    return row?.done
  })

const setText = (userId: string, pageId: string, text: string, json: unknown = null) =>
  db.as(actor(userId), (q) =>
    q.rows('select public.set_page_text($1, $2, $3)', [
      pageId,
      text,
      json === null ? null : JSON.stringify(json),
    ]),
  )

/** Um update Yjs de verdade: um texto inserido num doc novo (cliente próprio). */
function yUpdate(text: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getText('t').insert(0, text)
  return Y.encodeStateAsUpdate(doc)
}

/** Monta um doc com as linhas (base64) e devolve o texto. */
function textOf(rows: { data: string }[]): string {
  const doc = new Y.Doc()
  for (const row of rows) Y.applyUpdate(doc, bytesOf(row.data))
  return doc.getText('t').toJSON()
}

describe('page_contents: RLS e papéis', () => {
  it('editor e dono escrevem; leitor e não-membro não escrevem', async () => {
    expect(await append(ana, PAGES.estudos, [b64(yUpdate('a'))])).toHaveLength(1)
    expect(await append(carla, PAGES.estudos, [b64(yUpdate('c'))])).toHaveLength(1)
    await expect(append(diego, PAGES.estudos, [b64(yUpdate('d'))])).rejects.toMatchObject(FORBIDDEN)
    await expect(append(bruno, PAGES.estudos, [b64(yUpdate('b'))])).rejects.toMatchObject(FORBIDDEN)
    // Página que não existe: mesma resposta, não vaza a existência.
    await expect(
      append(ana, '10000000-0000-4000-8000-0000000000ff', [b64(yUpdate('x'))]),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('leitor lê; não-membro não lê nada (nem pela tabela, nem pela RPC)', async () => {
    await append(ana, PAGES.estudos, [b64(yUpdate('oi'))])
    expect(await read(diego, PAGES.estudos)).toHaveLength(1)
    expect(await read(bruno, PAGES.estudos)).toEqual([])
    const direct = await db.as(actor(bruno), (q) => q.rows('select * from public.page_contents'))
    expect(direct).toEqual([])
  })

  it('ninguém escreve direto na tabela, nem a dona', async () => {
    await append(ana, PAGES.estudos, [b64(yUpdate('oi'))])
    await expect(
      db.as(actor(ana), (q) =>
        q.run(
          `insert into public.page_contents (page_id, kind, data) values ($1, 'update', '\\x01')`,
          [PAGES.estudos],
        ),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(ana), (q) => q.run('update public.page_contents set superseded_at = now()')),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(ana), (q) => q.run('delete from public.page_contents')),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as(actor(ana), (q) =>
        q.run(`insert into public.page_texts (page_id, text) values ($1, 'x')`, [PAGES.estudos]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('anon não executa as RPCs nem lê as tabelas', async () => {
    await expect(
      db.as('anon', (q) => q.rows('select * from public.get_page_content($1)', [PAGES.estudos])),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as('anon', (q) =>
        q.rows('select public.append_page_updates($1, $2)', [PAGES.estudos, ['AQ==']]),
      ),
    ).rejects.toMatchObject(FORBIDDEN)
    await expect(
      db.as('anon', (q) => q.rows('select * from public.page_texts')),
    ).rejects.toMatchObject(FORBIDDEN)
  })

  it('página na lixeira: lê, mas não aceita append, compactação nem texto', async () => {
    const [id] = await append(ana, PAGES.leituras, [b64(yUpdate('antes'))])
    await db.as(actor(ana), (q) => q.rows('select public.trash_page($1)', [PAGES.leituras]))
    try {
      await expect(append(ana, PAGES.leituras, [b64(yUpdate('x'))])).rejects.toMatchObject(
        FORBIDDEN,
      )
      await expect(
        compact(ana, PAGES.leituras, b64(yUpdate('antes')), id ?? 0),
      ).rejects.toMatchObject(FORBIDDEN)
      await expect(setText(ana, PAGES.leituras, 'x')).rejects.toMatchObject(FORBIDDEN)
      expect(await read(diego, PAGES.leituras)).toHaveLength(1)
    } finally {
      await db.as(actor(ana), (q) => q.rows('select public.restore_page($1)', [PAGES.leituras]))
    }
  })
})

describe('page_contents: limites', () => {
  it('recusa mais de 100 updates por chamada', async () => {
    const many = Array.from({ length: 101 }, () => 'AQ==')
    await expect(append(ana, PAGES.estudos, many)).rejects.toMatchObject({
      ...INVALID,
      message: 'page_content_batch_too_large',
    })
    expect(await append(ana, PAGES.estudos, many.slice(1))).toHaveLength(100)
  })

  it('recusa um update acima de 1 MiB e lote acima de 2 MiB', async () => {
    await expect(append(ana, PAGES.estudos, [filler(MIB + 1)])).rejects.toMatchObject({
      ...INVALID,
      message: 'page_content_too_large',
    })
    await expect(
      append(ana, PAGES.estudos, [filler(MIB), filler(MIB), filler(1)]),
    ).rejects.toMatchObject({ ...INVALID, message: 'page_content_batch_too_large' })
    expect(await append(ana, PAGES.estudos, [filler(MIB), filler(MIB)])).toHaveLength(2)
  })

  it('recusa base64 inválido ou vazio', async () => {
    await expect(append(ana, PAGES.estudos, ['não é base64!'])).rejects.toMatchObject({
      ...INVALID,
      message: 'page_content_invalid',
    })
    await expect(append(ana, PAGES.estudos, [''])).rejects.toMatchObject(INVALID)
  })

  it('recusa snapshot acima de 8 MiB', async () => {
    const [id] = await append(ana, PAGES.estudos, ['AQ=='])
    await expect(compact(ana, PAGES.estudos, filler(8 * MIB + 1), id ?? 0)).rejects.toMatchObject({
      ...INVALID,
      message: 'page_content_too_large',
    })
  })

  it('recusa append quando as linhas vivas da página passariam de 32 MiB', async () => {
    await db.admin.query(
      `insert into public.page_contents (page_id, kind, data)
       select $1, 'update', convert_to(repeat('a', 8388608), 'UTF8') from generate_series(1, 4)`,
      [PAGES.estudos],
    )
    await expect(append(ana, PAGES.estudos, ['AQ=='])).rejects.toMatchObject({
      ...INVALID,
      message: 'page_content_live_too_large',
    })
    // Outra página não é afetada.
    expect(await append(ana, PAGES.matematica, ['AQ=='])).toHaveLength(1)
  }, 30_000)
})

describe('compactação', () => {
  it('append concorrente durante a compactação não se perde', async () => {
    // Sessão A lê o log; sessão B grava um update depois da leitura e antes da compactação de A.
    await append(ana, PAGES.estudos, [b64(yUpdate('um '))])
    await append(carla, PAGES.estudos, [b64(yUpdate('dois '))])
    const seenByA = await read(ana, PAGES.estudos)
    const upTo = Math.max(...seenByA.map((r) => r.id))

    const [lateId] = await append(carla, PAGES.estudos, [b64(yUpdate('três'))])

    const docA = new Y.Doc()
    for (const row of seenByA) Y.applyUpdate(docA, bytesOf(row.data))
    expect(await compact(ana, PAGES.estudos, b64(Y.encodeStateAsUpdate(docA)), upTo)).toBe(true)

    const live = await read(diego, PAGES.estudos)
    expect(live.map((r) => r.kind)).toEqual(['update', 'snapshot'])
    expect(live[0]?.id).toBe(lateId)
    expect(live[1]?.covers_up_to).toBe(upTo)

    const all = textOf(live)
    for (const part of ['um', 'dois', 'três']) expect(all).toContain(part)
  })

  it('é idempotente: a mesma compactação de novo não faz nada', async () => {
    const ids = await append(ana, PAGES.estudos, [b64(yUpdate('a')), b64(yUpdate('b'))])
    const upTo = Math.max(...ids)
    const rows = await read(ana, PAGES.estudos)
    const doc = new Y.Doc()
    for (const row of rows) Y.applyUpdate(doc, bytesOf(row.data))
    const snapshot = b64(Y.encodeStateAsUpdate(doc))

    expect(await compact(ana, PAGES.estudos, snapshot, upTo)).toBe(true)
    expect(await compact(carla, PAGES.estudos, snapshot, upTo)).toBe(false)
    expect(await compact(carla, PAGES.estudos, snapshot, upTo - 1)).toBe(false)

    const live = await read(ana, PAGES.estudos)
    expect(live).toHaveLength(1)
    expect(live[0]?.kind).toBe('snapshot')
    const superseded = await db.rows<{ n: number }>(
      'select count(*)::int as n from public.page_contents where superseded_at is not null',
    )
    expect(superseded[0]?.n).toBe(2)
  })

  it('recusa p_up_to que não é uma linha da página', async () => {
    const [id] = await append(ana, PAGES.estudos, ['AQ=='])
    await expect(compact(ana, PAGES.estudos, 'AQ==', (id ?? 0) + 1000)).rejects.toMatchObject({
      ...INVALID,
      message: 'page_content_invalid',
    })
    const [other] = await append(ana, PAGES.matematica, ['AQ=='])
    await expect(compact(ana, PAGES.estudos, 'AQ==', other ?? 0)).rejects.toMatchObject(INVALID)
  })

  it('p_up_to = 0 só vale para página sem linhas (primeiro envio grande)', async () => {
    const big = b64(yUpdate('x'.repeat(10)))
    expect(await compact(ana, PAGES.estudos, big, 0)).toBe(true)
    const live = await read(ana, PAGES.estudos)
    expect(live).toEqual([expect.objectContaining({ kind: 'snapshot', covers_up_to: 0 })])
    // Já há linhas: 0 não cobre mais nada (no-op, existe snapshot vivo) ...
    expect(await compact(ana, PAGES.estudos, big, 0)).toBe(false)
    // ... e, sem snapshot vivo, é inválido.
    await append(ana, PAGES.matematica, ['AQ=='])
    await expect(compact(ana, PAGES.matematica, big, 0)).rejects.toMatchObject(INVALID)
    await expect(compact(ana, PAGES.matematica, big, -1)).rejects.toMatchObject(INVALID)
  })

  it('leitor não compacta', async () => {
    const [id] = await append(ana, PAGES.estudos, ['AQ=='])
    await expect(compact(diego, PAGES.estudos, 'AQ==', id ?? 0)).rejects.toMatchObject(FORBIDDEN)
  })

  it('leitura incremental vê o snapshot de outro aparelho e os updates novos', async () => {
    const [first] = await append(ana, PAGES.estudos, [b64(yUpdate('x'))])
    const start = await read(diego, PAGES.estudos)
    const lastSeen = Math.max(...start.map((r) => r.id))
    expect(lastSeen).toBe(first)

    const [second] = await append(ana, PAGES.estudos, [b64(yUpdate('y'))])
    const all = await read(ana, PAGES.estudos)
    const doc = new Y.Doc()
    for (const row of all) Y.applyUpdate(doc, bytesOf(row.data))
    await compact(ana, PAGES.estudos, b64(Y.encodeStateAsUpdate(doc)), second ?? 0)
    await append(ana, PAGES.estudos, [b64(yUpdate('z'))])

    const delta = await read(diego, PAGES.estudos, lastSeen)
    expect(delta.map((r) => r.kind)).toEqual(['snapshot', 'update'])
    expect(textOf([...start, ...delta])).toEqual(expect.stringContaining('z'))
  })
})

describe('retenção', () => {
  async function compactAll(userId: string) {
    const rows = await read(userId, PAGES.estudos)
    const doc = new Y.Doc()
    for (const row of rows) Y.applyUpdate(doc, bytesOf(row.data))
    const upTo = Math.max(...rows.map((r) => r.id))
    expect(await compact(userId, PAGES.estudos, b64(Y.encodeStateAsUpdate(doc)), upTo)).toBe(true)
  }

  it('a compactação não apaga nada na hora', async () => {
    await append(ana, PAGES.estudos, [b64(yUpdate('a'))])
    await compactAll(ana)
    const total = await db.rows<{ n: number }>(
      'select count(*)::int as n from public.page_contents',
    )
    expect(total[0]?.n).toBe(2)
  })

  it('apaga o que passou de 7 dias, menos os 3 snapshots substituídos mais recentes', async () => {
    // 5 rodadas: cada uma grava um update e compacta (o snapshot anterior vira substituído).
    for (const word of ['a', 'b', 'c', 'd', 'e']) {
      await append(ana, PAGES.estudos, [b64(yUpdate(word))])
      await compactAll(ana)
    }
    // Tudo que foi substituído passa a ter 8 dias, com a ordem preservada.
    await db.admin.query(
      `update public.page_contents set superseded_at = superseded_at - interval '8 days'
       where superseded_at is not null`,
    )
    const [pruned] = await db.rows<{ n: number }>('select public.prune_page_contents($1) as n', [
      PAGES.estudos,
    ])
    // Substituídos: 5 updates + 4 snapshots. Ficam os 3 snapshots mais recentes.
    expect(pruned?.n).toBe(6)
    const left = await db.rows<{ kind: string; live: boolean }>(
      `select kind, superseded_at is null as live from public.page_contents order by id`,
    )
    expect(left).toEqual([
      { kind: 'snapshot', live: false },
      { kind: 'snapshot', live: false },
      { kind: 'snapshot', live: false },
      { kind: 'snapshot', live: true },
    ])
    // O conteúdo vivo continua inteiro.
    expect(textOf(await read(ana, PAGES.estudos))).toHaveLength(5)
  })

  it('não apaga o que tem menos de 7 dias', async () => {
    await append(ana, PAGES.estudos, [b64(yUpdate('a'))])
    await compactAll(ana)
    const [pruned] = await db.rows<{ n: number }>('select public.prune_page_contents($1) as n', [
      PAGES.estudos,
    ])
    expect(pruned?.n).toBe(0)
  })

  it('teto de 64 MiB no histórico: o substituído mais antigo sai antes dos 7 dias', async () => {
    // 10 updates de 8 MiB substituídos (80 MiB), mais recentes primeiro na contagem.
    await db.admin.query(
      `insert into public.page_contents (page_id, kind, data, superseded_at)
       select $1, 'update', convert_to(repeat('a', 8388608), 'UTF8'), now() - n * interval '1 minute'
       from generate_series(1, 10) as n`,
      [PAGES.estudos],
    )
    const [pruned] = await db.rows<{ n: number }>('select public.prune_page_contents($1) as n', [
      PAGES.estudos,
    ])
    expect(pruned?.n).toBe(2)
    const [left] = await db.rows<{ bytes: number }>(
      'select sum(byte_size)::bigint::int as bytes from public.page_contents where page_id = $1',
      [PAGES.estudos],
    )
    expect(left?.bytes).toBe(8 * 8 * MIB)
  }, 30_000)

  it('authenticated não chama a limpeza direto', async () => {
    await expect(
      db.as(actor(ana), (q) => q.rows('select public.prune_page_contents($1)', [PAGES.estudos])),
    ).rejects.toMatchObject(FORBIDDEN)
  })
})

describe('"Editada há…" conta as edições do corpo', () => {
  const lastEdited = async () =>
    (
      await db.rows<{ at: Date; by: string }>(
        'select last_edited_at as at, last_edited_by as by from public.pages where id = $1',
        [PAGES.matematica],
      )
    )[0]

  it('atualiza no primeiro envio e no máximo uma vez a cada 60 s', async () => {
    await db.admin.query(
      `update public.pages set last_edited_at = now() - interval '2 minutes', last_edited_by = $2
       where id = $1`,
      [PAGES.matematica, ana],
    )
    const before = await lastEdited()
    await append(carla, PAGES.matematica, ['AQ=='])
    const after = await lastEdited()
    expect(after?.by).toBe(carla)
    expect(after?.at.getTime()).toBeGreaterThan(before?.at.getTime() ?? 0)

    await append(ana, PAGES.matematica, ['AQ=='])
    const again = await lastEdited()
    expect(again?.by).toBe(carla)
    expect(again?.at.getTime()).toBe(after?.at.getTime())
  })
})

describe('page_texts', () => {
  it('editor grava (upsert); leitor lê; não-membro não lê', async () => {
    await setText(ana, PAGES.estudos, 'primeira versão', [{ type: 'paragraph' }])
    await setText(carla, PAGES.estudos, 'segunda versão')
    const rows = await db.as(actor(diego), (q) =>
      q.rows<{ text: string; json: unknown }>('select text, json from public.page_texts'),
    )
    expect(rows).toEqual([{ text: 'segunda versão', json: null }])
    expect(await db.as(actor(bruno), (q) => q.rows('select * from public.page_texts'))).toEqual([])
    await expect(setText(diego, PAGES.estudos, 'x')).rejects.toMatchObject(FORBIDDEN)
    await expect(setText(bruno, PAGES.estudos, 'x')).rejects.toMatchObject(FORBIDDEN)
  })

  it('recusa texto acima de 1 MiB e JSON acima de 256 KiB', async () => {
    await expect(setText(ana, PAGES.estudos, 'a'.repeat(MIB + 1))).rejects.toMatchObject({
      ...INVALID,
      message: 'page_text_too_large',
    })
    await expect(
      setText(ana, PAGES.estudos, 'ok', { big: 'a'.repeat(256 * 1024) }),
    ).rejects.toMatchObject(INVALID)
    await setText(ana, PAGES.estudos, 'a'.repeat(MIB))
  })
})
