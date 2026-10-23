// Gera os prints da skill verificar-ui em .screenshots/ (pasta ignorada pelo git).
// Uso, com o app rodando (pnpm dev):
//   pnpm screenshots               → telas de autenticação (deslogado) + app com a sidebar (logado)
//   pnpm screenshots /p/abc ...    → só estas rotas, já logado quando houver E2E_* em .env.local
// As telas que dependem de e-mail (/codigo, etapa do código da recuperação) são alcançadas
// interceptando a API de autenticação com respostas FALSAS: nada é enviado ao Supabase real.
import { mkdirSync } from 'node:fs'
import {
  chromium,
  devices,
  webkit,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test'

try {
  process.loadEnvFile('.env.local')
} catch {
  // sem .env.local: pula só os prints que precisam de login
}

const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'
const routes = process.argv.slice(2)
const outDir = '.screenshots'
const date = new Date().toISOString().slice(0, 10)
const email = process.env.E2E_EMAIL ?? ''
const password = process.env.E2E_PASSWORD ?? ''
const canSignIn = email !== '' && password !== ''

interface Target {
  name: string
  browser: () => Promise<Browser>
  context: BrowserContextOptions
}

const targets: Target[] = [
  {
    name: 'desktop',
    browser: () => chromium.launch(),
    context: { viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'mobile',
    browser: () => webkit.launch(),
    context: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } },
  },
  {
    name: 'tablet',
    browser: () => webkit.launch(),
    context: { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 } },
  },
]

function slug(route: string): string {
  const cleaned = route.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')
  return cleaned === '' ? 'home' : cleaned
}

async function shoot(page: Page, name: string, target: Target): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  const file = `${outDir}/${date}-${name}-${target.name}.png`
  await page.screenshot({ path: file })
  console.log(file)
}

async function signInThroughUi(page: Page): Promise<void> {
  await page.goto(new URL('/entrar', baseURL).toString())
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  // Mesma espera de e2e/support/ui.ts: o app logado assentado em "/" antes do próximo goto.
  await page.waitForURL((url) => url.pathname === '/')
  await page
    .getByRole('button', { name: 'Abrir menu' })
    .or(page.getByRole('navigation', { name: 'Navegação principal' }))
    .waitFor()
}

/** Abre a gaveta no mobile/tablet estreito e tira o print dela. */
async function shootDrawer(page: Page, name: string, target: Target): Promise<void> {
  const menu = page.getByRole('button', { name: 'Abrir menu' })
  await menu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  if ((await menu.count()) === 0) return
  await menu.tap()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(300) // fim da animação de entrada
  await shoot(page, `${name}-drawer`, target)
}

// Respostas falsas da API de autenticação (e-mail fictício; nenhum dado real).
const FAKE_USER = {
  id: '00000000-0000-4000-8000-000000000000',
  aud: 'authenticated',
  email: 'ana@exemplo.test',
  identities: [],
}

async function fakeAuthApi(page: Page): Promise<void> {
  await page.route(/\/auth\/v1\/signup/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_USER),
    }),
  )
  await page.route(/\/auth\/v1\/recover/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

async function authScreens(browser: Browser, target: Target): Promise<void> {
  const context = await browser.newContext({
    ...target.context,
    colorScheme: 'dark',
    locale: 'pt-BR',
  })
  const page = await context.newPage()
  await fakeAuthApi(page)
  const open = (path: string) => page.goto(new URL(path, baseURL).toString())

  // /entrar: vazio e com o erro genérico (e-mail fictício).
  await open('/entrar')
  await shoot(page, 'entrar', target)
  await page.getByLabel('E-mail').fill('ninguem@exemplo.test')
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await shoot(page, 'entrar-erro', target)

  // /criar-conta: vazio, com erros de validação e, preenchido, a caminho do código.
  await open('/criar-conta')
  await shoot(page, 'criar-conta', target)
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await shoot(page, 'criar-conta-erros', target)
  await page.getByLabel('Nome').fill('Ana Teste')
  await page.getByLabel('E-mail').fill('ana@exemplo.test')
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click()

  // /codigo (cadastro com e-mail simulado).
  await page.getByRole('heading', { level: 1, name: 'Confirme seu e-mail' }).waitFor()
  await page.getByLabel('Código de 6 dígitos').fill('123')
  await shoot(page, 'codigo', target)

  // /codigo reaberto sem estado (nova entrada no histórico): pede o e-mail antes do código.
  await open('/entrar')
  await open('/codigo')
  await page.getByLabel('E-mail').waitFor()
  await shoot(page, 'codigo-sem-estado', target)

  // /recuperar-senha: etapa do e-mail e etapa do código.
  await open('/recuperar-senha')
  await shoot(page, 'recuperar-senha', target)
  await page.getByLabel('E-mail').fill('ana@exemplo.test')
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await page.getByLabel('Código de 6 dígitos').waitFor()
  await shoot(page, 'recuperar-senha-codigo', target)

  await context.close()
}

async function appScreens(browser: Browser, target: Target, extraRoutes: string[]): Promise<void> {
  if (!canSignIn) {
    console.log(`(${target.name}) sem E2E_* em .env.local: pulei os prints logados`)
    return
  }
  const context = await browser.newContext({
    ...target.context,
    colorScheme: 'dark',
    locale: 'pt-BR',
  })
  const page = await context.newPage()
  await signInThroughUi(page)

  for (const route of extraRoutes.length > 0 ? extraRoutes : ['/']) {
    await page.goto(new URL(route, baseURL).toString())
    await page.getByRole('main').waitFor()
    await shoot(page, slug(route), target)
    await shootDrawer(page, slug(route), target)
    if ((await page.getByRole('button', { name: 'Abrir menu' }).count()) > 0) {
      await page.keyboard.press('Escape')
    }
  }
  await context.close()
}

mkdirSync(outDir, { recursive: true })

for (const target of targets) {
  const browser = await target.browser()
  if (routes.length === 0) await authScreens(browser, target)
  await appScreens(browser, target, routes)
  await browser.close()
}
