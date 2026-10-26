import { mkdirSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import {
  blocks,
  chooseInBlockMenu,
  insertFromSlashMenu,
  openBlockMenu,
  settle,
  surface,
} from './support/editor'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { test } from './support/run-fixture'
import { openNavigation } from './support/ui'

// Skill verificar-ui (Fase 2c-1): recria a Home de referência (docs/reference/01-home.jpg) SEM colunas,
// com dados fictícios, e tira o print só do artigo (sem a sidebar: nada do usuário de teste no print).
// As páginas nascem pela interface com títulos sem prefixo (para o print); no fim elas ganham o prefixo
// do teste, e o run-fixture apaga.

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

const SCREENSHOTS = '.screenshots'

/** Id da página aberta (`/p/:id`). */
function openPageId(page: Page): string {
  return new URL(page.url()).pathname.replace('/p/', '')
}

async function createSubpage(
  page: Page,
  created: string[],
  icon: string,
  title: string,
): Promise<void> {
  const parent = openPageId(page)
  await insertFromSlashMenu(page, 'pági', '^Página')
  await page.waitForURL((url) => url.pathname.startsWith('/p/') && !url.pathname.endsWith(parent))
  // Registra já: se o teste cair daqui em diante, a página ainda ganha o prefixo e é apagada.
  created.push(openPageId(page))
  const titleField = page.getByRole('textbox', { name: 'Título da página' })
  await expect(titleField).toBeFocused()
  await page.keyboard.type(title)
  // Achado fora do escopo: o ícone escolhido durante a releitura da lista (depois do insert) se perde.
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Adicionar ícone' }).click()
  await page.getByRole('button', { name: `Usar ${icon}` }).click()
  await page.waitForTimeout(900)
  await page.goBack()
  await expect(blocks(page, 'pageLink').getByText(title)).toBeVisible()
}

/** O fim do documento, num parágrafo vazio. */
async function goToEnd(page: Page) {
  // O documento sempre termina num parágrafo vazio (o BlockNote garante). Espera os links de página
  // carregarem (a altura deles muda) e confere que o cursor ficou mesmo nele.
  await expect(surface(page).getByText('Carregando o link…')).toHaveCount(0)
  const last = blocks(page, 'paragraph').last()
  await last.click()
  await expect(last).toHaveAttribute('data-is-empty-and-focused', 'true')
}

test('recreates the reference Home (no columns) with fictional data', async ({
  page,
  run,
}, testInfo) => {
  test.skip(testInfo.project.name === 'tablet', 'prints em 1440×900 e 390×844')
  test.setTimeout(120_000)

  const created: string[] = []
  try {
    await page.goto('/')
    await openNavigation(page)
    await page.getByRole('button', { name: 'Nova página' }).first().click()
    await expect(page.getByRole('textbox', { name: 'Título da página' })).toBeFocused()
    await page.waitForURL((url) => url.pathname.startsWith('/p/'))
    created.push(openPageId(page))
    await page.keyboard.type('Início')
    await page.getByRole('button', { name: 'Adicionar ícone' }).click()
    await page.getByRole('button', { name: 'Usar 🌿' }).click()

    await goToEnd(page)
    await insertFromSlashMenu(page, 'destaq', 'Destaque')
    await page.keyboard.press('ControlOrMeta+i')
    await page.keyboard.type('Um passo de cada vez, todos os dias.')
    // Enter num destaque cria outro destaque: o bloco novo vira parágrafo pelo "/".
    await page.keyboard.press('Enter')
    await insertFromSlashMenu(page, 'parág', 'Parágrafo')
    const callout = blocks(page, 'callout')
    await callout.getByRole('button', { name: 'Trocar o ícone do destaque' }).click()
    await page.getByRole('button', { name: 'Usar ✨' }).click()
    await openBlockMenu(page, callout)
    await chooseInBlockMenu(page, 'Cor', 'Fundo Verde')
    await expect(page.locator('.bn-block[data-background-color="green"]')).toBeVisible()

    await goToEnd(page)
    await insertFromSlashMenu(page, 'expans', 'Lista expansível')
    await page.keyboard.type('Metas do mês')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('- Ler dois livros')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Caminhar três vezes por semana')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Shift+Tab')

    for (const [icon, title] of [
      ['📚', 'Cantinho de leitura'],
      ['💰', 'Controle financeiro'],
      ['🎨', 'Curso de desenho'],
    ] as const) {
      await goToEnd(page)
      await createSubpage(page, created, icon, title)
    }

    await goToEnd(page)
    await page.keyboard.type('https://exemplo.com ')
    await expect(surface(page).locator('a[href="https://exemplo.com"]')).toBeVisible()

    await settle(page)
    // Sem cursor nem alça no print.
    await page.locator('h1').first().click()
    await page.mouse.move(0, 0)
    mkdirSync(SCREENSHOTS, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    await page.locator('article').screenshot({
      path: `${SCREENSHOTS}/${date}-home-referencia-${testInfo.project.name}.png`,
    })
  } finally {
    // Com o prefixo, a faxina do run-fixture apaga (pelos ids criados no teste, só títulos e2e-… ou vazios;
    // pelo prefixo, o resto).
    for (const id of created) {
      const { data } = await run.api.client.from('pages').select('title').eq('id', id).maybeSingle()
      if (data && !data.title.startsWith(run.prefix)) {
        await run.api.client
          .from('pages')
          .update({ title: `${run.prefix}${data.title}` })
          .eq('id', id)
      }
    }
  }
})
