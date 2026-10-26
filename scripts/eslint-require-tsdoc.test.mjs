import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, describe, it } from 'vitest'
import { requireExportedTsdoc } from './eslint-require-tsdoc.mjs'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2023, sourceType: 'module' },
})

const missing = [{ messageId: 'missing' }]

tester.run('require-exported-tsdoc', requireExportedTsdoc, {
  valid: [
    '/** Soma. */\nexport function soma(a: number, b: number) { return a + b }',
    '/** Cria. */\nexport async function criar() {}',
    '/** Hook. */\nexport const useAlgo = () => 1',
    '/** Tipo. */\nexport type Estado = "a" | "b"',
    '/** Contrato. */\nexport interface Dados { x: number }',
    '/** Classe. */\nexport class Sessao {}',
    '/** Enum. */\nexport enum Cor { Azul }',
    '/** Padrão. */\nexport default function Tela() { return null }',
    // Comentário de linha antes do TSDoc não atrapalha.
    '/** Doc. */\n// eslint-disable-next-line no-console\nexport const a = 1',
    // O que não é exportado não precisa de comentário.
    'function interna() {}\nconst x = 1\ntype T = string',
    // Re-exports e listas de nomes não declaram nada neste arquivo.
    "export { Tela } from './Tela'\nconst a = 1\nexport { a }",
    // Sobrecargas: só a primeira assinatura precisa do comentário.
    [
      '/** Lazy. */',
      'export function lazy(a: string): string',
      'export function lazy(a: number): number',
      'export function lazy(a: unknown) { return a }',
    ].join('\n'),
  ],
  invalid: [
    { code: 'export function soma() {}', errors: missing },
    { code: 'export async function criar() {}', errors: missing },
    { code: 'export const useAlgo = () => 1', errors: missing },
    { code: 'export type Estado = "a" | "b"', errors: missing },
    { code: 'export interface Dados { x: number }', errors: missing },
    { code: 'export class Sessao {}', errors: missing },
    { code: 'export enum Cor { Azul }', errors: missing },
    { code: 'export default function Tela() { return null }', errors: missing },
    // `//` e `/* */` comuns não valem: precisa ser `/** */`.
    { code: '// Soma.\nexport function soma() {}', errors: missing },
    { code: '/* Soma. */\nexport function soma() {}', errors: missing },
    // O comentário de outra declaração não vale para a seguinte.
    {
      code: '/** A. */\nexport const a = 1\nexport const b = 2',
      errors: missing,
    },
    // Sobrecarga sem comentário na primeira assinatura: um erro só.
    {
      code: 'export function f(a: string): string\nexport function f(a: number): number\nexport function f(a: unknown) { return a }',
      errors: missing,
    },
  ],
})
