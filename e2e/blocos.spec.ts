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
