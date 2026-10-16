import { expect, type Page } from '@playwright/test'
import type { TestUser } from './env'

/** Entra pela tela /entrar e espera sair dela (a sidebar do mobile só existe dentro da gaveta). */
export async function signInThroughUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL((url) => url.pathname !== '/entrar')
}

/** Abaixo de 768 px a sidebar vive numa gaveta: abre pelo ☰ quando ele existe. */
export async function openNavigation(page: Page): Promise<void> {
  const menuButton = page.getByRole('button', { name: 'Abrir menu' })
  const sidebar = page.getByRole('navigation', { name: 'Navegação principal' })
  // Espera o app renderizar (☰ no mobile, sidebar no desktop) antes de decidir.
  await expect(menuButton.or(sidebar)).toBeVisible()
  if (await menuButton.isVisible()) {
    await menuButton.tap()
    await expect(page.getByRole('dialog', { name: 'Menu de navegação' })).toBeVisible()
  }
}

/** Sessão vazia: para os testes que precisam estar deslogados. */
export const SIGNED_OUT_STATE = { cookies: [], origins: [] }
