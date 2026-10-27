import { describe, expect, it } from 'vitest'
import {
  BUDGETS,
  entryAssets,
  evaluate,
  findChunk,
  resolveBudgetFiles,
} from './check-bundle-size.mjs'

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-AbC123_x.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-Zz9-YyQq.css">
</head><body></body></html>`

const FILES = [
  'index-AbC123_x.js',
  'index-Zz9-YyQq.css',
  'app-routes-DAywd9ES.js',
  'auth-routes-C4KYrba5.js',
  'PageEditor-D45vSTg5.js',
  'PageEditor-CQaXBsLl.css',
]

describe('entryAssets', () => {
  it('lê o JS e o CSS de entrada do index.html', () => {
    expect(entryAssets(HTML)).toEqual({ js: ['index-AbC123_x.js'], css: ['index-Zz9-YyQq.css'] })
  })
})

describe('findChunk', () => {
  it('acha o chunk pelo nome, qualquer que seja o hash', () => {
    expect(findChunk(FILES, 'PageEditor', '.js')).toBe('PageEditor-D45vSTg5.js')
    expect(findChunk(FILES, 'app-routes', '.js')).toBe('app-routes-DAywd9ES.js')
  })

  it('não confunde com outro chunk que termina igual', () => {
    expect(() => findChunk(['auth-routes-C4KYrba5.js'], 'app-routes', '.js')).toThrow(/achei 0/)
  })

  it('falha se houver mais de um candidato', () => {
    expect(() => findChunk(['app-routes-a.js', 'app-routes-b.js'], 'app-routes', '.js')).toThrow(
      /achei 2/,
    )
  })
})

describe('resolveBudgetFiles + evaluate', () => {
  const resolved = resolveBudgetFiles(BUDGETS, FILES, HTML)

  it('liga cada orçamento ao arquivo certo', () => {
    expect(resolved.map((budget) => budget.file)).toEqual([
      'index-AbC123_x.js',
      'app-routes-DAywd9ES.js',
      'PageEditor-D45vSTg5.js',
      'index-Zz9-YyQq.css',
      'PageEditor-CQaXBsLl.css',
    ])
  })

  it('aprova no limite e reprova acima dele', () => {
    const atLimit = evaluate(resolved, (file) => {
      const budget = resolved.find((item) => item.file === file)
      return budget.limitKb * 1000
    })
    expect(atLimit.every((result) => result.ok)).toBe(true)

    const over = evaluate(resolved, (file) => (file === 'PageEditor-D45vSTg5.js' ? 500_000 : 1_000))
    expect(over.filter((result) => !result.ok).map((result) => result.label)).toEqual(['editor'])
  })

  it('falha se o index.html não tiver a entrada', () => {
    expect(() => resolveBudgetFiles(BUDGETS, FILES, '<html></html>')).toThrow(/entrada JS/)
  })
})
