import { test as base } from '@playwright/test'
import {
  apiSession,
  newRunPrefix,
  removePagesByIds,
  removePagesWithPrefix,
  type ApiSession,
} from './pages-api'

// Estes testes ESCREVEM no projeto Supabase real, só nos dados do usuário de teste 1. Todo título
// criado começa com o prefixo único do teste ("e2e-<projeto>-<aleatório>-"); no fim de cada teste
// (mesmo se falhar) só as páginas com esse prefixo são apagadas, pela API.

export interface Run {
  prefix: string
  api: ApiSession
}

export const test = base.extend<{ run: Run }>({
  run: async ({ page }, provide, testInfo) => {
    const project = testInfo.project.name
    const api = await apiSession(project)
    const prefix = newRunPrefix(project)
    // Páginas criadas pela interface nascem com título vazio: guarda os ids dos POSTs deste teste.
    const created: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/rest/v1/pages')) return
      try {
        const body = JSON.parse(request.postData() ?? '{}') as { id?: unknown }
        if (typeof body.id === 'string') created.push(body.id)
      } catch {
        // corpo que não é JSON: ignora
      }
    })
    try {
      await provide({ prefix, api })
    } finally {
      await removePagesByIds(api, created)
      await removePagesWithPrefix(api, prefix)
    }
  },
})
