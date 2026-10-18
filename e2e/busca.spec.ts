import { expect, type Page } from '@playwright/test'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { createTestPage, sortKeySequence } from './support/pages-api'
import { test } from './support/run-fixture'
import { openNavigation } from './support/ui'

// Estes testes ESCREVEM no projeto Supabase real (ver support/run-fixture.ts), só nos dados do usuário
// de teste 1. A busca olha o workspace inteiro e os 3 projetos rodam em paralelo no mesmo usuário: cada
// teste procura pelo PREFIXO exclusivo dele ("e2e-<projeto>-<aleatório>-…"), então só acha as próprias páginas.

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const titleField = (page: Page) => page.getByRole('textbox', { name: 'Título da página' })
const searchField = (page: Page) => page.getByRole('combobox', { name: 'Buscar páginas' })
const searchDialog = (page: Page) => page.getByRole('dialog', { name: 'Buscar páginas' })
const drawer = (page: Page) => page.locator('[data-slot="sheet-content"]')
const menuButton = (page: Page) => page.getByRole('button', { name: 'Abrir menu' })

/** Abre a tela inicial já carregada (a página inicial é criada na primeira vez, se preciso). */
async function openApp(page: Page) {
  await page.goto('/')
  await expect(titleField(page)).toBeVisible()
}

/** O botão "Buscar" da sidebar (desktop/tablet) ou da gaveta (mobile; a gaveta precisa estar aberta). */
function searchButton(page: Page) {
  return page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', {
    name: 'Buscar',
    exact: true,
  })
}

// Ctrl/Cmd+K é para quem tem teclado de computador; o iPhone/iPad emulados dependem do botão.
const SHORTCUT_ONLY_ON_DESKTOP = 'atalho só no projeto desktop'

test.describe('busca pelo teclado', () => {
  test('opens with Ctrl+K, finds the title without accents, opens the page with Enter', async ({
    page,
    run,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SHORTCUT_ONLY_ON_DESKTOP)
    const title = `${run.prefix}Cálculo diferencial`
    const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    await openApp(page)

    await page.keyboard.press('ControlOrMeta+K')
    await expect(searchDialog(page)).toBeVisible()
    await expect(searchField(page)).toBeFocused()

    await searchField(page).fill(`${run.prefix}calculo`)
    const option = page.getByRole('option', { name: new RegExp(title) })
    await expect(option).toBeVisible()
    await expect(searchDialog(page).getByRole('status')).toContainText('1 resultado.')

    await page.keyboard.press('Enter')

    await expect(searchDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/p/${id}$`))
    await expect(titleField(page)).toHaveValue(title)
    // Veio de um atalho sem nada focado: o foco volta ao conteúdo.
    await expect(page.locator('#conteudo')).toBeFocused()
  })

  test('closes with Esc and returns the focus to the element that was focused', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SHORTCUT_ONLY_ON_DESKTOP)
    await openApp(page)
    const home = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', {
      name: 'Página inicial',
    })
    await home.focus()

    await page.keyboard.press('ControlOrMeta+K')
    await expect(searchField(page)).toBeFocused()
    await page.keyboard.press('Escape')

    await expect(searchDialog(page)).toHaveCount(0)
    await expect(home).toBeFocused()
  })
})

test.describe('busca pelo botão "Buscar"', () => {
  test('opens from the sidebar or the drawer, opens the clicked result and returns the focus', async ({
    page,
    run,
  }) => {
    const title = `${run.prefix}Reunião semanal`
    const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    await openApp(page)
    await openNavigation(page)

    await searchButton(page).click()
    await expect(searchField(page)).toBeFocused()
    await searchField(page).fill(`${run.prefix}reuniao`)
    await page.getByRole('option', { name: new RegExp(title) }).click()

    await expect(searchDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/p/${id}$`))
    await expect(titleField(page)).toHaveValue(title)
  })

  test('on the phone the dialog stacks over the drawer: focus on open, on Esc and on pick', async ({
    page,
    run,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'a gaveta só existe no mobile')
    const title = `${run.prefix}Diário`
    const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    await openApp(page)
    await openNavigation(page)

    // Abre por cima da gaveta (ela continua montada por baixo) e o campo recebe o foco.
    await searchButton(page).tap()
    await expect(searchField(page)).toBeFocused()
    await expect(drawer(page)).toBeAttached()
    // O Radix só registra a camada nova um quadro depois de focar o campo; um Esc nesse instante iria para a
    // gaveta (menos de 50 ms: só um teste automático é rápido assim). Espera dois quadros.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve()
            })
          })
        }),
    )

    // Esc: o foco volta ao botão "Buscar" da própria gaveta, que continua aberta.
    await page.keyboard.press('Escape')
    await expect(searchDialog(page)).toHaveCount(0)
    await expect(drawer(page)).toBeAttached()
    await expect(searchButton(page)).toBeFocused()

    // Escolher um resultado fecha o diálogo E a gaveta; o foco vai ao ☰.
    await searchButton(page).tap()
    await searchField(page).fill(`${run.prefix}diario`)
    await page.getByRole('option', { name: new RegExp(title) }).tap()

    await expect(searchDialog(page)).toHaveCount(0)
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/p/${id}$`))
    await expect(titleField(page)).toHaveValue(title)
    await expect(menuButton(page)).toBeFocused()
  })

  test('with little visible height (keyboard open) the field and the list stay on screen', async ({
    page,
    run,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'só no mobile')
    const title = `${run.prefix}Receitas`
    await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    await openApp(page)
    await openNavigation(page)
    // O WebKit do Playwright não abre teclado virtual: um viewport baixo faz o papel do que sobra acima dele.
    await page.setViewportSize({ width: 390, height: 400 })

    await searchButton(page).tap()
    await searchField(page).fill(`${run.prefix}receitas`)
    const option = page.getByRole('option', { name: new RegExp(title) })
    await expect(option).toBeVisible()

    const height = page.viewportSize()?.height ?? 0
    for (const locator of [searchField(page), option, searchDialog(page)]) {
      const box = await locator.boundingBox()
      expect(box).not.toBeNull()
      expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height)
    }
  })
})
