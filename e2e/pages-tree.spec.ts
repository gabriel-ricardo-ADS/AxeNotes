import { expect, type Page } from '@playwright/test'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { createTestPage, savedTitle, sortKeySequence } from './support/pages-api'
import { test } from './support/run-fixture'
import { openNavigation } from './support/ui'

// Estes testes ESCREVEM no projeto Supabase real (ver support/run-fixture.ts): só os dados do usuário
// de teste 1, com títulos "e2e-<projeto>-<aleatório>-…", apagados no fim de cada teste.

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const titleField = (page: Page) => page.getByRole('textbox', { name: 'Título da página' })
const tree = (page: Page) => page.getByRole('tree', { name: 'Árvore de páginas' })
const item = (page: Page, title: string) =>
  tree(page).getByRole('treeitem', { name: title, exact: true })

/** Espera a próxima escrita em `pages` (POST = criar, PATCH = título/ícone/mover) terminar com sucesso. */
function nextWrite(page: Page, method: 'POST' | 'PATCH') {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/pages') &&
      response.request().method() === method &&
      response.ok(),
  )
}

/** Títulos de teste, na ordem em que aparecem na árvore visível. */
async function visibleTitles(page: Page, prefix: string): Promise<string[]> {
  const labels = await tree(page)
    .getByRole('treeitem')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
  return labels.filter((label) => label.startsWith(prefix))
}

async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await expect(titleField(page)).toBeVisible()
  await openNavigation(page)
}

/** No mobile a gaveta fecha ao abrir uma página; esta função a reabre quando precisa. */
async function ensureTreeVisible(page: Page) {
  if (!(await tree(page).isVisible())) await openNavigation(page)
  await expect(tree(page)).toBeVisible()
}

async function typeTitle(page: Page, text: string) {
  const field = titleField(page)
  await field.fill(text)
  await field.press('Enter')
}

async function renameFromMenu(page: Page, from: string, to: string) {
  await ensureTreeVisible(page)
  await page.getByRole('button', { name: `Mais ações de ${from}` }).click()
  await page.getByRole('menuitem', { name: 'Renomear' }).click()
  const input = page.getByRole('textbox', { name: 'Novo nome da página' })
  await input.fill(to)
  const saved = nextWrite(page, 'PATCH')
  await input.press('Enter')
  await saved
}

async function movePageTo(page: Page, title: string, destination: string) {
  await ensureTreeVisible(page)
  await page.getByRole('button', { name: `Mais ações de ${title}` }).click()
  await page.getByRole('menuitem', { name: 'Mover para…' }).click()
  const dialog = page.getByRole('dialog', { name: /Mover/ })
  const saved = nextWrite(page, 'PATCH')
  await dialog.getByRole('button', { name: destination, exact: true }).click()
  await saved
  await expect(dialog).toHaveCount(0)
}

