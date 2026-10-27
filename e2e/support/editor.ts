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

/** Toque (`pointer: coarse`): iPhone e iPad. */
const isTouch = (page: Page) => page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)

/** A alça ⋮⋮ do iPad, na margem do bloco do cursor. */
export const marginHandle = (page: Page) => page.locator('.axn-touch-handle')

/**
 * Abre o menu do bloco pela alça ⋮⋮. Desktop: passando o mouse sobre o bloco. iPad: tocando no bloco e na alça da
 * margem. iPhone: a alça mora na barra do teclado, então "abre" o teclado, toca o ⋮⋮ da barra e devolve o tamanho
 * da janela (o menu abre num bottom sheet).
 */
export async function openBlockMenu(page: Page, block: Locator) {
  const size = page.viewportSize()
  if (!(await isTouch(page))) {
    await block.hover()
    await page.getByRole('button', { name: /abrir as ações do bloco/ }).click()
  } else if ((size?.width ?? 0) >= 768) {
    await block.tap()
    await marginHandle(page).tap()
  } else {
    await block.tap()
    await openKeyboard(page)
    await touchBar(page).getByRole('button', { name: 'Opções do bloco' }).tap()
    if (size) await page.setViewportSize(size)
  }
  await expect(blockMenu(page)).toBeVisible()
}

/** Escolhe um item do menu do bloco (opções do listbox, pelo nome acessível). */
export async function chooseInBlockMenu(page: Page, ...names: string[]) {
  for (const name of names) {
    await page.getByRole('option', { name, exact: true }).click()
  }
}

/** A barra do editor acima do teclado (toque). */
export const touchBar = (page: Page) => page.getByRole('toolbar', { name: 'Ferramentas do editor' })

/**
 * "Abre" o teclado virtual: com o editor já focado, reduz a altura do viewport em 300 px (o
 * `visualViewport` encolhe, como no Android com `interactive-widget=resizes-content`). O iOS real, em
 * que o teclado cobre a página sem mudar o `innerHeight`, fica para o teste em aparelho.
 */
export async function openKeyboard(page: Page) {
  const size = page.viewportSize()
  if (!size) throw new Error('viewport sem tamanho')
  await page.setViewportSize({ width: size.width, height: size.height - 300 })
}
