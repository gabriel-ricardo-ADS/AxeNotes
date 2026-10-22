import { expect, type Page } from '@playwright/test'
import { E2E_USER_1, hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { createTestPage, sortKeySequence } from './support/pages-api'
import { test } from './support/run-fixture'
import { openNavigation, SIGNED_OUT_STATE, signInThroughUi } from './support/ui'

// Editor de blocos (Fase 2a) sobre o Y.Doc da página. Desde o 2b o conteúdo também vai ao Supabase
// (page_contents, ver sync.spec.ts); estes testes usam só páginas de teste do usuário 1 (prefixo e2e-,
// run-fixture.ts), e o conteúdo some junto com a página na limpeza.

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const content = (page: Page) => page.getByRole('region', { name: 'Conteúdo da página' })
const surface = (page: Page) => content(page).locator('.bn-editor')
const blocks = (page: Page, type: string) =>
  content(page).locator(`.bn-block-content[data-content-type="${type}"]`)

/** Abre a página e espera o editor (chunk próprio + IndexedDB) ficar pronto. */
async function openPage(page: Page, id: string) {
  await page.goto(`/p/${id}`)
  await expect(surface(page)).toBeVisible()
  // O aviso de prévia do 2a saiu no 2b.
  await expect(page.getByText(/Prévia: o conteúdo fica salvo só neste aparelho/)).toHaveCount(0)
}

/** Põe o cursor no fim do último bloco. */
async function focusEnd(page: Page) {
  await surface(page).click()
  await page.keyboard.press('ControlOrMeta+End')
}

/** Escolhe um item do menu "/" pelo nome, digitando para filtrar. */
async function insertFromSlashMenu(page: Page, filter: string, item: string) {
  await page.keyboard.type(`/${filter}`)
  await page
    .getByRole('option', { name: new RegExp(item) })
    .first()
    .click()
}

/** y-indexeddb grava cada update na hora; dá um respiro antes de recarregar. */
async function settle(page: Page) {
  await page.waitForTimeout(300)
}

async function newPage(
  run: { prefix: string; api: Parameters<typeof createTestPage>[0] },
  name: string,
) {
  return createTestPage(run.api, { title: `${run.prefix}${name}`, sortKey: sortKeySequence()() })
}

test('writes blocks with the "/" menu and markdown, and finds them after reloading', async ({
  page,
  run,
}) => {
  const id = await newPage(run, 'editor')
  await openPage(page, id)
  await focusEnd(page)

  await page.keyboard.type('# Seção de leituras')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- primeiro item')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[] tarefa pendente')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await insertFromSlashMenu(page, 'expans', 'Lista expansível')
  await page.keyboard.type('Objetivos do mês')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await insertFromSlashMenu(page, 'tabe', 'Tabela')
  await page.keyboard.type('célula A1')

  await expect(blocks(page, 'heading')).toContainText('Seção de leituras')
  await expect(blocks(page, 'table')).toContainText('célula A1')
  await settle(page)
  await page.reload()

  await expect(surface(page)).toBeVisible()
  await expect(blocks(page, 'heading')).toContainText('Seção de leituras')
  await expect(blocks(page, 'bulletListItem')).toContainText('primeiro item')
  await expect(blocks(page, 'checkListItem')).toContainText('tarefa pendente')
  await expect(blocks(page, 'toggleListItem')).toContainText('Objetivos do mês')
  await expect(blocks(page, 'table')).toContainText('célula A1')
})

test('keeps editing while offline and still has it after reconnecting and reloading', async ({
  page,
  context,
  run,
}) => {
  const id = await newPage(run, 'offline')
  await openPage(page, id)
  await focusEnd(page)
  await page.keyboard.type('antes de cair a rede')

  await context.setOffline(true)
  await page.keyboard.press('Enter')
  await page.keyboard.type('escrito sem internet')
  await expect(surface(page)).toContainText('escrito sem internet')
  await settle(page)
  await context.setOffline(false)

  // Recarregar sem internet exige o service worker (Fase 6): recarrega já online.
  await page.reload()
  await expect(surface(page)).toContainText('antes de cair a rede')
  await expect(surface(page)).toContainText('escrito sem internet')
})

