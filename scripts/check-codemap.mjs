// Confere as referências do docs/CODEMAP.md: todo `arquivo` e `arquivo:símbolo` citado entre crases
// precisa existir (o arquivo no repositório, o símbolo dentro dele). Sem dependências, só node:fs.
// Rodar com: pnpm run codemap:check
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Pastas da raiz que o CODEMAP pode citar. Caminho com barra que não começa por uma delas é erro. */
export const ROOT_DIRS = [
  'src',
  'e2e',
  'scripts',
  'supabase',
  'docs',
  'public',
  '.claude',
  '.github',
]

/** Extensões que identificam "isto é um arquivo". Um nome assim sem caminho completo é erro. */
const FILE_EXTENSIONS = [
  'ts',
  'tsx',
  'mjs',
  'js',
  'json',
  'md',
  'sql',
  'css',
  'toml',
  'yml',
  'yaml',
  'html',
]

/** `caminho` ou `caminho:símbolo` (símbolo pode ter pontos: `Classe.método`). */
const REFERENCE = /^([A-Za-z0-9_@.\-/]+):?([A-Za-z_$][\w$.]*)?$/

function hasFileExtension(path) {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 && FILE_EXTENSIONS.includes(name.slice(dot + 1))
}

/**
 * Referências a código do markdown: trechos entre crases sem espaço, `<`, `>` ou `*` (esses são
 * modelos como `src/features/<feature>/x.ts`). Blocos de código cercados (```) são ignorados.
 * Devolve `{ line, raw, path, symbol }`; `symbol` é `null` quando só há o caminho.
 */
export function extractReferences(markdown) {
  const references = []
  let fenced = false
  for (const [index, line] of markdown.split('\n').entries()) {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const raw = match[1] ?? ''
      if (/[\s<>*]/.test(raw)) continue
      const parts = REFERENCE.exec(raw)
      if (!parts) continue
      const path = parts[1] ?? ''
      const symbol = parts[2] ?? null
      const rooted = ROOT_DIRS.includes(path.split('/')[0] ?? '')
      // Identificador qualquer (`useAuth`, `pages.title`): não é referência a arquivo.
      if (!rooted && !hasFileExtension(path)) continue
      references.push({ line: index + 1, raw, path, symbol })
    }
  }
  return references
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** O identificador aparece no texto como palavra inteira (não dentro de outro nome)? */
export function containsSymbol(source, name) {
  return new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(source)
}

/**
 * Confere cada referência. `files` abstrai o sistema de arquivos: `exists(caminho)` e `read(caminho)`
 * (caminhos relativos à raiz do repositório). Devolve as mensagens de erro (vazio = tudo certo).
 */
export function checkReferences(references, files) {
  const problems = []
  for (const { line, raw, path, symbol } of references) {
    const where = `docs/CODEMAP.md:${String(line)}`
    const slash = path.includes('/')
    const rooted = ROOT_DIRS.includes(path.split('/')[0] ?? '')
    if (slash && !rooted) {
      problems.push(
        `${where}: \`${raw}\` não começa por uma pasta do repositório (use o caminho completo)`,
      )
      continue
    }
    if (!slash && !files.exists(path)) {
      problems.push(`${where}: \`${raw}\` não é um arquivo da raiz (use o caminho completo)`)
      continue
    }
    if (!files.exists(path)) {
      problems.push(`${where}: o arquivo \`${path}\` não existe`)
      continue
    }
    if (symbol === null || !hasFileExtension(path)) continue
    const source = files.read(path)
    const missing = symbol.split('.').filter((name) => !containsSymbol(source, name))
    if (missing.length > 0) {
      problems.push(`${where}: \`${raw}\`: ${missing.join(', ')} não aparece em ${path}`)
    }
  }
  return problems
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = {
    exists: (path) => existsSync(join(root, path)),
    read: (path) => readFileSync(join(root, path), 'utf8'),
  }
  const references = extractReferences(files.read('docs/CODEMAP.md'))
  const problems = checkReferences(references, files)
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    console.error(
      `\n${String(problems.length)} referência(s) do docs/CODEMAP.md desatualizada(s). Atualize o mapa.`,
    )
    process.exit(1)
  }
  console.log(`ok: ${String(references.length)} referências do docs/CODEMAP.md conferidas.`)
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) main()
