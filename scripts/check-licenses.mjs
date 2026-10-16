// Falha se alguma dependência tiver licença incompatível com GPL-3.0 (DECISÃO-003).
// Usa `pnpm licenses list --json` (comando nativo do pnpm) e compara com a lista abaixo.
// Rodar com: pnpm run license:check
import { execSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Licenças permissivas ou copyleft fraco/forte compatíveis com GPL-3.0.
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'MPL-2.0',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'Unlicense',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
])

// LGPL (qualquer versão/sufixo) é aceita.
const ALLOWED_PATTERNS = [/^LGPL-\d(\.\d)?(-only|-or-later)?$/]

// Exceções por pacote: licença que só vale para aquele pacote e o motivo.
// Cada entrada nova precisa de justificativa e de aprovação do Gabriel.
const PACKAGE_EXCEPTIONS = {
  // Dados de compatibilidade de navegadores usados só por ferramentas de desenvolvimento
  // (browserslist, via eslint-plugin-react-hooks). Não entra no bundle do app.
  'caniuse-lite': ['CC-BY-4.0'],
}

/** Divide uma expressão SPDX em tokens: parênteses, AND, OR e identificadores. */
function tokenize(expression) {
  return expression.match(/\(|\)|[^\s()]+/g) ?? []
}

/**
 * Avalia uma expressão SPDX (ex.: "(MIT OR Apache-2.0)", "MIT AND CC0-1.0").
 * OR: basta uma alternativa permitida. AND: todas precisam ser permitidas.
 * `isSingleAllowed` decide se um identificador simples é aceito.
 */
function evaluate(tokens, isSingleAllowed) {
  let pos = 0

  function parseOr() {
    let result = parseAnd()
    while (tokens[pos] === 'OR') {
      pos += 1
      const right = parseAnd()
      result = result || right
    }
    return result
  }

  function parseAnd() {
    let result = parseAtom()
    while (tokens[pos] === 'AND') {
      pos += 1
      const right = parseAtom()
      result = result && right
    }
    return result
  }

  function parseAtom() {
    const token = tokens[pos]
    pos += 1
    if (token === undefined) return false
    if (token === '(') {
      const inner = parseOr()
      if (tokens[pos] !== ')') return false
      pos += 1
      return inner
    }
    return isSingleAllowed(token)
  }

  const value = parseOr()
  return pos === tokens.length && value
}

/** Indica se a expressão de licença é aceita para o pacote informado. */
export function isLicenseAllowed(expression, packageName = '') {
  if (typeof expression !== 'string' || expression.trim() === '') return false
  const exceptions = PACKAGE_EXCEPTIONS[packageName] ?? []
  const isSingleAllowed = (id) =>
    ALLOWED.has(id) ||
    ALLOWED_PATTERNS.some((pattern) => pattern.test(id)) ||
    exceptions.includes(id)
  return evaluate(tokenize(expression.trim()), isSingleAllowed)
}

/**
 * Recebe o JSON de `pnpm licenses list --json` ({ [licença]: [{ name, versions }] })
 * e devolve a lista de pacotes com licença não permitida.
 */
export function findViolations(report) {
  const violations = []
  for (const [license, packages] of Object.entries(report)) {
    for (const pkg of packages) {
      if (!isLicenseAllowed(license, pkg.name)) {
        violations.push({ name: pkg.name, versions: pkg.versions, license })
      }
    }
  }
  return violations
}

function readReport() {
  // Comando fixo (sem argumentos externos): funciona igual no Windows (pnpm.cmd) e no Linux.
  const output = execSync('pnpm licenses list --json', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(output)
}

function main() {
  const report = readReport()
  const total = Object.values(report).reduce((sum, packages) => sum + packages.length, 0)
  const violations = findViolations(report)

  if (violations.length > 0) {
    console.error(`Licenças não permitidas (${violations.length} de ${total} pacotes):`)
    for (const { name, versions, license } of violations) {
      console.error(`  - ${name}@${versions.join(', ')}: ${license}`)
    }
    console.error('Veja a lista de licenças compatíveis com GPL-3.0 em scripts/check-licenses.mjs.')
    process.exit(1)
  }

  console.log(`Licenças ok: ${total} pacotes verificados.`)
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) main()
