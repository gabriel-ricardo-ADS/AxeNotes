import { expect, test as setup } from '@playwright/test'
import { authFile, E2E_USER_1, hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { signInThroughUi } from './support/ui'

// Um login por projeto (desktop, mobile, tablet): a sessão fica salva em e2e/.auth/ e os demais
// testes a reaproveitam, o que mantém o número de logins abaixo do limite do Supabase.
setup('login with the test user and save the session', async ({ page }, testInfo) => {
  setup.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

  await signInThroughUi(page, E2E_USER_1)
  await expect(page.getByRole('heading', { level: 1, name: 'Página inicial' })).toBeVisible()

  const project = testInfo.project.name.replace(/-setup$/, '')
  await page.context().storageState({ path: authFile(project) })
})
