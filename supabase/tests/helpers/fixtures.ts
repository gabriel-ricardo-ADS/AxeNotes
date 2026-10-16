import type { TestDb } from './db.ts'

/** Usuários fictícios. Cada um ganha um workspace pessoal pelo trigger de cadastro. */
export const USERS = {
  ana: '00000000-0000-4000-8000-0000000000a1', // dona do workspace A
  bruno: '00000000-0000-4000-8000-0000000000b1', // dono do workspace B, de fora do A
  carla: '00000000-0000-4000-8000-0000000000c1', // editora no workspace A
  diego: '00000000-0000-4000-8000-0000000000d1', // leitor no workspace A
} as const

export type UserName = keyof typeof USERS

export const PAGES = {
  estudos: '10000000-0000-4000-8000-000000000001', // A, raiz
  matematica: '10000000-0000-4000-8000-000000000002', // A, filha de estudos
  algebra: '10000000-0000-4000-8000-000000000003', // A, filha de matematica
  leituras: '10000000-0000-4000-8000-000000000004', // A, raiz
  segredo: '10000000-0000-4000-8000-000000000005', // B, raiz
} as const

export interface Fixtures {
  /** Workspace de Ana (A), compartilhado com Carla (editora) e Diego (leitor). */
  workspaceA: string
  /** Workspace de Bruno (B). */
  workspaceB: string
}

export async function personalWorkspaceOf(db: TestDb, userId: string): Promise<string> {
  const rows = await db.rows<{ workspace_id: string }>(
    "select workspace_id from public.workspace_members where user_id = $1 and role = 'owner'",
    [userId],
  )
  const row = rows[0]
  if (!row) throw new Error(`workspace pessoal não encontrado para ${userId}`)
  return row.workspace_id
}

/** Monta o cenário: 4 usuários, Carla/Diego como membros do workspace de Ana, e algumas páginas. */
export async function seedFixtures(db: TestDb): Promise<Fixtures> {
  for (const [name, id] of Object.entries(USERS)) {
    await db.admin.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name}@example.test`,
    ])
  }

  const workspaceA = await personalWorkspaceOf(db, USERS.ana)
  const workspaceB = await personalWorkspaceOf(db, USERS.bruno)

  await db.admin.query(
    `insert into public.workspace_members (workspace_id, user_id, role)
     values ($1, $2, 'editor'), ($1, $3, 'viewer')`,
    [workspaceA, USERS.carla, USERS.diego],
  )

  const pages: [string, string, string | null, string, string][] = [
    [PAGES.estudos, workspaceA, null, 'Estudos', 'a0'],
    [PAGES.matematica, workspaceA, PAGES.estudos, 'Matemática', 'a0'],
    [PAGES.algebra, workspaceA, PAGES.matematica, 'Álgebra linear', 'a0'],
    [PAGES.leituras, workspaceA, null, 'Leituras', 'a1'],
    [PAGES.segredo, workspaceB, null, 'Diário do Bruno', 'a0'],
  ]
  for (const [id, workspaceId, parentId, title, sortKey] of pages) {
    await db.admin.query(
      `insert into public.pages (id, workspace_id, parent_id, title, sort_key, created_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, workspaceId, parentId, title, sortKey, USERS.ana],
    )
  }

  return { workspaceA, workspaceB }
}
