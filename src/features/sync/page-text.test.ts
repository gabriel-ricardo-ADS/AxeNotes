import {
  blocksToPlainText,
  PAGE_JSON_MAX_BYTES,
  pageTextSnapshot,
  PREVIEW_BLOCKS,
  truncateToBytes,
  type TextBlock,
} from '@/features/sync/page-text'

const paragraph = (text: string, children?: TextBlock[]): TextBlock => ({
  content: [{ type: 'text', text, styles: {} }],
  ...(children ? { children } : {}),
})

describe('blocksToPlainText', () => {
  it('uma linha por bloco, com filhos, links e sem linhas vazias', () => {
    const blocks: TextBlock[] = [
      paragraph('Título'),
      { content: [] },
      {
        content: [
          { type: 'text', text: 'Leia ', styles: { bold: true } },
          { type: 'link', href: 'https://example.test', content: [{ type: 'text', text: 'isto' }] },
        ],
        children: [paragraph('filho')],
      },
    ]
    expect(blocksToPlainText(blocks)).toBe('Título\nLeia isto\nfilho')
  })

  it('tabela: células separadas por espaço, linhas por quebra', () => {
    const table: TextBlock = {
      content: {
        type: 'tableContent',
        rows: [
          { cells: [[{ type: 'text', text: 'a' }], [{ type: 'text', text: 'b' }]] },
          { cells: [{ type: 'tableCell', content: [{ type: 'text', text: 'c' }] }] },
        ],
      },
    }
    expect(blocksToPlainText([table])).toBe('a b\nc')
  })
})

describe('truncateToBytes', () => {
  it('corta em bytes UTF-8 sem partir caractere nem emoji', () => {
    // "ç" e "ã" ocupam 2 bytes cada.
    expect(truncateToBytes('ação', 2)).toBe('a')
    expect(truncateToBytes('ação', 3)).toBe('aç')
    expect(truncateToBytes('ação', 4)).toBe('aç')
    expect(truncateToBytes('a😀b', 4)).toBe('a')
    expect(truncateToBytes('a😀b', 5)).toBe('a😀')
    expect(truncateToBytes('curto', 100)).toBe('curto')
  })
})

describe('pageTextSnapshot', () => {
  it(`guarda só os primeiros ${String(PREVIEW_BLOCKS)} blocos no JSON`, () => {
    const blocks = Array.from({ length: 30 }, (_, index) => paragraph(`b${String(index)}`))
    const snapshot = pageTextSnapshot(blocks)
    expect(snapshot.text.split('\n')).toHaveLength(30)
    expect(snapshot.json).toHaveLength(PREVIEW_BLOCKS)
  })

  it('reduz os blocos do JSON até caber no limite (ou nenhum)', () => {
    const big = paragraph('x'.repeat(PAGE_JSON_MAX_BYTES / 4))
    expect(pageTextSnapshot([big, big, big, big, big]).json).toHaveLength(2)
    expect(pageTextSnapshot([paragraph('x'.repeat(PAGE_JSON_MAX_BYTES))]).json).toBeNull()
  })
})
