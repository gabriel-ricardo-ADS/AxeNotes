import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'
import { act } from '@testing-library/react'

// Cliente do Supabase falso para os testes: `vi.mock('@/lib/supabase', async () => ({ supabase:
// (await import('@/test/fake-supabase')).fakeSupabase }))`. Dados fictícios.

type Listener = (event: AuthChangeEvent, session: Session | null) => void

const listeners = new Set<Listener>()

/** Entrega um evento de autenticação aos ouvintes, como o supabase-js faria. */
export function emitAuthEvent(event: AuthChangeEvent, session: Session | null) {
  act(() => {
    for (const listener of [...listeners]) listener(event, session)
  })
}

const USER_ID = 'user-1'

export function fakeSession(userId = USER_ID): Session {
  return {
    access_token: 'token-ficticio',
    refresh_token: 'refresh-ficticio',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, email: 'ana@exemplo.test' },
  } as unknown as Session
}

interface Result {
  data: object
  error: AuthError | null
}

const ok: Result = { data: {}, error: null }
const resolvesOk = () => vi.fn<(arg?: unknown) => Promise<Result>>(() => Promise.resolve(ok))

export const fakeAuth = {
  onAuthStateChange: vi.fn((listener: Listener) => {
    listeners.add(listener)
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(listener)
          },
        },
      },
    }
  }),
  signInWithPassword: resolvesOk(),
  signUp: resolvesOk(),
  verifyOtp: resolvesOk(),
  resend: resolvesOk(),
  resetPasswordForEmail: resolvesOk(),
  updateUser: resolvesOk(),
  signOut: vi.fn<(arg?: { scope?: string }) => Promise<{ error: null }>>((arg) => {
    // `others` encerra só as sessões dos outros aparelhos: esta continua logada.
    if (arg?.scope !== 'others') emitAuthEvent('SIGNED_OUT', null)
    return Promise.resolve({ error: null })
  }),
}

// Banco em memória ---------------------------------------------------------------------------
// Só o que o app usa: select/eq/lt/is/order/range/limit, insert, upsert, update, delete, maybeSingle e o
// embed `workspaces(...)`. Sem RLS; os testes escolhem o papel com `seedWorkspace`.

type Row = Record<string, unknown>
type Op = 'select' | 'insert' | 'upsert' | 'update' | 'delete'
type Table =
  'pages' | 'workspaces' | 'workspace_members' | 'profiles' | 'user_favorites' | 'user_recents'

const EMPTY_TABLES = (): Record<Table, Row[]> => ({
  pages: [],
  workspaces: [],
  workspace_members: [],
  profiles: [],
  user_favorites: [],
  user_recents: [],
})

/** Tabelas por usuário: `user_id` tem default `auth.uid()` no banco real. */
const PER_USER: readonly Table[] = ['user_favorites', 'user_recents']

interface QueryResult {
  data: unknown
  error: { message: string; code?: string } | null
}

/** Erro devolvido por um RPC simulado (como o PostgrestError do supabase-js). */
export interface FakeRpcError {
  message: string
  code?: string
}

export const fakeDb: {
  tables: Record<Table, Row[]>
  failures: { op: Op; table: Table }[]
  /** Operações que falham SEMPRE, até `clearFailures()`: não dependem de quantas vezes o app tenta. */
  persistentFailures: { op: Op; table: Table }[]
  /** Registro das escritas, para os testes conferirem o que foi enviado ao banco. */
  writes: { op: Op; table: Table; payload: Row | null }[]
  /** Uma entrada por consulta (select) executada, para contar recargas. */
  selects: Table[]
  /** Operações seguradas por `holdNext` até alguém chamar `release()`. */
  gates: { op: Op; table: Table; open: Promise<void> }[]
  /** Chamadas de RPC, na ordem (nome e argumentos). */
  rpcCalls: { name: string; args: Record<string, unknown> }[]
  /** RPCs que falham UMA vez (`failNextRpc`). */
  rpcFailures: { name: string; error: FakeRpcError }[]
  /** RPCs seguradas por `holdNextRpc` até `release()`. */
  rpcGates: { name: string; open: Promise<void> }[]
  /** Quantas vezes a lista da lixeira foi carregada (consulta `not trashed_at is null`; lotes seguintes não somam). */
  trashLoads: number
  /** Quantas consultas de UMA linha (`maybeSingle`) foram feitas, como a de `fetchPage`. */
  singleLoads: number
  /** Ordem em que as escritas chegaram ao "banco": `update:pages`, `rpc:trash_page`… */
  order: string[]
} = {
  tables: EMPTY_TABLES(),
  failures: [],
  persistentFailures: [],
  writes: [],
  selects: [],
  gates: [],
  rpcCalls: [],
  rpcFailures: [],
  rpcGates: [],
  trashLoads: 0,
  singleLoads: 0,
  order: [],
}

