import { expect, test, type Page } from '@playwright/test'

// Mesmo corte do app (`md` do Tailwind): a partir de 768 px a sidebar é fixa.
function isWide(page: Page): boolean {
  const size = page.viewportSize()
  return size !== null && size.width >= 768
}

test.describe('layout', () => {
  let errors: string[] = []

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Página inicial' })).toBeVisible()
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('uses the dark theme and Inter, with no horizontal scroll', async ({ page }) => {
    await expect(page).toHaveTitle('AxeNotes')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)')

    const inter = await page.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('16px "Inter Variable"')
    })
    expect(inter).toBe(true)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('shows the sidebar or the drawer depending on the viewport', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navegação principal' })
    const menuButton = page.getByRole('button', { name: 'Abrir menu' })

    if (isWide(page)) {
      await expect(nav).toBeVisible()
      await expect(menuButton).toHaveCount(0)
      const box = await page.locator('aside').boundingBox()
      expect(box?.width).toBe(240)
      return
    }

    await expect(nav).toHaveCount(0)
    await expect(menuButton).toBeVisible()

    const box = await menuButton.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)

    await menuButton.tap()
    const drawer = page.getByRole('dialog', { name: 'Menu de navegação' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(menuButton).toBeFocused()
  })

  test('closes the drawer after choosing a link on small screens', async ({ page }) => {
    test.skip(isWide(page), 'A gaveta só existe abaixo de 768 px.')

    await page.getByRole('button', { name: 'Abrir menu' }).tap()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('link', { name: 'Página inicial' }).tap()
    await expect(drawer).toHaveCount(0)
  })

  test('shows the not found page for unknown routes', async ({ page }) => {
    await page.goto('/nao-existe')
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })
})
