import { expect, type Page } from '@playwright/test'
import type { TestUser } from './env'

/** ☰ no mobile (a sidebar só existe dentro da gaveta) ou a sidebar no desktop. */
function navigationEntry(page: Page) {
  const menuButton = page.getByRole('button', { name: 'Abrir menu' })
  const sidebar = page.getByRole('navigation', { name: 'Navegação principal' })
  return { menuButton, either: menuButton.or(sidebar) }
}

/**
 * Entra pela tela /entrar e espera o app logado assentar em "/". Sair de /entrar não basta: o
 * redirecionamento para "/" ainda pode estar em curso e interromper o próximo page.goto().
 */
export async function signInThroughUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/')
  await expect(navigationEntry(page).either).toBeVisible()
}

/** Abaixo de 768 px a sidebar vive numa gaveta: abre pelo ☰ quando ele existe. */
export async function openNavigation(page: Page): Promise<void> {
  const { menuButton, either } = navigationEntry(page)
  // Espera o app renderizar (☰ no mobile, sidebar no desktop) antes de decidir.
  await expect(either).toBeVisible()
  if (await menuButton.isVisible()) {
    await menuButton.tap()
    await expect(page.getByRole('dialog', { name: 'Menu de navegação' })).toBeVisible()
  }
}

/** Sessão vazia: para os testes que precisam estar deslogados. */
export const SIGNED_OUT_STATE = { cookies: [], origins: [] }