/** Faz a PRÓXIMA operação `op` na tabela falhar (uma vez). */
export function failNext(op: Op, table: Table) {
  fakeDb.failures.push({ op, table })
}

/**
 * Faz TODAS as operações `op` na tabela falharem até `clearFailures()`. Use quando o teste não pode
 * depender de quantas vezes o TanStack Query tenta de novo (ex.: um componente que monta depois do erro
 * refaz a consulta).
 */
export function failAlways(op: Op, table: Table) {
  fakeDb.persistentFailures.push({ op, table })
}

/** Para de falhar as operações marcadas por `failAlways`. */
export function clearFailures() {
  fakeDb.persistentFailures = []
}

/**
 * Segura a PRÓXIMA operação `op` na tabela até `release()`: serve para provar ordem de gravação,
 * cliques rápidos e respostas que chegam fora de ordem.
 */
export function holdNext(op: Op, table: Table): { release: () => void } {
  let release: () => void = () => undefined
  const open = new Promise<void>((resolve) => {
    release = resolve
  })
  fakeDb.gates.push({ op, table, open })
  return { release }
}

/** Faz a PRÓXIMA chamada do RPC `name` devolver este erro (uma vez). */
export function failNextRpc(name: string, error: FakeRpcError = { message: 'falha simulada' }) {
  fakeDb.rpcFailures.push({ name, error })
}

/** Segura a PRÓXIMA chamada do RPC `name` até `release()`. */
export function holdNextRpc(name: string): { release: () => void } {
  let release: () => void = () => undefined
  const open = new Promise<void>((resolve) => {
    release = resolve
  })
  fakeDb.rpcGates.push({ name, open })
  return { release }
}

export const WORKSPACE_ID = '00000000-0000-4000-8000-0000000000f1'

/** Uuid fictício estável para os testes: fakeId(1), fakeId(2)… */
export function fakeId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

export interface SeedPage {
  id: string
  parentId?: string | null
  title?: string
  sortKey: string
  icon?: { type: 'emoji'; value: string } | null
  lastEditedAt?: string
  /** Já nasce na lixeira com este carimbo (ISO). */
  trashedAt?: string | null
}

/** Cria o workspace pessoal do usuário de teste com o papel e a página inicial indicados. */
export function seedWorkspace(options: { role?: string; homePageId?: string | null } = {}) {
  fakeDb.tables.workspaces = [
    {
      id: WORKSPACE_ID,
      name: 'Workspace pessoal',
      home_page_id: options.homePageId ?? null,
    },
  ]
  fakeDb.tables.workspace_members = [
    {
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      role: options.role ?? 'owner',
      created_at: '2026-01-01T00:00:00Z',
    },
  ]
}

export function seedPages(pages: SeedPage[]) {
  fakeDb.tables.pages = pages.map((page) => ({
    id: page.id,
    workspace_id: WORKSPACE_ID,
    parent_id: page.parentId ?? null,
    title: page.title ?? '',
    icon: page.icon ?? null,
    sort_key: page.sortKey,
    last_edited_at: page.lastEditedAt ?? '2026-10-10T12:00:00Z',
    trashed_at: page.trashedAt ?? null,
  }))
}

export function seedFavorites(entries: { pageId: string; sortKey: string }[]) {
  fakeDb.tables.user_favorites = entries.map((entry) => ({
    user_id: USER_ID,
    page_id: entry.pageId,
    sort_key: entry.sortKey,
  }))
}

export function seedRecents(entries: { pageId: string; visitedAt: string }[]) {
  fakeDb.tables.user_recents = entries.map((entry) => ({
    user_id: USER_ID,
    page_id: entry.pageId,
    visited_at: entry.visitedAt,
  }))
}

/** Marca a página (e só ela) como estando na lixeira, sem passar pelo RPC. */
export function trashInDb(id: string) {
  const row = dbPage(id)
  if (row) row.trashed_at = new Date().toISOString()
}

/** Linha atual de uma página no "banco" (para conferir o que foi gravado). */
export function dbPage(id: string): Row | undefined {
  return fakeDb.tables.pages.find((row) => row.id === id)
}

