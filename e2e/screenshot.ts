// Gera os prints da skill verificar-ui em .screenshots/ (pasta ignorada pelo git).
// Uso: com o app rodando (pnpm dev), `pnpm screenshots [rota ...]` (padrão: /).
import { mkdirSync } from 'node:fs'
import {
  chromium,
  devices,
  webkit,
  type Browser,
  type BrowserContextOptions,
} from '@playwright/test'

const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'
const routes = process.argv.slice(2)
const outDir = '.screenshots'
const date = new Date().toISOString().slice(0, 10)

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

mkdirSync(outDir, { recursive: true })

for (const target of targets) {
  const browser = await target.browser()
  const context = await browser.newContext({
    ...target.context,
    colorScheme: 'dark',
    locale: 'pt-BR',
  })

  for (const route of routes.length > 0 ? routes : ['/']) {
    const page = await context.newPage()
    await page.goto(new URL(route, baseURL).toString())
    await page.evaluate(() => document.fonts.ready)

    const base = `${outDir}/${date}-${slug(route)}-${target.name}`
    await page.screenshot({ path: `${base}.png` })
    console.log(`${base}.png`)

    // Gaveta aberta (só existe abaixo de 768 px).
    const menu = page.getByRole('button', { name: 'Abrir menu' })
    if ((await menu.count()) > 0) {
      await menu.tap()
      await page.getByRole('dialog').waitFor()
      await page.waitForTimeout(300) // fim da animação de entrada
      await page.screenshot({ path: `${base}-drawer.png` })
      console.log(`${base}-drawer.png`)
    }
    await page.close()
  }

  await browser.close()
}
