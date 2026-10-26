import { describe, expect, it } from 'vitest'
import { checkReferences, containsSymbol, extractReferences } from './check-codemap.mjs'

/** Sistema de arquivos falso: caminho -> conteúdo. */
function fakeFiles(contents) {
  return {
    exists: (path) => path in contents,
    read: (path) => contents[path] ?? '',
  }
}

describe('extractReferences', () => {
  it('acha arquivo, arquivo:símbolo e pasta, com o número da linha', () => {
    const markdown = ['texto', 'veja `src/lib/a.ts:foo` e `src/features/` e `package.json`'].join(
      '\n',
    )
    expect(extractReferences(markdown)).toEqual([
      { line: 2, raw: 'src/lib/a.ts:foo', path: 'src/lib/a.ts', symbol: 'foo' },
      { line: 2, raw: 'src/features/', path: 'src/features/', symbol: null },
      { line: 2, raw: 'package.json', path: 'package.json', symbol: null },
    ])
  })

  it('aceita símbolo com ponto (Classe.método)', () => {
    const [reference] = extractReferences('`src/x.ts:Sessao.flush`')
    expect(reference).toMatchObject({ path: 'src/x.ts', symbol: 'Sessao.flush' })
  })

  it('ignora identificadores, modelos e trechos com espaço', () => {
    const markdown =
      '`useAuth` `pages.title` `src/features/<feature>/x.ts` `src/*.ts` `a b.ts` `42501`'
    expect(extractReferences(markdown)).toEqual([])
  })

  it('ignora blocos de código cercados', () => {
    const markdown = ['```sql', 'select `src/nao-existe.ts`', '```', '`src/existe.ts`'].join('\n')
    expect(extractReferences(markdown).map((reference) => reference.path)).toEqual([
      'src/existe.ts',
    ])
  })

  it('mantém nome de arquivo sem pasta para acusar depois', () => {
    expect(extractReferences('`tree.ts:planMove`')).toHaveLength(1)
  })
})

describe('containsSymbol', () => {
  it('só vale como palavra inteira', () => {
    expect(containsSymbol('export function flush() {}', 'flush')).toBe(true)
    expect(containsSymbol('const flushAll = 1', 'flush')).toBe(false)
    expect(containsSymbol('const a$flush = 1', 'flush')).toBe(false)
  })

  it('escapa caracteres especiais do nome', () => {
    expect(containsSymbol('const $a = 1', '$a')).toBe(true)
  })
})

describe('checkReferences', () => {
  const files = fakeFiles({
    'src/lib/a.ts': 'export function foo() {}\nclass Sessao { flush() {} }',
    'package.json': '{}',
    'src/features/index.md': '',
  })

  it('não acusa nada quando tudo existe', () => {
    const references = extractReferences(
      '`src/lib/a.ts:foo` `src/lib/a.ts:Sessao.flush` `package.json`',
    )
    expect(checkReferences(references, files)).toEqual([])
  })

  it('acusa arquivo que não existe', () => {
    const problems = checkReferences(extractReferences('`src/lib/b.ts`'), files)
    expect(problems).toEqual(['docs/CODEMAP.md:1: o arquivo `src/lib/b.ts` não existe'])
  })

  it('acusa símbolo que sumiu do arquivo', () => {
    const problems = checkReferences(extractReferences('`src/lib/a.ts:bar`'), files)
    expect(problems).toEqual([
      'docs/CODEMAP.md:1: `src/lib/a.ts:bar`: bar não aparece em src/lib/a.ts',
    ])
  })

  it('acusa só a parte que sumiu de Classe.método', () => {
    const problems = checkReferences(extractReferences('`src/lib/a.ts:Sessao.stop`'), files)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('stop não aparece')
  })

  it('exige o caminho completo', () => {
    const noFolder = checkReferences(extractReferences('`a.ts:foo`'), files)
    expect(noFolder[0]).toContain('não é um arquivo da raiz')
    const wrongFolder = checkReferences(extractReferences('`lib/a.ts:foo`'), files)
    expect(wrongFolder[0]).toContain('não começa por uma pasta do repositório')
  })

  it('confere pasta sem exigir símbolo', () => {
    expect(checkReferences(extractReferences('`src/features/index.md`'), files)).toEqual([])
    expect(checkReferences(extractReferences('`src/lib/`'), files)).toEqual([
      'docs/CODEMAP.md:1: o arquivo `src/lib/` não existe',
    ])
  })
})