class FakeQuery implements PromiseLike<QueryResult> {
  private op: Op = 'select'
  private payload: Row | null = null
  private conflict: { columns: string[]; ignore: boolean } | null = null
  private filters: ((row: Row) => boolean)[] = []
  private sorting: { column: string; ascending: boolean } | null = null
  private window: [number, number] | null = null
  private max: number | null = null
  private single = false
  private returning = false
  private continuation = false
  private onlyTrashed = false

  constructor(
    private readonly table: Table,
    private columns = '*',
  ) {}

  select(columns?: string) {
    if (this.op === 'select') this.columns = columns ?? '*'
    else this.returning = true
    return this
  }
  insert(row: Row) {
    this.op = 'insert'
    this.payload = row
    return this
  }
  upsert(row: Row, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'
    this.payload = row
    this.conflict = {
      columns: (options?.onConflict ?? 'id').split(',').map((column) => column.trim()),
      ignore: options?.ignoreDuplicates === true,
    }
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.payload = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  lt(column: string, value: unknown) {
    this.filters.push((row) => Date.parse(String(row[column])) < Date.parse(String(value)))
    return this
  }
  gt(column: string, value: unknown) {
    this.continuation = true
    this.filters.push((row) => String(row[column]) > String(value))
    return this
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value)
    return this
  }
  /** Só o operador `is` (o único usado): `not('trashed_at', 'is', null)`. */
  not(column: string, _operator: 'is', value: unknown) {
    if (column === 'trashed_at' && value === null) this.onlyTrashed = true
    this.filters.push((row) => (row[column] ?? null) !== value)
    return this
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.sorting = { column, ascending: options?.ascending ?? true }
    return this
  }
  range(from: number, to: number) {
    this.window = [from, to]
    return this
  }
  limit(count: number) {
    this.max = count
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }

  then<R1 = QueryResult, R2 = never>(
    onFulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(async () => {
        const gate = fakeDb.gates.findIndex((g) => g.op === this.op && g.table === this.table)
        if (gate >= 0) {
          const [held] = fakeDb.gates.splice(gate, 1)
          await held?.open
        }
        return this.run()
      })
      .then(onFulfilled, onRejected)
  }

  private run(): QueryResult {
    const always = fakeDb.persistentFailures.some((f) => f.op === this.op && f.table === this.table)
    if (always) return { data: null, error: { message: 'falha simulada' } }
    const failure = fakeDb.failures.findIndex((f) => f.op === this.op && f.table === this.table)
    if (failure >= 0) {
      fakeDb.failures.splice(failure, 1)
      return { data: null, error: { message: 'falha simulada' } }
    }

    const rows = fakeDb.tables[this.table]
    const matches = rows.filter((row) => this.filters.every((filter) => filter(row)))

    if (this.op === 'upsert' && this.payload && this.conflict) {
      const payload = this.payload
      const full: Row = PER_USER.includes(this.table) ? { user_id: USER_ID, ...payload } : payload
      const existing = rows.find((row) => this.conflict?.columns.every((c) => row[c] === full[c]))
      if (existing) {
        if (!this.conflict.ignore) Object.assign(existing, payload)
      } else {
        rows.push(full)
      }
      fakeDb.writes.push({ op: 'upsert', table: this.table, payload })
      return { data: null, error: null }
    }
    if (this.op === 'insert') {
      rows.push({ last_edited_at: new Date().toISOString(), trashed_at: null, ...this.payload })
      fakeDb.writes.push({ op: 'insert', table: this.table, payload: this.payload })
      return { data: null, error: null }
    }
    if (this.op === 'update') {
      for (const row of matches) Object.assign(row, this.payload)
      fakeDb.order.push(`update:${this.table}`)
      fakeDb.writes.push({ op: 'update', table: this.table, payload: this.payload })
      return { data: this.returning ? matches.map((row) => ({ ...row })) : null, error: null }
    }
    if (this.op === 'delete') {
      // Como a política do banco: só apaga página que já está na lixeira e só para editor/owner.
      const doomed =
        this.table === 'pages'
          ? matches.filter((row) => row.trashed_at != null && memberCanEdit())
          : matches
      fakeDb.tables[this.table] = fakeDb.tables[this.table].filter((row) => !doomed.includes(row))
      if (this.table === 'pages') cascadeDelete(doomed)
      fakeDb.writes.push({ op: 'delete', table: this.table, payload: null })
      return { data: this.returning ? doomed.map((row) => ({ ...row })) : null, error: null }
    }

    // Um "carregamento" conta uma vez: os lotes seguintes de uma lista (cursor `gt`) não somam.
    if (!this.continuation) {
      if (this.onlyTrashed) fakeDb.trashLoads += 1
      else fakeDb.selects.push(this.table)
      if (this.single) fakeDb.singleLoads += 1
    }
    let result = matches.map((row) => ({ ...row }))
    if (this.sorting) {
      const { column, ascending } = this.sorting
      result.sort((a, b) => {
        const x = String(a[column])
        const y = String(b[column])
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1)
      })
    }
    if (this.table === 'workspace_members' && this.columns.includes('workspaces(')) {
      result = result.map((row) => ({
        ...row,
        workspaces: fakeDb.tables.workspaces.find((ws) => ws.id === row.workspace_id) ?? null,
      }))
    }
    if (this.window) result = result.slice(this.window[0], this.window[1] + 1)
    if (this.max !== null) result = result.slice(0, this.max)
    return { data: this.single ? (result[0] ?? null) : result, error: null }
  }
}

