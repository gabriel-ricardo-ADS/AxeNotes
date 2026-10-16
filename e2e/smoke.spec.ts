import { expect, test } from '@playwright/test'

test('loads the app without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')

  await expect(page).toHaveTitle('AxeNotes')
  await expect(page.getByRole('heading', { name: 'AxeNotes' })).toBeVisible()
  expect(errors).toEqual([])
})
