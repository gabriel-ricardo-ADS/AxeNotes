import { expect, type Locator } from '@playwright/test'
import {
  blockMenu,
  blocks,
  chooseInBlockMenu,
  focusEnd,
  insertFromSlashMenu,
  newPage,
  openBlockMenu,
  openPage,
  settle,
  surface,
} from './support/editor'
import { E2E_USER_1, hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { test } from './support/run-fixture'
import { SIGNED_OUT_STATE, signInThroughUi } from './support/ui'

// Blocos do AxeNotes (Fase 2c-1): destaque (callout), links de página e subpágina, menu do bloco.
// Só páginas de teste do usuário 1 (prefixo e2e-, run-fixture.ts).

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

/** O bloco está com a animação de destaque do link para o bloco (block-link.ts). */
function isHighlighted(outer: Locator) {
  return outer.evaluate((element) =>
    (element.querySelector(':scope > .bn-block') ?? element)
      .getAnimations()
      .some((animation) => animation.id === 'axn-block-highlight'),
  )
}

test('creates a callout from the "/" menu, changes its emoji and keeps it after reloading', async ({
  page,
  run,
}) => {
  const id = await newPage(run, 'destaque')
  await openPage(page, id)
  await focusEnd(page)

  await insertFromSlashMenu(page, 'destaq', 'Destaque')
  await page.keyboard.type('Um passo de cada vez')
  const callout = blocks(page, 'callout')
  await expect(callout).toContainText('Um passo de cada vez')
  await expect(callout.getByRole('button', { name: 'Trocar o ícone do destaque' })).toHaveText('💡')

  await callout.getByRole('button', { name: 'Trocar o ícone do destaque' }).click()
  await page.getByRole('button', { name: 'Usar 🌿' }).click()
  await expect(callout.getByRole('button', { name: 'Trocar o ícone do destaque' })).toHaveText('🌿')

  await settle(page)
  await page.reload()
  await expect(surface(page)).toBeVisible()
  await expect(blocks(page, 'callout')).toContainText('Um passo de cada vez')
  await expect(
    blocks(page, 'callout').getByRole('button', { name: 'Trocar o ícone do destaque' }),
  ).toHaveText('🌿')
})

test('"/" → "Página" creates a subpage, opens it with the title focused and links back', async ({
  page,
  run,
}) => {
  const parent = await newPage(run, 'mae')
  await openPage(page, parent)
  await focusEnd(page)

  await insertFromSlashMenu(page, 'pági', '^Página')
  await page.waitForURL((url) => url.pathname.startsWith('/p/') && !url.pathname.endsWith(parent))
  const childPath = new URL(page.url()).pathname
  const title = page.getByRole('textbox', { name: 'Título da página' })
  await expect(title).toBeFocused()
  await page.keyboard.type(`${run.prefix}filha`)
  // O título salva 600 ms depois de parar de digitar.
  await page.waitForTimeout(900)

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/p/${parent}$`))
  const link = blocks(page, 'pageLink').getByRole('link', { name: `${run.prefix}filha` })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${childPath}$`))
})

test('"/" → "Link para página" links an existing page and follows it to the trash and away', async ({
  page,
  run,
}) => {
  const source = await newPage(run, 'origem')
  const target = await newPage(run, 'destino-do-link')
  await openPage(page, source)
  await focusEnd(page)

  await insertFromSlashMenu(page, 'link para', 'Link para página')
  const picker = page.getByRole('dialog', { name: 'Link para página' })
  await expect(picker).toBeVisible()
  await picker
    .getByRole('combobox', { name: 'Buscar a página do link' })
    .fill(`${run.prefix}destino`)
  await picker.getByRole('option', { name: new RegExp(`${run.prefix}destino-do-link`) }).click()
  await expect(picker).toBeHidden()

  const link = () => blocks(page, 'pageLink').getByRole('link')
  await expect(link()).toHaveText(`${run.prefix}destino-do-link`)
  await settle(page)

  // Na lixeira: continua clicável, marcado, e abre só para leitura.
  const trashed = await run.api.client.rpc('trash_page', { p_page_id: target })
  expect(trashed.error).toBeNull()
  await openPage(page, source)
  await expect(link()).toHaveAccessibleName(`${run.prefix}destino-do-link (na lixeira)`)
  await link().click()
  await expect(page).toHaveURL(new RegExp(`/p/${target}$`))
  await expect(
    page.getByText('Esta página está na lixeira. Para editá-la, restaure-a.'),
  ).toBeVisible()

  // Apagada de vez: o link vira "Página indisponível".
  const deleted = await run.api.client.from('pages').delete().eq('id', target)
  expect(deleted.error).toBeNull()
  await openPage(page, source)
  await expect(blocks(page, 'pageLink')).toContainText('Página indisponível')
  await expect(blocks(page, 'pageLink').getByRole('link')).toHaveCount(0)
})