/** O usuário de teste é owner/editor do workspace? (O papel viewer não escreve.) */
function memberCanEdit(): boolean {
  const member = fakeDb.tables.workspace_members.find((row) => row.user_id === USER_ID)
  return member?.role !== 'viewer'
}

/** Como o FK em cascata do banco: apagar uma página leva descendentes, favoritos, recentes e a página inicial. */
function cascadeDelete(removed: Row[]) {
  const doomed = new Set(removed.map((row) => String(row.id)))
  for (let grew = true; grew;) {
    grew = false
    for (const row of fakeDb.tables.pages) {
      const id = String(row.id)
      if (typeof row.parent_id === 'string' && doomed.has(row.parent_id) && !doomed.has(id)) {
        doomed.add(id)
        grew = true
      }
    }
  }
  fakeDb.tables.pages = fakeDb.tables.pages.filter((row) => !doomed.has(String(row.id)))
  fakeDb.tables.user_favorites = fakeDb.tables.user_favorites.filter(
    (row) => !doomed.has(String(row.page_id)),
  )
  fakeDb.tables.user_recents = fakeDb.tables.user_recents.filter(
    (row) => !doomed.has(String(row.page_id)),
  )
  for (const workspace of fakeDb.tables.workspaces) {
    if (typeof workspace.home_page_id === 'string' && doomed.has(workspace.home_page_id)) {
      workspace.home_page_id = null
    }
  }
}

/** Carimbos sempre crescentes: duas lixeiras no mesmo milissegundo não podem empatar. */
let lastStamp = 0
function nextStamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return new Date(lastStamp).toISOString()
}

const FORBIDDEN: FakeRpcError = { message: 'forbidden', code: '42501' }

function trashPage(pageId: string): QueryResult {
  const page = dbPage(pageId)
  if (!page || !memberCanEdit()) return { data: null, error: FORBIDDEN }
  if (page.trashed_at != null) return { data: null, error: null }
  const stamp = nextStamp()
  const tree = new Set([pageId])
  // Só desce por filhas vivas: quem já estava na lixeira mantém o carimbo antigo.
  for (let grew = true; grew;) {
    grew = false
    for (const row of fakeDb.tables.pages) {
      const id = String(row.id)
      if (
        row.trashed_at == null &&
        typeof row.parent_id === 'string' &&
        tree.has(row.parent_id) &&
        !tree.has(id)
      ) {
        tree.add(id)
        grew = true
      }
    }
  }
  for (const row of fakeDb.tables.pages) if (tree.has(String(row.id))) row.trashed_at = stamp
  return { data: null, error: null }
}

function restorePage(pageId: string): QueryResult {
  const page = dbPage(pageId)
  if (!page || !memberCanEdit()) return { data: null, error: FORBIDDEN }
  const stamp = page.trashed_at
  if (stamp == null) return { data: null, error: null }
  const parent = typeof page.parent_id === 'string' ? dbPage(page.parent_id) : undefined
  if (parent?.trashed_at != null) {
    return { data: null, error: { message: 'parent_trashed', code: '23514' } }
  }
  const tree = new Set([pageId])
  for (let grew = true; grew;) {
    grew = false
    for (const row of fakeDb.tables.pages) {
      const id = String(row.id)
      if (
        row.trashed_at === stamp &&
        typeof row.parent_id === 'string' &&
        tree.has(row.parent_id) &&
        !tree.has(id)
      ) {
        tree.add(id)
        grew = true
      }
    }
  }
  for (const row of fakeDb.tables.pages) if (tree.has(String(row.id))) row.trashed_at = null
  return { data: null, error: null }
}

/** Como `unaccent(lower(x))` do banco, para os acentos latinos (NFD sem as marcas). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * `search_pages` (supabase/migrations/…0006): por título, sem acento nem caixa, trecho LITERAL (`%`, `_` e `\`
 * valem como texto), só o workspace do usuário e fora da lixeira; termo vazio não acha nada; começa-com primeiro,
 * depois `last_edited_at` desc e id; limite de 1 a 50 (padrão 20).
 */
