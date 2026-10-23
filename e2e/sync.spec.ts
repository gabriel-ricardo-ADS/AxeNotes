import { expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import {
  apiSession,
  contentSyncAvailable,
  createTestPage,
  savedBodyText,
  sortKeySequence,
} from './support/pages-api'
import { test } from './support/run-fixture'
import { openNavigation } from './support/ui'

// Fase 2b: o conteúdo vai ao Supabase (page_contents). Estes testes escrevem só em páginas "e2e-" do
// usuário de teste 1; o conteúdo some junto com a página na limpeza (FK em cascata).

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const SKIP_NO_MIGRATION =
  'A migration 20261022120001_page_contents ainda não foi aplicada no Supabase do e2e (get_page_content não existe). Aplique com db push e rode de novo.'

// eslint-disable-next-line no-empty-pattern -- o Playwright exige o 1º argumento desestruturado
test.beforeAll(async ({}, testInfo) => {
  if (!hasE2ECredentials) return
  const session = await apiSession(testInfo.project.name)
  test.skip(!(await contentSyncAvailable(session)), SKIP_NO_MIGRATION)
})

const content = (page: Page) => page.getByRole('region', { name: 'Conteúdo da página' })
const surface = (page: Page) => content(page).locator('.bn-editor')
const status = (page: Page) => page.locator('[data-sync-status]')

async function openPage(page: Page, id: string) {
  await page.goto(`/p/${id}`)
  await expect(surface(page)).toBeVisible()
}

async function typeAtEnd(page: Page, text: string) {
  await surface(page).click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

/** "Salvo" depois de digitar: o envio (1 s ocioso) foi confirmado pelo servidor. */
async function expectSaved(page: Page) {
  await expect(status(page)).toHaveAttribute('data-sync-status', 'saved', { timeout: 15_000 })
}

/** Segundo aparelho: outro contexto do navegador, com a mesma sessão e o mesmo dispositivo. */
async function otherDevice(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use)
  return context.newPage()
}

/** Gatilho de recebimento sem esperar o polling de 20 s: o foco volta para a aba. */
async function focusBack(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

async function newPage(
  run: { prefix: string; api: Parameters<typeof createTestPage>[0] },
  name: string,
) {
  return createTestPage(run.api, { title: `${run.prefix}${name}`, sortKey: sortKeySequence()() })
}

test('edits are saved to the server and come back after reloading', async ({ page, run }) => {
  const id = await newPage(run, 'salvar')
  await openPage(page, id)
  await typeAtEnd(page, 'texto salvo no servidor')
  await expectSaved(page)

  // Apaga o cache do aparelho: o que aparece depois do reload veio do servidor.
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = () => {
          resolve()
        }
        request.onblocked = () => {
          resolve()
        }
      }),
    `axenotes-page-${id}`,
  )
  await page.goto('about:blank')
  await openPage(page, id)
  await expect(surface(page)).toContainText('texto salvo no servidor')
})

test('device B sees what device A wrote after focus (no Realtime)', async ({
  page,
  run,
  browser,
}, testInfo) => {
  const id = await newPage(run, 'dois-aparelhos')
  const pageB = await otherDevice(browser, testInfo)
  try {
    await openPage(page, id)
    await openPage(pageB, id)

    await typeAtEnd(page, 'escrito no aparelho A')
    await expectSaved(page)

    await focusBack(pageB)
    await expect(surface(pageB)).toContainText('escrito no aparelho A')

    // E na volta: B escreve, A recebe; os dois convergem.
    await typeAtEnd(pageB, ' e completado no B')
    await expectSaved(pageB)
    await focusBack(page)
    await expect(surface(page)).toContainText('completado no B')
    await expect(surface(pageB)).toContainText('escrito no aparelho A')
  } finally {
    await pageB.context().close()
  }
})

test('offline edits on A reach B after A reconnects', async ({ page, run, browser }, testInfo) => {
  const id = await newPage(run, 'offline')
  const pageB = await otherDevice(browser, testInfo)
  try {
    await openPage(page, id)
    await openPage(pageB, id)

    await page.context().setOffline(true)
    await typeAtEnd(page, 'escrito sem internet')
    await expect(status(page)).toHaveAttribute('data-sync-status', 'offline')
    await expect(status(page)).toHaveText('Offline — será sincronizado')

    await page.context().setOffline(false)
    await expectSaved(page)

    await focusBack(pageB)
    await expect(surface(pageB)).toContainText('escrito sem internet')
  } finally {
    await page.context().setOffline(false)
    await pageB.context().close()
  }
})

test('search finds a word from the page body', async ({ page, run }) => {
  const id = await newPage(run, 'busca-corpo')
  const word = `zqx${String(Date.now()).slice(-6)}`
  await openPage(page, id)
  await typeAtEnd(page, `uma palavra rara: ${word}`)
  await expectSaved(page)
  // O texto de busca vai 5 s depois da última edição (ou ao ocultar a aba).
  await expect.poll(() => savedBodyText(run.api, id), { timeout: 20_000 }).toContain(word)

  await openNavigation(page)
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Buscar', exact: true })
    .click()
  await page.getByRole('combobox', { name: 'Buscar páginas' }).fill(word)
  const option = page.getByRole('option', { name: new RegExp(`${run.prefix}busca-corpo`) })
  await expect(option).toBeVisible()
  await expect(option.locator('mark')).toHaveText(word)
})

test('signing out with a pending edit asks first (and Cancel keeps everything)', async ({
  page,
  run,
}) => {
  const id = await newPage(run, 'logout-pendente')
  await openPage(page, id)
  await page.context().setOffline(true)
  try {
    await typeAtEnd(page, 'ainda não sincronizado')
    await expect(status(page)).toHaveAttribute('data-sync-status', 'offline')

    await openNavigation(page)
    await page.getByRole('button', { name: 'Sair' }).click()
    const dialog = page.getByRole('alertdialog', {
      name: 'Há alterações não sincronizadas. Sair mesmo assim?',
    })
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toBeHidden()
  } finally {
    await page.context().setOffline(false)
  }
  // Cancelou: continua logado e o pendente chega ao servidor ao reconectar.
  await page.goto(`/p/${id}`)
  await expectSaved(page)
  await expect(surface(page)).toContainText('ainda não sincronizado')
})
