// Hook PostToolUse do Claude Code (.claude/settings.json): formata com o Prettier só o arquivo que o
// Edit/Write acabou de mexer. Lê o JSON do evento no stdin. Usa a API do Prettier (sem spawn), então
// funciona igual no Windows e no Linux. Nunca falha a sessão: erro vai para o stderr e sai com 0.
import { realpathSync } from 'node:fs'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as prettier from 'prettier'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Indica se `file` (absoluto) está dentro de `root`. No Windows a comparação ignora maiúsculas. */
export function isInside(root, file) {
  const rel = relative(root, file)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Formata o arquivo do evento, se for do repositório e o Prettier souber formatá-lo (respeita o
 * .gitignore e o .prettierignore, como o CLI). Devolve o que aconteceu: 'formatted', 'unchanged' ou
 * o motivo de ter pulado.
 */
export async function formatEditedFile(event, root = REPO_ROOT) {
  const filePath = event?.tool_input?.file_path
  if (typeof filePath !== 'string' || filePath === '') return 'skipped: sem file_path'

  const file = resolve(typeof event.cwd === 'string' ? event.cwd : root, filePath)
  if (!isInside(root, file)) return 'skipped: fora do repositório'
  // Um symlink dentro do repo pode apontar para fora: compara também os caminhos reais.
  if (!isInside(await realpath(root), await realpath(file))) return 'skipped: fora do repositório'

  const info = await prettier.getFileInfo(file, {
    ignorePath: [join(root, '.gitignore'), join(root, '.prettierignore')],
    resolveConfig: true,
  })
  if (info.ignored) return 'skipped: ignorado (.gitignore ou .prettierignore)'
  if (info.inferredParser === null) return 'skipped: extensão que o Prettier não formata'

  const source = await readFile(file, 'utf8')
  const options = await prettier.resolveConfig(file)
  const formatted = await prettier.format(source, { ...options, filepath: file })
  if (formatted === source) return 'unchanged'
  await writeFile(file, formatted, 'utf8')
  return 'formatted'
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  try {
    const raw = await readStdin()
    await formatEditedFile(raw.trim() === '' ? null : JSON.parse(raw))
  } catch (error) {
    console.error(`[format-edited-file] ${error instanceof Error ? error.message : String(error)}`)
  }
  process.exit(0)
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) void main()