function searchPages(args: Record<string, unknown>): QueryResult {
  const isMember = fakeDb.tables.workspace_members.some(
    (row) => row.user_id === USER_ID && row.workspace_id === args.p_workspace_id,
  )
  // `btrim` do banco tira só espaços.
  const term = fold(typeof args.p_query === 'string' ? args.p_query : '').replace(/^ +| +$/g, '')
  const limit = Math.min(Math.max(typeof args.p_limit === 'number' ? args.p_limit : 20, 1), 50)
  const starts = (row: Row) => fold(String(row.title)).startsWith(term)

  const found =
    isMember && term !== ''
      ? fakeDb.tables.pages.filter(
          (row) =>
            row.workspace_id === args.p_workspace_id &&
            row.trashed_at == null &&
            fold(String(row.title)).includes(term),
        )
      : []
  found.sort((a, b) => {
    if (starts(a) !== starts(b)) return starts(a) ? -1 : 1
    const edited = String(b.last_edited_at).localeCompare(String(a.last_edited_at))
    return edited !== 0 ? edited : String(a.id) < String(b.id) ? -1 : 1
  })
  const data = found.slice(0, limit).map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    parent_id: row.parent_id,
    title: row.title,
    icon: row.icon,
    last_edited_at: row.last_edited_at,
  }))
  return { data, error: null }
}

/** `trash_page`, `restore_page` e `search_pages`, com a mesma semântica das funções do banco (…0005 e …0006). */
async function rpc(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<QueryResult> {
  fakeDb.rpcCalls.push({ name, args })
  const gate = fakeDb.rpcGates.findIndex((g) => g.name === name)
  if (gate >= 0) {
    const [held] = fakeDb.rpcGates.splice(gate, 1)
    await held?.open
  }
  // Como o supabase-js: pedido cancelado volta como erro, não como exceção.
  if (signal?.aborted) return { data: null, error: { message: 'AbortError' } }
  const failure = fakeDb.rpcFailures.findIndex((f) => f.name === name)
  if (failure >= 0) {
    const [failed] = fakeDb.rpcFailures.splice(failure, 1)
    if (failed) return { data: null, error: failed.error }
  }
  fakeDb.order.push(`rpc:${name}`)
  if (name === 'trash_page') return trashPage(String(args.p_page_id))
  if (name === 'restore_page') return restorePage(String(args.p_page_id))
  if (name === 'search_pages') return searchPages(args)
  return { data: null, error: { message: 'rpc?' } }
}

/** O retorno do `rpc` é "esperável" e aceita `.abortSignal(signal)`, como o do supabase-js. */
function startRpc(name: string, args: Record<string, unknown>) {
  let signal: AbortSignal | undefined
  const builder = {
    abortSignal(next: AbortSignal) {
      signal = next
      return builder
    },
    then<R1 = QueryResult, R2 = never>(
      onFulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
      return Promise.resolve()
        .then(() => rpc(name, args, signal))
        .then(onFulfilled, onRejected)
    },
  }
  return builder
}

export const fakeSupabase = {
  auth: fakeAuth,
  from: vi.fn((table: Table) => new FakeQuery(table)),
  rpc: vi.fn(startRpc),
}

/** Zera chamadas, ouvintes e dados entre testes. */
export function resetFakeSupabase() {
  listeners.clear()
  for (const fn of Object.values(fakeAuth)) fn.mockReset()
  fakeSupabase.from.mockReset()
  fakeSupabase.rpc.mockReset()
  fakeDb.tables = EMPTY_TABLES()
  fakeDb.failures = []
  fakeDb.persistentFailures = []
  fakeDb.gates = []
  fakeDb.writes = []
  fakeDb.selects = []
  fakeDb.rpcCalls = []
  fakeDb.rpcFailures = []
  fakeDb.rpcGates = []
  fakeDb.trashLoads = 0
  fakeDb.singleLoads = 0
  fakeDb.order = []
  // Todo teste começa com o workspace pessoal e a página inicial já criados.
  seedWorkspace({ homePageId: fakeId(1000) })
  seedPages([{ id: fakeId(1000), title: 'Página inicial', sortKey: 'a0' }])
}

/** Faz a consulta de `profiles` devolver este nome (ou nenhum perfil, com null). */
export function mockProfile(displayName: string | null) {
  fakeDb.tables.profiles = displayName === null ? [] : [{ id: USER_ID, display_name: displayName }]
}
