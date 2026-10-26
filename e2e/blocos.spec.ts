import { expect } from '@playwright/test'
import {
  blocks,
  focusEnd,
  insertFromSlashMenu,
  newPage,
  openPage,
  settle,
  surface,
} from './support/editor'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { test } from './support/run-fixture'

// Blocos do AxeNotes (Fase 2c-1): destaque (callout), links de página e subpágina, menu do bloco.
// Só páginas de teste do usuário 1 (prefixo e2e-, run-fixture.ts).

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

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
