import { expect, test, type Page } from '@playwright/test'
import { E2E_USER_1, hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { openNavigation, SIGNED_OUT_STATE, signInThroughUi } from './support/ui'

const home = (page: Page) => page.getByRole('heading', { level: 1, name: 'Página inicial' })

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT_STATE })

  test('shows the sign-in screen with accessible, iOS-friendly fields', async ({ page }) => {
    await page.goto('/entrar')

    await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
    const email = page.getByLabel('E-mail')
    const password = page.getByLabel('Senha', { exact: true })
    await expect(email).toHaveAttribute('autocomplete', 'username')
    await expect(password).toHaveAttribute('autocomplete', 'current-password')

    // 16 px evita o zoom automático do Safari no iOS; 44 px é o alvo mínimo de toque.
    expect(await email.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')
    const box = await page.getByRole('button', { name: 'Entrar', exact: true }).boundingBox()
    const isTouch = (page.viewportSize()?.width ?? 1440) < 768
    if (isTouch) expect(box?.height).toBeGreaterThanOrEqual(44)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('shows a generic error for a wrong password and stays on the screen', async ({ page }) => {
    await page.goto('/entrar')
    // E-mail fictício: a mensagem é a mesma exista a conta ou não.
    await page.getByLabel('E-mail').fill('ninguem@exemplo.test')
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()

    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await expect(page).toHaveURL(/\/entrar$/)
  })

  test('sends a protected route to /entrar', async ({ page }) => {
    await page.goto('/p/qualquer?x=1')

    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
  })

  test('returns to the original route after signing in', async ({ page }) => {
    test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

    await page.goto('/p/qualquer?x=1')
    await expect(page).toHaveURL(/\/entrar$/)
    await page.getByLabel('E-mail').fill(E2E_USER_1.email)
    await page.getByLabel('Senha', { exact: true }).fill(E2E_USER_1.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()

    await expect(page).toHaveURL(/\/p\/qualquer\?x=1$/)
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })

  test('links to the other auth screens', async ({ page }) => {
    await page.goto('/entrar')

    await page.getByRole('link', { name: 'Esqueci a senha' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recuperar senha' })).toBeVisible()

    await page.goto('/entrar')
    await page.getByRole('link', { name: 'Criar conta' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible()
  })

  test('validates the sign-up form before calling the server', async ({ page }) => {
    await page.goto('/criar-conta')
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()

    await expect(page.getByText('Informe seu nome.')).toBeVisible()
    await expect(page.getByText('Informe o e-mail.')).toBeVisible()
    await expect(page.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeVisible()
  })

  test('asks for the e-mail on /codigo when opened without state', async ({ page }) => {
    await page.goto('/codigo')

    await expect(page.getByRole('heading', { level: 1, name: 'Confirme seu e-mail' })).toBeVisible()
    await expect(page.getByLabel('E-mail')).toBeVisible()
    const code = page.getByLabel('Código de 6 dígitos')
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(code).toHaveAttribute('inputmode', 'numeric')
  })
})

test.describe('signed in (session saved by the setup project)', () => {
  test.beforeEach(() => {
    test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)
  })

  test('opens the app and keeps the session after a reload', async ({ page }) => {
    await page.goto('/')
    await expect(home(page)).toBeVisible()

    await page.reload()
    await expect(home(page)).toBeVisible()
  })

  test('sends a signed-in user away from the auth screens', async ({ page }) => {
    await page.goto('/entrar')

    await expect(home(page)).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('shows the user name and the sign-out button in the sidebar', async ({ page }) => {
    await page.goto('/')
    await openNavigation(page)

    const account = page.getByRole('region', { name: 'Conta' })
    await expect(account.getByRole('button', { name: 'Sair' })).toBeVisible()
    await expect(account.locator('p')).not.toHaveText('')
  })
})

test.describe('sign out', () => {
  // Login próprio: sair revoga a sessão e não pode derrubar a sessão salva dos outros testes.
  test.use({ storageState: SIGNED_OUT_STATE })

  test('signs out, goes to /entrar and protects the app again', async ({ page }) => {
    test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

    await signInThroughUi(page, E2E_USER_1)
    await openNavigation(page)
    await page.getByRole('button', { name: 'Sair' }).click()

    await expect(page).toHaveURL(/\/entrar$/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/entrar$/)
  })
})