test.describe('block menu (⋮⋮)', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 768,
    'alça do iPhone na barra do teclado: Fase 2c-2',
  )

  test('transforms, colors (also by searching), duplicates and deletes blocks', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'menu-do-bloco')
    await openPage(page, id)
    await focusEnd(page)
    await page.keyboard.type('Primeiro')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Segundo')
    await page.keyboard.press('Enter')
    await insertFromSlashMenu(page, 'destaq', 'Destaque')
    await page.keyboard.type('Nota')

    // Transformar em › Título 1
    await openBlockMenu(page, blocks(page, 'paragraph').filter({ hasText: 'Primeiro' }))
    await chooseInBlockMenu(page, 'Transformar em', 'Título 1')
    await expect(blocks(page, 'heading')).toHaveText('Primeiro')

    // Cor pela busca: "fundo verde"
    await openBlockMenu(page, blocks(page, 'heading'))
    await blockMenu(page).fill('fundo verde')
    await chooseInBlockMenu(page, 'Cor › Fundo › Verde')
    await expect(page.locator('.bn-block[data-background-color="green"]')).toContainText('Primeiro')

    // Cor do destaque pelo submenu
    await openBlockMenu(page, blocks(page, 'callout'))
    await chooseInBlockMenu(page, 'Cor', 'Fundo Marrom')
    await expect(page.locator('.bn-block[data-background-color="brown"]')).toContainText('Nota')

    // Duplicar e Excluir
    const second = () => blocks(page, 'paragraph').filter({ hasText: 'Segundo' })
    await openBlockMenu(page, second())
    await chooseInBlockMenu(page, 'Duplicar')
    await expect(second()).toHaveCount(2)
    await openBlockMenu(page, second().last())
    await chooseInBlockMenu(page, 'Excluir')
    await expect(second()).toHaveCount(1)

    await settle(page)
    await page.reload()
    await expect(page.locator('.bn-block[data-background-color="green"]')).toContainText('Primeiro')
    await expect(blocks(page, 'heading')).toHaveText('Primeiro')
    await expect(second()).toHaveCount(1)
  })

  test('keyboard: Ctrl+D duplicates, Ctrl+/ opens the menu and Del deletes', async ({
    page,
    run,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'teclado físico: só no desktop')
    const id = await newPage(run, 'atalhos-do-bloco')
    await openPage(page, id)
    await focusEnd(page)
    await page.keyboard.type('Repetido')

    await page.keyboard.press('Control+d')
    const repeated = blocks(page, 'paragraph').filter({ hasText: 'Repetido' })
    await expect(repeated).toHaveCount(2)

    await page.keyboard.press('Control+/')
    await expect(blockMenu(page)).toBeFocused()
    await page.keyboard.press('Delete')
    await expect(repeated).toHaveCount(1)

    // No título da página o Ctrl+D não é do bloco.
    await page.getByRole('textbox', { name: 'Título da página' }).focus()
    await page.keyboard.press('Control+d')
    await expect(repeated).toHaveCount(1)
  })

  test('"Link para o bloco" copies the link; opening it scrolls to the block and highlights it', async ({
    page,
    context,
    run,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'área de transferência: só no Chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const id = await newPage(run, 'link-do-bloco')
    await openPage(page, id)
    await focusEnd(page)
    for (let line = 1; line <= 30; line += 1) {
      await page.keyboard.type(`Linha ${String(line)}`)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.type('Bloco do link')
    await page.keyboard.press('Alt+Shift+L')
    await expect(page.getByText('Link do bloco copiado.')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toMatch(new RegExp(`/p/${id}#bloco-[0-9a-f-]+$`))

    // Pelo teclado: Ctrl+/ abre o menu do bloco do cursor.
    await page.keyboard.press('Control+/')
    await expect(blockMenu(page)).toBeFocused()
    await chooseInBlockMenu(page, 'Link para o bloco')
    await expect(page.getByText('Link do bloco copiado.')).toBeVisible()

    await settle(page)
    await page.goto(url)
    const target = page.locator(`.bn-block-outer[data-id="${url.split('#bloco-')[1] ?? ''}"]`)
    await expect.poll(() => isHighlighted(target)).toBe(true)
    await expect(target).toContainText('Bloco do link')
    await expect(target).toBeInViewport()
    await expect.poll(() => isHighlighted(target), { timeout: 4000 }).toBe(false)
  })
})

test('opening a block link scrolls to the block on every device', async ({ page, run }) => {
  const id = await newPage(run, 'link-do-bloco-toque')
  await openPage(page, id)
  await focusEnd(page)
  for (let line = 1; line <= 25; line += 1) {
    await page.keyboard.type(`Linha ${String(line)}`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('Alvo')
  const blockId = await page
    .locator('.bn-block-outer')
    .filter({ hasText: 'Alvo' })
    .last()
    .getAttribute('data-id')
  await settle(page)

  await openPage(page, id, `#bloco-${blockId ?? ''}`)
  const target = page.locator(`.bn-block-outer[data-id="${blockId ?? ''}"]`)
  await expect.poll(() => isHighlighted(target)).toBe(true)
  await expect(target).toBeInViewport()
})

test('links stay clickable in a page that is in the trash', async ({ page, run }) => {
  const source = await newPage(run, 'lixeira-com-link')
  const target = await newPage(run, 'destino-vivo')
  await openPage(page, source)
  await focusEnd(page)
  await insertFromSlashMenu(page, 'link para', 'Link para página')
  const picker = page.getByRole('dialog', { name: 'Link para página' })
  await picker.getByRole('combobox').fill(`${run.prefix}destino-vivo`)
  await picker.getByRole('option', { name: new RegExp(`${run.prefix}destino-vivo`) }).click()
  await expect(blocks(page, 'pageLink').getByRole('link')).toBeVisible()
  await settle(page)

  const trashed = await run.api.client.rpc('trash_page', { p_page_id: source })
  expect(trashed.error).toBeNull()
  await openPage(page, source)
  await expect(surface(page)).toHaveAttribute('contenteditable', 'false')
  await blocks(page, 'pageLink').getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/p/${target}$`))
})

test.describe('block link through the sign-in', () => {
  test.use({ storageState: SIGNED_OUT_STATE })

  test('opening /p/:id#bloco-<id> without a session goes through /entrar and lands on the highlighted block', async ({
    page,
    run,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'fluxo de login: basta um navegador')
    const id = await newPage(run, 'link-depois-do-login')
    await signInThroughUi(page, E2E_USER_1)
    await openPage(page, id)
    await focusEnd(page)
    for (let line = 1; line <= 25; line += 1) {
      await page.keyboard.type(`Linha ${String(line)}`)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.type('Alvo depois do login')
    const blockId =
      (await page
        .locator('.bn-block-outer')
        .filter({ hasText: 'Alvo depois do login' })
        .last()
        .getAttribute('data-id')) ?? ''
    await settle(page)

    // A sessão some deste aparelho (sem "Sair", que apagaria os dados locais): o próximo acesso pede login.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) localStorage.removeItem(key)
      }
    })
    // Sai do app antes: mudar só o hash não recarrega a página (a sessão em memória continuaria).
    await page.goto('about:blank')
    await page.goto(`/p/${id}#bloco-${blockId}`)
    await expect(page).toHaveURL(/\/entrar$/)
    await page.getByLabel('E-mail').fill(E2E_USER_1.email)
    await page.getByLabel('Senha', { exact: true }).fill(E2E_USER_1.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/p/${id}#bloco-${blockId}$`))
    const target = page.locator(`.bn-block-outer[data-id="${blockId}"]`)
    await expect.poll(() => isHighlighted(target)).toBe(true)
    await expect(target).toBeInViewport()
  })
})

test('pasted text and HTML only become links with http, https or mailto', async ({
  page,
  context,
  run,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'área de transferência: só no Chromium')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const id = await newPage(run, 'colar-links')
  await openPage(page, id)
  await focusEnd(page)

  await page.evaluate(() =>
    navigator.clipboard.writeText(
      'javascript:alert(1) data:text/html,oi https://exemplo.com mailto:ana@exemplo.com',
    ),
  )
  await page.keyboard.press('Control+v')
  await page.keyboard.press('Enter')
  await page.evaluate(async () => {
    const html =
      '<p><a href="javascript:alert(2)">perigo</a> <a href="data:text/html,x">dados</a> <a href="https://seguro.exemplo/">seguro</a></p>'
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob(['perigo dados seguro'], { type: 'text/plain' }),
      }),
    ])
  })
  await page.keyboard.press('Control+v')

  await expect(surface(page)).toContainText('seguro')
  const hrefs = await surface(page)
    .locator('a')
    .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''))
  expect(hrefs).toEqual(
    expect.arrayContaining([
      'https://exemplo.com',
      'mailto:ana@exemplo.com',
      'https://seguro.exemplo/',
    ]),
  )
  for (const href of hrefs) expect(href).not.toMatch(/^\s*(javascript|data|vbscript):/i)
  const external = surface(page).locator('a[href="https://seguro.exemplo/"]')
  await expect(external).toHaveAttribute('rel', /noopener/)
  await expect(external).toHaveAttribute('rel', /noreferrer/)

  // O clique abre em outra aba SEM `window.opener` (a página aberta não alcança o AxeNotes).
  await context.route('https://seguro.exemplo/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>externo</p>' }),
  )
  const popupPromise = context.waitForEvent('page')
  await external.click()
  const popup = await popupPromise
  expect(await popup.evaluate(() => window.opener === null)).toBe(true)
  await popup.close()
})
