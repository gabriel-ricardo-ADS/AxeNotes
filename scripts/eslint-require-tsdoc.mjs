// Regra local do ESLint: todo export de função, classe, constante, tipo ou interface precisa de um
// comentário TSDoc (`/** ... */`) logo acima. Só vale nas pastas listadas em eslint.config.js (src/lib,
// features/*/api, features/*/hooks, features/sync e features/auth). Sem dependência nova: o
// eslint-plugin-jsdoc traz o `spdx-exceptions` (CC-BY-3.0), que o `pnpm license:check` recusa.
// Ver docs/CODEMAP.md (o que escrever no comentário: o que faz, quando usar, efeitos e erros).

/** Declarações exportadas que exigem comentário. */
const DECLARATIONS = new Set([
  'FunctionDeclaration',
  'TSDeclareFunction',
  'ClassDeclaration',
  'VariableDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
])

/** @type {import('eslint').Rule.RuleModule} */
export const requireExportedTsdoc = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      missing:
        'Export sem TSDoc: escreva um comentário /** ... */ logo acima (o que faz, quando usar, erros relevantes).',
    },
  },
  create(context) {
    const { sourceCode } = context
    /** Nome da última função exportada: as sobrecargas seguintes herdam o comentário da primeira. */
    let lastFunctionName = null

    function hasTsdoc(node) {
      return sourceCode
        .getCommentsBefore(node)
        .some((comment) => comment.type === 'Block' && comment.value.startsWith('*'))
    }

    return {
      ExportNamedDeclaration(node) {
        // `export { a }` e `export { a } from '...'` não declaram nada aqui.
        const declaration = node.declaration
        if (!declaration || !DECLARATIONS.has(declaration.type)) return
        checkExport(node, declaration)
      },
      ExportDefaultDeclaration(node) {
        if (!DECLARATIONS.has(node.declaration.type)) return
        checkExport(node, node.declaration)
      },
    }

    function checkExport(node, declaration) {
      const isFunction =
        declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction'
      const name = isFunction ? (declaration.id?.name ?? null) : null
      // Sobrecarga (assinaturas seguidas da implementação): o comentário vai na primeira.
      const isOverload = isFunction && name !== null && name === lastFunctionName
      lastFunctionName = name
      if (isOverload) return
      if (!hasTsdoc(node)) context.report({ node, messageId: 'missing' })
    }
  },
}

/** Plugin com a regra, para registrar no eslint.config.js como `axenotes/require-exported-tsdoc`. */
export const axenotesPlugin = { rules: { 'require-exported-tsdoc': requireExportedTsdoc } }
