// Orçamento de tamanho do build (gzip): falha se um dos chunks principais passar do limite.
// Os chunks são achados pelo nome (index.html para a entrada; prefixo app-routes/PageEditor), não pelo hash.
// Rodar depois do build: pnpm run size:check
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

// Limites em kB (1000 bytes) de gzip no nível padrão do zlib = medido por este script em 2026-10-26, na
// Fase 2c-2 (comentário de cada linha) + ~10% de folga. Subiu de propósito? Ajuste aqui e explique no PR.
// O CSS do editor (PageEditor-*.css) entrou na 2c-2: até então não tinha orçamento.
export const BUDGETS = [
  { label: 'entrada JS', source: { entry: 'js' }, limitKb: 10 }, // 8,91
  { label: 'rotas do app', source: { prefix: 'app-routes', ext: '.js' }, limitKb: 84 }, // 76,14
  { label: 'editor', source: { prefix: 'PageEditor', ext: '.js' }, limitKb: 405 }, // 368,51
  { label: 'CSS de entrada', source: { entry: 'css' }, limitKb: 8.1 }, // 7,38
  { label: 'CSS do editor', source: { prefix: 'PageEditor', ext: '.css' }, limitKb: 18 }, // 16,30
]

/** Arquivos de entrada referenciados pelo index.html do build (só os de /assets/). */
export function entryAssets(html) {
  const js = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="\/assets\/([^"]+)"/g)]
  const css = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/assets\/([^"]+)"/g)]
  return { js: js.map((match) => match[1]), css: css.map((match) => match[1]) }
}

/** Acha o único chunk `<prefixo>-<hash><ext>` em `files`; lança se não houver um só. */
export function findChunk(files, prefix, ext) {
  const pattern = new RegExp(`^${prefix}-[\\w-]+${ext.replace('.', '\\.')}$`)
  const matches = files.filter((file) => pattern.test(file))
  if (matches.length !== 1) {
    throw new Error(
      `Esperava 1 chunk ${prefix}-*${ext}, achei ${matches.length}: ${matches.join(', ')}`,
    )
  }
  return matches[0]
}

/** Resolve o arquivo de cada orçamento a partir da lista de assets e do index.html. */
export function resolveBudgetFiles(budgets, files, html) {
  const entries = entryAssets(html)
  return budgets.map((budget) => {
    const { source } = budget
    if ('entry' in source) {
      const found = entries[source.entry]
      if (found.length !== 1) {
        throw new Error(`Esperava 1 ${budget.label} no index.html, achei ${found.length}.`)
      }
      return { ...budget, file: found[0] }
    }
    return { ...budget, file: findChunk(files, source.prefix, source.ext) }
  })
}

/** Compara o gzip (em bytes) de cada arquivo com o limite. */
export function evaluate(resolved, gzipBytesOf) {
  return resolved.map((budget) => {
    const gzipKb = gzipBytesOf(budget.file) / 1000
    return { ...budget, gzipKb, ok: gzipKb <= budget.limitKb }
  })
}

function main() {
  const dist = 'dist'
  const assets = join(dist, 'assets')
  const files = readdirSync(assets)
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const results = evaluate(
    resolveBudgetFiles(BUDGETS, files, html),
    (file) => gzipSync(readFileSync(join(assets, file))).length,
  )

  for (const { label, file, gzipKb, limitKb, ok } of results) {
    const status = ok ? 'ok   ' : 'ACIMA'
    console.log(
      `${status} ${label.padEnd(15)} ${gzipKb.toFixed(2).padStart(7)} / ${String(limitKb).padStart(3)} kB gzip  ${file}`,
    )
  }

  if (results.some((result) => !result.ok)) {
    console.error(
      'Orçamento de bundle estourado. Veja os limites em scripts/check-bundle-size.mjs.',
    )
    process.exit(1)
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) main()
