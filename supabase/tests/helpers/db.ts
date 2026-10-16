import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'

const SUPABASE_DIR = join(import.meta.dirname, '..', '..')

export type Row = Record<string, unknown>

/** Quem executa a consulta: um usuário logado, o papel `anon` ou o `service_role`. */
export type Actor = { userId: string } | 'anon' | 'service'

/** Consultas dentro de uma transação já posicionada no papel do ator. */
export interface Sql {
  /** Executa e devolve as linhas. */
  rows: <T = Row>(text: string, params?: unknown[]) => Promise<T[]>
  /** Executa e devolve quantas linhas foram afetadas (útil para ver que a RLS filtrou). */
  run: (text: string, params?: unknown[]) => Promise<number>
}

function wrap(tx: Transaction): Sql {
  return {
    rows: async <T = Row>(text: string, params?: unknown[]) =>
      (await tx.query<T>(text, params)).rows,
    run: async (text, params) => (await tx.query(text, params)).affectedRows ?? 0,
  }
}

export function readSupabaseFile(...parts: string[]): string {
  return readFileSync(join(SUPABASE_DIR, ...parts), 'utf8')
}

export function migrationFiles(): string[] {
  return readdirSync(join(SUPABASE_DIR, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()
}

export class TestDb {
  constructor(
    /** Superusuário: ignora a RLS. Use só para montar cenários e conferir o estado. */
    readonly admin: PGlite,
  ) {}

  /** Roda `fn` numa transação com o papel e as claims do ator; faz commit se não houver erro. */
  async as<T>(actor: Actor, fn: (sql: Sql) => Promise<T>): Promise<T> {
    return this.admin.transaction(async (tx) => {
      if (actor === 'anon') {
        await tx.exec('set local role anon')
      } else if (actor === 'service') {
        await tx.exec('set local role service_role')
      } else {
        await tx.exec('set local role authenticated')
        const claims = JSON.stringify({ sub: actor.userId, role: 'authenticated' })
        await tx.query("select set_config('request.jwt.claims', $1, true)", [claims])
      }
      return fn(wrap(tx))
    })
  }

  /** Atalho para um superusuário (sem RLS). */
  async rows<T = Row>(text: string, params?: unknown[]): Promise<T[]> {
    return (await this.admin.query<T>(text, params)).rows
  }

  async close(): Promise<void> {
    await this.admin.close()
  }
}

/** Cria um Postgres em memória com a plataforma simulada e todas as migrações aplicadas. */
export async function createTestDb(): Promise<TestDb> {
  const admin = new PGlite({ extensions: { unaccent, pg_trgm, pgcrypto } })
  await admin.exec(readSupabaseFile('tests', 'helpers', 'bootstrap.sql'))
  for (const file of migrationFiles()) {
    await admin.exec(readSupabaseFile('migrations', file))
  }
  return new TestDb(admin)
}
