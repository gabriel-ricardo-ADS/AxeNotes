import { test as setup } from '@playwright/test'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { apiSessionBySignIn, E2E_PREFIX, MAX_LEFTOVERS, removePagesWithPrefix } from './support/pages-api'

// Antes de tudo, remove sobras de execuções anteriores: só páginas "e2e-…" do usuário de teste 1.
// Se houver mais de MAX_LEFTOVERS, falha SEM apagar nada (e os demais projetos nem começam).
setup('remove leftover e2e pages of test user 1', async () => {
  setup.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

  const session = await apiSessionBySignIn()
  const { removed, skipped } = await removePagesWithPrefix(session, E2E_PREFIX, MAX_LEFTOVERS)
  console.log(`Limpeza inicial: ${String(removed)} subárvore(s) removida(s), ${String(skipped)} ignorada(s).`)
  await session.client.auth.signOut({ scope: 'local' })
})
