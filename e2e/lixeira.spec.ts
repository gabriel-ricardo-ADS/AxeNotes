import { expect, type Page } from '@playwright/test'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { createTestPage, pageState, sortKeySequence } from './support/pages-api'
import { test } from './support/run-fixture'
import { openNavigation } from './support/ui'

// Estes testes ESCREVEM no projeto Supabase real (ver support/run-fixture.ts), só nos dados do usuário
// de teste 1. A lixeira é do workspace inteiro e os 3 projetos rodam em paralelo no mesmo usuário: as
// asserções olham só as linhas com o prefixo deste teste. A faxina do fim apaga as páginas de teste
// mesmo que estejam na lixeira.

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const titleField = (page: Page) => page.getByRole('textbox', { name: 'Título da página' })
const tree = (page: Page) => page.getByRole('tree', { name: 'Árvore de páginas' })
const trashRow = (page: Page, title: string) =>
  page
    .getByRole('list', { name: 'Páginas na lixeira' })
    .getByRole('listitem')
    .filter({ hasText: title })

async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await expect(titleField(page)).toBeVisible()
  await openNavigation(page)
}

/** No mobile a gaveta fecha ao abrir uma página ou a lixeira; reabre quando precisa. */
async function ensureSidebar(page: Page) {
  if (!(await page.getByRole('navigation', { name: 'Navegação principal' }).isVisible())) {
    await openNavigation(page)
  }
}

async function sendToTrashFromTree(page: Page, title: string) {
  await ensureSidebar(page)
  await page.getByRole('button', { name: `Mais ações de ${title}` }).click()
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await expect(tree(page).getByRole('treeitem', { name: title, exact: true })).toHaveCount(0)
}

async function openTrash(page: Page) {
  await ensureSidebar(page)
  await page.getByRole('link', { name: 'Lixeira' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Lixeira' })).toBeVisible()
  await expect(page).toHaveURL(/\/lixeira$/)
}

test('trashes from the tree, finds it in /lixeira, restores, trashes again and deletes forever', async ({
  page,
  run,
}) => {
  const title = `${run.prefix}lixo`
  const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
  await openApp(page)

  await sendToTrashFromTree(page, title)
  // Sai da árvore na hora (otimista); o servidor confirma logo depois.
  await expect.poll(() => pageState(run.api, id)).toBe('trashed')

  await openTrash(page)
  const row = trashRow(page, title)
  await expect(row).toBeVisible()
  await expect(row).toContainText('Excluída há')

  await row.getByRole('button', { name: `Restaurar ${title}` }).click()
  await expect(row).toHaveCount(0)
  await expect.poll(() => pageState(run.api, id)).toBe('live')

  await ensureSidebar(page)
  await expect(tree(page).getByRole('treeitem', { name: title, exact: true })).toBeVisible()

  await sendToTrashFromTree(page, title)
  await expect.poll(() => pageState(run.api, id)).toBe('trashed')
  await openTrash(page)
  await trashRow(page, title)
    .getByRole('button', { name: `Excluir ${title} definitivamente` })
    .click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Excluir definitivamente' }).click()

  await expect(trashRow(page, title)).toHaveCount(0)
  await expect.poll(() => pageState(run.api, id)).toBe('missing')
})

test('trashes the open page from its own menu and lands on the parent page', async ({
  page,
  run,
}) => {
  const nextKey = sortKeySequence()
  const parent = `${run.prefix}pai`
  const child = `${run.prefix}filha`
  const parentId = await createTestPage(run.api, { title: parent, sortKey: nextKey() })
  const childId = await createTestPage(run.api, { title: child, parentId, sortKey: nextKey() })
  await page.goto(`/p/${childId}`)
  await expect(titleField(page)).toHaveValue(child)

  await page.getByRole('button', { name: 'Mais ações da página' }).click()
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()

  await expect(page).toHaveURL(new RegExp(`/p/${parentId}$`))
  await expect(titleField(page)).toHaveValue(parent)
  await expect.poll(() => pageState(run.api, childId)).toBe('trashed')

  await openNavigation(page)
  await openTrash(page)
  await expect(trashRow(page, child)).toContainText(`Origem: ${parent}`)
})
