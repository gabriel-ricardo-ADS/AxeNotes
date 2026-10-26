import { expect, type Locator, type Page } from '@playwright/test'
import { createTestPage, sortKeySequence } from './pages-api'
import type { Run } from './run-fixture'

// Atalhos dos e2e do editor de blocos (editor.spec.ts, blocos.spec.ts).

/** A região do corpo da página (editor). */
const content = (page: Page) => page.getByRole('region', { name: 'Conteúdo da página' })

/** A superfície editável do BlockNote. */
export const surface = (page: Page) => content(page).locator('.bn-editor')

/** Os blocos de um tipo (`data-content-type`). */
export const blocks = (page: Page, type: string) =>
  content(page).locator(`.bn-block-content[data-content-type="${type}"]`)

/** Abre a página e espera o editor (chunk próprio + IndexedDB) ficar pronto. */
export async function openPage(page: Page, id: string, hash = '') {
  await page.goto(`/p/${id}${hash}`)
  await expect(surface(page)).toBeVisible()
}

/** Põe o cursor no fim do último bloco. */
export async function focusEnd(page: Page) {
  await surface(page).click()
  await page.keyboard.press('ControlOrMeta+End')
}

/** Escolhe um item do menu "/" pelo nome, digitando para filtrar. */
export async function insertFromSlashMenu(page: Page, filter: string, item: string) {
  await page.keyboard.type(`/${filter}`)
  await page
    .getByRole('option', { name: new RegExp(item) })
    .first()
    .click()
}

/** y-indexeddb grava cada update na hora; dá um respiro antes de recarregar ou sair da página. */
export async function settle(page: Page) {
  await page.waitForTimeout(300)
}

/** Cria uma página de teste (prefixo do teste) pela API e devolve o id. */
export async function newPage(run: Run, name: string, parentId: string | null = null) {
  return createTestPage(run.api, {
    title: `${run.prefix}${name}`,
    sortKey: sortKeySequence()(),
    ...(parentId === null ? {} : { parentId }),
  })
}

/** O menu do bloco aberto (popover no desktop, bottom sheet no toque). */
export const blockMenu = (page: Page) =>
  page.getByRole('combobox', { name: 'Pesquisar ações do bloco' })

/** Abre o menu do bloco pela alça ⋮⋮, passando o mouse sobre o bloco. */
export async function openBlockMenu(page: Page, block: Locator) {
  await block.hover()
  await page.getByRole('button', { name: /abrir as ações do bloco/ }).click()
  await expect(blockMenu(page)).toBeVisible()
}

/** Escolhe um item do menu do bloco (opções do listbox, pelo nome acessível). */
export async function chooseInBlockMenu(page: Page, ...names: string[]) {
  for (const name of names) {
    await page.getByRole('option', { name, exact: true }).click()
  }
}
