import { defineConfig, devices, type Project } from '@playwright/test'
import { authFile, hasE2ECredentials } from './e2e/support/env'

const baseURL = 'http://localhost:5173'

// iPhone e iPad: WebKit, como o Safari dos aparelhos da cliente e do Gabriel.
const uiDevices = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  mobile: { ...devices['iPhone 14'] },
  tablet: { ...devices['iPad (gen 7)'] },
}

// Cada projeto de UI depende de um "setup" que faz 1 login e salva o storageState; os testes que
// precisam estar deslogados limpam o estado com test.use().
const uiProjects = Object.entries(uiDevices).flatMap(([name, use]): Project[] => [
  { name: `${name}-setup`, testMatch: /auth\.setup\.ts/, use },
  {
    name,
    testIgnore: [/auth\.setup\.ts/, /rls-smoke\.spec\.ts/],
    dependencies: [`${name}-setup`],
    use: { ...use, ...(hasE2ECredentials ? { storageState: authFile(name) } : {}) },
  },
])

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    colorScheme: 'dark',
    locale: 'pt-BR',
  },
  projects: [
    ...uiProjects,
    // Smoke de RLS no projeto real (só leitura): fala direto com a API, sem navegador.
    { name: 'api', testMatch: /rls-smoke\.spec\.ts/ },
  ],
  webServer: {
    command: 'pnpm dev --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