test.describe('árvore de páginas', () => {
  test('creates a root page and a subpage, renames, and still has them after reloading', async ({
    page,
    run,
  }) => {
    const root = `${run.prefix}raiz`
    const sub = `${run.prefix}sub`
    const renamed = `${run.prefix}raiz-renomeada`
    await openApp(page)

    // Página raiz: nasce vazia, com o foco no título.
    const created = nextWrite(page, 'POST')
    await page.getByRole('button', { name: 'Nova página' }).click()
    await created
    await expect(titleField(page)).toHaveValue('')
    await expect(titleField(page)).toBeFocused()
    const savedRoot = nextWrite(page, 'PATCH')
    await typeTitle(page, root)
    await savedRoot
    // O título dentro do <h1> dá nome ao heading (WebKit incluso).
    await expect(page.getByRole('heading', { level: 1, name: root })).toBeVisible()

    // Subpágina.
    await ensureTreeVisible(page)
    const createdSub = nextWrite(page, 'POST')
    await page.getByRole('button', { name: `Nova subpágina em ${root}` }).click()
    await createdSub
    await expect(titleField(page)).toHaveValue('')
    const savedSub = nextWrite(page, 'PATCH')
    await typeTitle(page, sub)
    await savedSub

    // Renomear a raiz pelo menu da linha.
    await renameFromMenu(page, root, renamed)
    await ensureTreeVisible(page)
    await expect(item(page, renamed)).toBeVisible()

    // Persistiu: recarrega e confere a árvore (a subpágina aberta revela o caminho).
    await page.reload()
    await expect(titleField(page)).toHaveValue(sub)
    await openNavigation(page)
    await expect(item(page, renamed)).toHaveAttribute('aria-expanded', 'true')
    expect(await visibleTitles(page, run.prefix)).toEqual([renamed, sub])
    await expect(item(page, sub)).toHaveAttribute('aria-level', '2')
  })

  test('moves a page into another with "Mover para…", at the end, and keeps the order after reloading', async ({
    page,
    run,
  }) => {
    const a = `${run.prefix}a`
    const child = `${run.prefix}a-filha`
    const b = `${run.prefix}b`
    const nextKey = sortKeySequence()
    const aId = await createTestPage(run.api, { title: a, sortKey: nextKey() })
    await createTestPage(run.api, { title: child, parentId: aId, sortKey: nextKey() })
    await createTestPage(run.api, { title: b, sortKey: nextKey() })
    await openApp(page)
    expect(await visibleTitles(page, run.prefix)).toEqual([a, b])

    await movePageTo(page, b, a)

    // B virou a última filha de A; A abriu sozinha.
    expect(await visibleTitles(page, run.prefix)).toEqual([a, child, b])
    await expect(item(page, b)).toHaveAttribute('aria-level', '2')

    await page.reload()
    await openNavigation(page)
    await expect(item(page, a)).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: `Expandir ${a}` }).click()
    expect(await visibleTitles(page, run.prefix)).toEqual([a, child, b])
  })

  test('does not offer a page or its descendants as the destination of its own move', async ({
    page,
    run,
  }) => {
    const parent = `${run.prefix}pai`
    const child = `${run.prefix}filha`
    const nextKey = sortKeySequence()
    const parentId = await createTestPage(run.api, { title: parent, sortKey: nextKey() })
    await createTestPage(run.api, { title: child, parentId, sortKey: nextKey() })
    await openApp(page)
    await page.getByRole('button', { name: `Expandir ${parent}` }).click()

    await page.getByRole('button', { name: `Mais ações de ${parent}` }).click()
    await page.getByRole('menuitem', { name: 'Mover para…' }).click()
    const dialog = page.getByRole('dialog', { name: /Mover/ })

    await expect(dialog.getByRole('button', { name: parent, exact: true })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: child, exact: true })).toBeDisabled()
  })

  test('drags a page above another one (mouse, desktop)', async ({ page, run }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Arrastar com o mouse só no desktop.')
    const a = `${run.prefix}a`
    const b = `${run.prefix}b`
    const nextKey = sortKeySequence()
    await createTestPage(run.api, { title: a, sortKey: nextKey() })
    await createTestPage(run.api, { title: b, sortKey: nextKey() })
    await openApp(page)
    expect(await visibleTitles(page, run.prefix)).toEqual([a, b])

    const rowA = await item(page, a).boundingBox()
    const rowB = await item(page, b).boundingBox()
    if (!rowA || !rowB) throw new Error('Linhas da árvore sem posição.')
    const x = rowB.x + 60
    const saved = nextWrite(page, 'PATCH')
    await page.mouse.move(x, rowB.y + rowB.height / 2)
    await page.mouse.down()
    await page.mouse.move(x, rowB.y + rowB.height / 2 - 10, { steps: 3 })
    await page.mouse.move(x, rowA.y + 3, { steps: 10 })
    await page.mouse.up()
    await saved

    // A nova ordem vale agora (cache otimista + conferência com o servidor) e depois do reload.
    await expect.poll(() => visibleTitles(page, run.prefix)).toEqual([b, a])
    await page.reload()
    await openNavigation(page)
    await expect(item(page, b)).toBeVisible()
    await expect.poll(() => visibleTitles(page, run.prefix)).toEqual([b, a])
  })

  test('keeps the title typed right before a reload (desktop)', async ({ page, run }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'O aviso de sair da página só existe no desktop.',
    )
    const title = `${run.prefix}recarrega`
    const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    // Com texto pendente o navegador mostra o aviso de "sair da página"; o teste aceita o diálogo.
    // O Chromium só o mostra depois de interação real do usuário: por isso click() e pressSequentially().
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type())
      void dialog.accept()
    })
    await page.goto(`/p/${id}`)
    await expect(titleField(page)).toHaveValue(title)

    await titleField(page).click()
    await titleField(page).press('End') // o clique põe o cursor no meio do texto
    await titleField(page).pressSequentially('!')
    await page.reload() // bem antes dos 600 ms do debounce

    await expect(titleField(page)).toHaveValue(`${title}!`)
    await expect.poll(() => savedTitle(run.api, id)).toBe(`${title}!`)
    expect(dialogs).toEqual(['beforeunload'])
  })

  test('changes the icon of a page from the page header', async ({ page, run }) => {
    const title = `${run.prefix}icone`
    const id = await createTestPage(run.api, { title, sortKey: sortKeySequence()() })
    await page.goto(`/p/${id}`)
    await expect(titleField(page)).toHaveValue(title)

    await page.getByRole('button', { name: 'Adicionar ícone' }).click()
    const saved = nextWrite(page, 'PATCH')
    await page
      .getByRole('dialog', { name: 'Escolher ícone' })
      .getByRole('button', { name: 'Usar 🌿' })
      .click()
    await saved

    await page.reload()
    await expect(page.getByRole('button', { name: 'Alterar ícone da página' })).toContainText('🌿')
  })
})

test.describe('página que não existe', () => {
  for (const path of ['/p/00000000-0000-4000-8000-00000000dead', '/p/isso-nao-e-um-id']) {
    test(`shows "Página não encontrada" for ${path.slice(0, 12)}…`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
      await expect(
        page.getByText('Esta página não existe ou você não tem acesso a ela.'),
      ).toBeVisible()
    })
  }
})
