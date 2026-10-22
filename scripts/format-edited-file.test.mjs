import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatEditedFile, isInside } from './format-edited-file.mjs'

const UGLY = 'const  a = {b:1}\r\n'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'format-hook-'))
  await writeFile(join(root, '.prettierrc'), '{ "semi": false, "endOfLine": "lf" }')
  await writeFile(join(root, '.prettierignore'), 'generated\n*.md\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const event = (filePath, cwd = root) => ({ cwd, tool_input: { file_path: filePath } })

describe('formatEditedFile', () => {
  it('formata o arquivo editado (com LF)', async () => {
    const file = join(root, 'a.ts')
    await writeFile(file, UGLY)

    expect(await formatEditedFile(event(file), root)).toBe('formatted')
    expect(await readFile(file, 'utf8')).toBe('const a = { b: 1 }\n')
    expect(await formatEditedFile(event(file), root)).toBe('unchanged')
  })

  it('aceita caminho relativo ao cwd do evento', async () => {
    await writeFile(join(root, 'b.ts'), UGLY)

    expect(await formatEditedFile(event('b.ts'), root)).toBe('formatted')
  })

  it('pula arquivo fora do repositório', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'format-hook-outside-'))
    const file = join(outside, 'a.ts')
    await writeFile(file, UGLY)
    try {
      expect(await formatEditedFile(event(file), root)).toMatch(/fora do repositório/)
      expect(await readFile(file, 'utf8')).toBe(UGLY)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('pula o que o .prettierignore ou o .gitignore ignoram e extensão sem parser', async () => {
    await writeFile(join(root, '.gitignore'), 'local.json\n')
    await writeFile(join(root, 'notas.md'), '#  título\n')
    await writeFile(join(root, 'local.json'), '{"a":1}')
    await writeFile(join(root, 'dados.bin'), 'x')

    expect(await formatEditedFile(event(join(root, 'notas.md')), root)).toMatch(/ignorado/)
    expect(await formatEditedFile(event(join(root, 'local.json')), root)).toMatch(/ignorado/)
    expect(await readFile(join(root, 'local.json'), 'utf8')).toBe('{"a":1}')
    expect(await formatEditedFile(event(join(root, 'dados.bin')), root)).toMatch(/não formata/)
  })

  it('não segue symlink que aponta para fora do repositório', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'format-hook-target-'))
    const target = join(outside, 'alvo.ts')
    await writeFile(target, UGLY)
    try {
      try {
        await symlink(target, join(root, 'link.ts'), 'file')
      } catch {
        context.skip() // Windows sem permissão para criar symlink
      }
      expect(await formatEditedFile(event(join(root, 'link.ts')), root)).toMatch(/fora/)
      expect(await readFile(target, 'utf8')).toBe(UGLY)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('pula evento sem file_path', async () => {
    expect(await formatEditedFile(null, root)).toMatch(/sem file_path/)
    expect(await formatEditedFile({ tool_input: {} }, root)).toMatch(/sem file_path/)
  })

  it('erro de sintaxe vira rejeição (o main só registra no stderr)', async () => {
    const file = join(root, 'quebrado.ts')
    await writeFile(file, 'const = (')

    await expect(formatEditedFile(event(file), root)).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('const = (')
  })
})

describe('isInside', () => {
  it('só aceita caminhos dentro da raiz', () => {
    expect(isInside(root, join(root, 'src', 'a.ts'))).toBe(true)
    expect(isInside(root, root)).toBe(false)
    expect(isInside(root, join(root, '..', 'fora.ts'))).toBe(false)
  })
})
