import { expect, type Page, type Response } from '@playwright/test'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { createTestPage, sortKeySequence } from './support/pages-api'
import { test } from './support/run-fixture'
import { openNavigation } from './support/ui'
import { favoritePageIds, homePageIdOf, recentPageIds } from './support/user-data-api'

// Estes testes ESCREVEM no projeto Supabase real (ver support/run-fixture.ts), só nos dados do usuário
// de teste 1. Favoritos e recentes são por usuário e os 3 projetos rodam em paralelo no mesmo usuário:
// as asserções olham só as páginas do prefixo deste teste. Apagar as páginas de teste leva junto as
// linhas de favoritos e recentes (FK em cascata).

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const favoritesList = (page: Page) => page.getByRole('list', { name: 'Páginas favoritas' })
const recentsList = (page: Page) => page.getByRole('list', { name: 'Páginas recentes' })
const titleField = (page: Page) => page.getByRole('textbox', { name: 'Título da página' })

/** A próxima escrita (`method`) em `table` que o servidor aceitou. */
function nextWrite(page: Page, table: 'user_favorites' | 'user_recents', method: string) {
  return page.waitForResponse(
    (response: Response) =>
      response.url().includes(`/rest/v1/${table}`) &&
      response.request().method() === method &&
      response.ok(),
  )
}

/** Abre a página e espera o título; no mobile a gaveta fica fechada (ela cobriria a estrela da página). */
async function openPage(page: Page, path = '/') {
  await page.goto(path)
  await expect(titleField(page)).toBeVisible()
}

async function openApp(page: Page, path = '/') {
  await openPage(page, path)
  await openNavigation(page)
}

test.describe('favoritos', () => {
  test('favorites from the row menu, keeps it after reloading, and removes it from the section', async ({
    page,
    run,
  }) => {
    const title = `${run.prefix}favorita`
    const nextKey = sortKeySequence()
    const id = await createTestPage(run.api, { title, sortKey: nextKey() })
    await openApp(page)

    await page.getByRole('button', { name: `Mais ações de ${title}` }).click()
    const saved = nextWrite(page, 'user_favorites', 'POST')
    await page.getByRole('menuitem', { name: 'Adicionar aos favoritos' }).click()
    await saved

    await expect(favoritesList(page).getByRole('link', { name: title })).toBeVisible()
    expect(await favoritePageIds(run.api)).toContain(id)

    await page.reload()
    await expect(titleField(page)).toBeVisible()
    await openNavigation(page)
    await expect(favoritesList(page).getByRole('link', { name: title })).toBeVisible()

    const removed = nextWrite(page, 'user_favorites', 'DELETE')
    await favoritesList(page)
      .getByRole('button', { name: `Remover ${title} dos favoritos` })
      .click()
    await removed

    await expect(favoritesList(page).getByRole('link', { name: title })).toHaveCount(0)
    expect(await favoritePageIds(run.api)).not.toContain(id)
  })

  test('favorites with the star on the page and the star stays pressed after reloading', async ({
    page,
    run,
  }) => {
    const title = `${run.prefix}estrela`
    const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    await openPage(page, `/p/${id}`)

    const saved = nextWrite(page, 'user_favorites', 'POST')
    await page.getByRole('button', { name: 'Adicionar aos favoritos' }).click()
    await saved
    await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await favoritePageIds(run.api)).toContain(id)

    await page.reload()
    await expect(titleField(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

test.describe('recentes', () => {
  test('records each page opened, lists them with the latest first, and never records the home page', async ({
    page,
    run,
  }) => {
    const first = `${run.prefix}primeira`
    const second = `${run.prefix}segunda`
    const nextKey = sortKeySequence()
    const firstId = await createTestPage(run.api, { title: first, sortKey: nextKey() })
    const secondId = await createTestPage(run.api, { title: second, sortKey: nextKey() })

    // A página inicial é aberta (e criada, se preciso) por `openApp`; ela não pode virar recente.
    const firstVisit = nextWrite(page, 'user_recents', 'POST')
    await openApp(page, `/p/${firstId}`)
    await firstVisit
    await expect(recentsList(page).getByRole('link', { name: first })).toBeVisible()

    // Abre a segunda pela árvore (no mobile a gaveta fecha ao navegar).
    const secondVisit = nextWrite(page, 'user_recents', 'POST')
    await page
      .getByRole('tree', { name: 'Árvore de páginas' })
      .getByRole('link', { name: second })
      .click()
    await secondVisit
    await expect(titleField(page)).toHaveValue(second)

    // Sem recarregar, a lista local já mostra a mais nova primeiro (entre as deste teste).
    await openNavigation(page)
    const labels = await recentsList(page)
      .getByRole('link')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent))
    const mine = labels.filter((label) => label.startsWith(run.prefix))
    expect(mine).toEqual([second, first])

    // O servidor guardou as duas, a mais nova primeiro, e nada da página inicial.
    const stored = await recentPageIds(run.api)
    expect(stored.indexOf(secondId)).toBeGreaterThanOrEqual(0)
    expect(stored.indexOf(secondId)).toBeLessThan(stored.indexOf(firstId))
    const homeId = await homePageIdOf(run.api)
    if (homeId !== null) expect(stored).not.toContain(homeId)
  })
})
