// Credenciais dos usuários de teste e chaves do Supabase vêm de .env.local (ignorado pelo git).
// Nada aqui é registrado em log nem entra em relatórios. O arquivo é carregado AQUI, antes de ler
// o ambiente, porque os imports rodam antes do corpo do playwright.config.ts. Sem o arquivo, os
// testes que dependem dele são pulados.
try {
  process.loadEnvFile('.env.local')
} catch {
  // sem .env.local
}

export interface TestUser {
  email: string
  password: string
}

export const E2E_USER_1: TestUser = {
  email: process.env.E2E_EMAIL ?? '',
  password: process.env.E2E_PASSWORD ?? '',
}

export const E2E_USER_2: TestUser = {
  email: process.env.E2E_EMAIL_2 ?? '',
  password: process.env.E2E_PASSWORD_2 ?? '',
}

function isComplete(user: TestUser): boolean {
  return user.email !== '' && user.password !== ''
}

/** Há um usuário de teste para os e2e que entram no app. */
export const hasE2ECredentials = isComplete(E2E_USER_1)

/** Há os dois usuários de teste (necessário para o smoke de RLS). */
export const hasBothE2EUsers = isComplete(E2E_USER_1) && isComplete(E2E_USER_2)

export const SKIP_NO_CREDENTIALS =
  'Defina E2E_EMAIL e E2E_PASSWORD (usuário de teste) em .env.local para rodar este teste.'

/** Arquivo onde o projeto de setup guarda a sessão de cada projeto (ignorado pelo git). */
export function authFile(projectName: string): string {
  return `e2e/.auth/${projectName}.json`
}
