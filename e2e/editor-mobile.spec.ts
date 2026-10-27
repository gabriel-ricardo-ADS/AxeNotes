import { expect, type Locator } from '@playwright/test'
import {
  blockMenu,
  blocks,
  chooseInBlockMenu,
  focusEnd,
  marginHandle,
  newPage,
  openKeyboard,
  openPage,
  surface,
  touchBar,
} from './support/editor'
import { hasE2ECredentials, SKIP_NO_CREDENTIALS } from './support/env'
import { test } from './support/run-fixture'

// Editor no toque (Fase 2c-2): barra acima do teclado, painéis Aa e "/", alça do iPad. O teclado é
// emulado reduzindo a altura do viewport (openKeyboard). Só páginas e2e- do usuário de teste 1.

test.skip(!hasE2ECredentials, SKIP_NO_CREDENTIALS)

test.describe('touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'barra do teclado: só no toque')

  test('the bar shows above the keyboard and its bottom stays inside the viewport', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'barra')
    await openPage(page, id)
    await focusEnd(page)
    await expect(touchBar(page)).toHaveCount(0)
    await openKeyboard(page)
    await expect(touchBar(page)).toBeVisible()
    const box = await touchBar(page).boundingBox()
    const height = page.viewportSize()?.height ?? 0
    expect(box).not.toBeNull()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height + 1)
  })

  test('Tarefa toggles a checklist and back; Desfazer undoes; Fechar teclado hides the bar', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'tarefa')
    await openPage(page, id)
    await focusEnd(page)
    await page.keyboard.type('Comprar pão')
    await openKeyboard(page)
    const task = touchBar(page).getByRole('button', { name: 'Lista de tarefas' })
    await task.tap()
    await expect(blocks(page, 'checkListItem')).toHaveText('Comprar pão')
    await expect(task).toHaveAttribute('aria-pressed', 'true')
    await task.tap()
    await expect(blocks(page, 'checkListItem')).toHaveCount(0)
    await expect(blocks(page, 'paragraph').first()).toHaveText('Comprar pão')

    await page.keyboard.type(' integral')
    await expect(surface(page)).toContainText('Comprar pão integral')
    await touchBar(page).getByRole('button', { name: 'Desfazer' }).tap()
    await expect(surface(page)).not.toContainText('integral')
    await touchBar(page).getByRole('button', { name: 'Refazer' }).tap()
    await expect(surface(page)).toContainText('Comprar pão integral')

    await touchBar(page).getByRole('button', { name: 'Fechar teclado' }).tap()
    await expect(touchBar(page)).toHaveCount(0)
  })

  test('"/" opens a panel above the bar that inserts a heading; the keyboard stays', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'barra-slash')
    await openPage(page, id)
    await focusEnd(page)
    await openKeyboard(page)
    await touchBar(page).getByRole('button', { name: 'Inserir bloco' }).tap()
    const heading = page.getByRole('option', { name: /^Título Usado/ }).first()
    await expect(heading).toBeVisible()
    // O painel fica inteiro acima da barra e dentro da tela.
    const panel = await page.locator('.axn-touch-slash').boundingBox()
    const bar = await touchBar(page).boundingBox()
    expect(panel && bar).toBeTruthy()
    expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 1)
    expect(panel?.y ?? -1).toBeGreaterThanOrEqual(0)
    // O filtro continua pelo texto digitado depois do "/".
    await page.keyboard.type('tít')
    await page
      .getByRole('option', { name: /^Título Usado/ })
      .first()
      .tap()
    await page.keyboard.type('Capítulo')
    await expect(blocks(page, 'heading')).toHaveText('Capítulo')
    await expect(blocks(page, 'heading').locator('h1')).toHaveText('Capítulo')
    await expect(touchBar(page)).toBeVisible()
  })

  test('Aa applies bold and there is a single toolbar with text selected', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'barra-aa')
    await openPage(page, id)
    await focusEnd(page)
    await page.keyboard.type('leve ')
    await openKeyboard(page)
    await touchBar(page).getByRole('button', { name: 'Formatação' }).tap()
    await page.getByRole('button', { name: 'Negrito' }).tap()
    await page.keyboard.type('forte')
    await expect(surface(page).locator('strong')).toHaveText('forte')

    // Com texto selecionado: só a nossa barra (a flutuante do desktop não aparece junto).
    await page.keyboard.press('Shift+Home')
    await expect(touchBar(page)).toBeVisible()
    await expect(page.locator('.bn-formatting-toolbar:visible')).toHaveCount(0)
    await expect(page.getByRole('toolbar').filter({ visible: true })).toHaveCount(1)
  })

  test('⋮⋮ opens the block sheet and "Transformar em" goes straight to its list', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'barra-menu')
    await openPage(page, id)
    await focusEnd(page)
    await page.keyboard.type('Ideia solta')
    await openKeyboard(page)

    await touchBar(page).getByRole('button', { name: 'Opções do bloco' }).tap()
    await expect(blockMenu(page)).toBeVisible()
    // O teclado fecha antes do sheet (o editor perde o foco): a barra some.
    await expect(touchBar(page)).toHaveCount(0)
    await chooseInBlockMenu(page, 'Transformar em', 'Lista com Marcadores')
    await expect(blocks(page, 'bulletListItem')).toHaveText('Ideia solta')
    await expect(blockMenu(page)).toHaveCount(0)

    // O próximo toque reabre o teclado; "Transformar em" abre direto na lista de tipos.
    await blocks(page, 'bulletListItem').tap()
    await expect(touchBar(page)).toBeVisible()
    await touchBar(page).getByRole('button', { name: 'Transformar em' }).tap()
    await expect(page.getByRole('listbox', { name: 'Transformar em' })).toBeVisible()
    await chooseInBlockMenu(page, 'Citação')
    await expect(blocks(page, 'quote')).toHaveText('Ideia solta')
  })

  test('iPad: the margin handle shows after touching a block and opens the block sheet', async ({
    page,
    run,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, 'alça da margem: só no iPad')
    const id = await newPage(run, 'alca-ipad')
    await openPage(page, id)
    await expect(marginHandle(page)).toHaveCount(0)
    await focusEnd(page)
    await page.keyboard.type('Primeiro')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Segundo')
    await blocks(page, 'paragraph').filter({ hasText: 'Primeiro' }).tap()
    await expect(marginHandle(page)).toHaveCount(1)
    await expect(marginHandle(page)).toHaveAccessibleName('Opções do bloco')
    const first = blocks(page, 'paragraph').filter({ hasText: 'Primeiro' })
    // Na margem, à esquerda do bloco, centrada na linha dele.
    await expect
      .poll(async () => {
        const handle = await marginHandle(page).boundingBox()
        const line = await first.boundingBox()
        if (!handle || !line) return null
        return {
          width: handle.width,
          leftOfBlock: handle.x + handle.width <= line.x,
          centered: Math.abs(handle.y + handle.height / 2 - (line.y + line.height / 2)) < 4,
        }
      })
      .toEqual({ width: 44, leftOfBlock: true, centered: true })
    // Nada do side menu do hover no toque: uma alça só.
    await expect(page.locator('.bn-side-menu')).toHaveCount(0)

    await marginHandle(page).tap()
    await expect(blockMenu(page)).toBeVisible()
    await chooseInBlockMenu(page, 'Duplicar')
    await expect(blocks(page, 'paragraph').filter({ hasText: 'Primeiro' })).toHaveCount(2)
  })

  test('typing at the end of a long page keeps the cursor above the bar and the "/" panel', async ({
    page,
    run,
  }) => {
    const id = await newPage(run, 'pagina-longa')
    await openPage(page, id)
    await focusEnd(page)
    for (let line = 1; line <= 30; line += 1) {
      await page.keyboard.type(`Linha ${String(line)}`)
      await page.keyboard.press('Enter')
    }
    await openKeyboard(page)
    await expect(touchBar(page)).toBeVisible()
    await page.keyboard.type('Escrevendo no fim')
    const typing = blocks(page, 'paragraph').filter({ hasText: 'Escrevendo no fim' })
    const bottomOf = async (locator: Locator) => {
      const box = await locator.boundingBox()
      return box ? box.y + box.height : Number.NaN
    }
    await expect
      .poll(async () => (await bottomOf(typing)) <= ((await touchBar(page).boundingBox())?.y ?? 0))
      .toBe(true)

    await page.keyboard.press('Enter')
    await touchBar(page).getByRole('button', { name: 'Inserir bloco' }).tap()
    await expect(page.getByRole('option').first()).toBeVisible()
    const slashLine = blocks(page, 'paragraph').last()
    await expect
      .poll(async () => {
        const panel = await page.locator('.axn-touch-slash').boundingBox()
        return (await bottomOf(slashLine)) <= (panel?.y ?? 0)
      })
      .toBe(true)
  })

  for (const [width, height] of [
    [320, 568],
    [390, 844],
  ] as const) {
    test(`with Aa open the cursor line stays above the panel (${String(width)}×${String(height)})`, async ({
      page,
      run,
    }) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 768, 'tela de iPhone')
      await page.setViewportSize({ width, height })
      // Título longo: ele e a linha "Editada há…" ocupam a tela e empurram o editor para baixo.
      const id = await newPage(run, 'barra-aa-cursor-com-um-titulo-que-quebra-em-varias-linhas')
      await openPage(page, id)
      await focusEnd(page)
      for (let line = 1; line <= 3; line += 1) {
        await page.keyboard.type(`Linha ${String(line)}`)
        await page.keyboard.press('Enter')
      }
      await page.keyboard.type('Texto a formatar')
      await openKeyboard(page)
      // "Fechar teclado" fica à vista mesmo com a barra mais larga que a tela.
      await expect(touchBar(page).getByRole('button', { name: 'Fechar teclado' })).toBeInViewport({
        ratio: 1,
      })
      await touchBar(page).getByRole('button', { name: 'Formatação' }).tap()
      const line = blocks(page, 'paragraph').filter({ hasText: 'Texto a formatar' })
      const aboveDock = async () => {
        const box = await line.boundingBox()
        const dock = await page.locator('.axn-touch-dock').boundingBox()
        return box && dock ? box.y + box.height <= dock.y : false
      }
      await expect.poll(aboveDock).toBe(true)
      // Continua acima depois que o indicador de salvamento assenta (ele pode mudar de altura).
      await page.waitForTimeout(1500)
      await expect.poll(aboveDock).toBe(true)
    })
  }
})

test('desktop: no touch bar even with a short window, and "/" stays the popover at the cursor', async ({
  page,
  run,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop (ponteiro fino)')
  const id = await newPage(run, 'desktop-sem-barra')
  await openPage(page, id)
  await focusEnd(page)
  await openKeyboard(page)
  await page.keyboard.type('/')
  await expect(page.getByRole('option').first()).toBeVisible()
  await expect(touchBar(page)).toHaveCount(0)
  await expect(page.locator('.axn-touch-slash')).toHaveCount(0)
  await expect(marginHandle(page)).toHaveCount(0)
})