test('switching pages never mixes their content', async ({ page, run }) => {
  const first = await newPage(run, 'pagina-a')
  const second = await newPage(run, 'pagina-b')

  await openPage(page, first)
  await focusEnd(page)
  await page.keyboard.type('só da página A')
  await settle(page)

  // Troca pela árvore (sem recarregar o app): o editor e o Y.Doc da página A saem de cena.
  await openNavigation(page)
  await page
    .getByRole('tree', { name: 'Árvore de páginas' })
    .getByRole('treeitem', { name: `${run.prefix}pagina-b`, exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/p/${second}$`))
  await expect(surface(page)).toBeVisible()
  await expect(surface(page)).not.toContainText('só da página A')
  await focusEnd(page)
  await page.keyboard.type('só da página B')
  await settle(page)

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/p/${first}$`))
  await expect(surface(page)).toContainText('só da página A')
  await expect(surface(page)).not.toContainText('só da página B')
})

test('a page in the trash opens read-only', async ({ page, run }) => {
  const id = await newPage(run, 'lixeira-leitura')
  const { error } = await run.api.client.rpc('trash_page', { p_page_id: id })
  expect(error).toBeNull()

  await page.goto(`/p/${id}`)
  await expect(
    page.getByText('Esta página está na lixeira. Para editá-la, restaure-a.'),
  ).toBeVisible()
  await expect(surface(page)).toHaveAttribute('contenteditable', 'false')
  await expect(page.getByRole('textbox', { name: 'Título da página' })).toHaveCount(0)
})

test('Ctrl/Cmd+K opens the search without a selection and the link field with one', async ({
  page,
  run,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'atalho de teclado físico: só no desktop')
  const id = await newPage(run, 'atalho')
  await openPage(page, id)
  await focusEnd(page)
  await page.keyboard.type('palavra')

  await page.keyboard.press('ControlOrMeta+k')
  const search = page.getByRole('dialog', { name: 'Buscar páginas' })
  await expect(search).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(search).toBeHidden()

  // Seleção com o mouse: é ela que abre a barra de formatação (onde mora o atalho de link).
  await surface(page).getByText('palavra').dblclick()
  await expect(page.getByRole('button', { name: 'Criar link' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('button', { name: 'Criar link', expanded: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Editar URL' })).toBeVisible()
  await expect(search).toBeHidden()
})

test.describe('logout', () => {
  // Sair revoga a sessão: este teste entra com uma sessão só dele.
  test.use({ storageState: SIGNED_OUT_STATE })

  test('signing out deletes the axenotes-page-* databases', async ({ page, run }) => {
    const id = await newPage(run, 'logout')
    await signInThroughUi(page, E2E_USER_1)
    await openPage(page, id)
    await focusEnd(page)
    await page.keyboard.type('conteúdo da conta anterior')
    await settle(page)

    const pageDatabases = () =>
      page.evaluate(async () =>
        (await indexedDB.databases())
          .map((info) => info.name ?? '')
          .filter((name) => name.startsWith('axenotes-page-')),
      )
    expect(await pageDatabases()).toContain(`axenotes-page-${id}`)

    await openNavigation(page)
    await page.getByRole('button', { name: 'Sair' }).click()
    // Sem a migration do 2b aplicada o conteúdo não sincroniza e o "Sair" pergunta antes.
    const confirm = page.getByRole('button', { name: 'Sair mesmo assim' })
    await expect(confirm.or(page.getByRole('heading', { name: 'Entrar' }))).toBeVisible({
      timeout: 15_000,
    })
    if (await confirm.isVisible()) await confirm.click()
    await page.waitForURL(/\/entrar/)

    await expect.poll(pageDatabases).toEqual([])
  })
})
