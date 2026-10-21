import {
  detectMac,
  hasForeignModal,
  isSearchShortcut,
  moveActive,
  normalizeTerm,
  resolveSearchMode,
  resultsAnnouncement,
  searchPath,
  SEARCH_MAX_LENGTH,
} from '@/features/search/search'
import type { PageRow } from '@/features/workspace/types'

const page = (id: string, title: string): PageRow => ({
  id,
  parentId: null,
  title,
  icon: null,
  sortKey: 'a0',
  lastEditedAt: '2026-10-10T12:00:00Z',
})

describe('normalizeTerm', () => {
  it('trims the ends and keeps the inner text, accents, case and wildcards as typed', () => {
    expect(normalizeTerm('  Cálculo 100% a_b \\ ')).toBe('Cálculo 100% a_b \\')
  })

  it('turns empty and whitespace-only input into the empty term', () => {
    expect(normalizeTerm('')).toBe('')
    expect(normalizeTerm('   ')).toBe('')
    expect(normalizeTerm('\t\n ')).toBe('')
  })

  it('composes a decomposed accent (NFD) into NFC', () => {
    const decomposed = 'café'
    expect(decomposed).toHaveLength(5)
    expect(normalizeTerm(decomposed)).toBe('café')
  })

  it('cuts a very long term to the limit, by characters, and never ends with a space', () => {
    expect(Array.from(normalizeTerm('a'.repeat(1000)))).toHaveLength(SEARCH_MAX_LENGTH)
    expect(normalizeTerm('😀'.repeat(500))).toBe('😀'.repeat(SEARCH_MAX_LENGTH))
    expect(normalizeTerm(`${'a'.repeat(SEARCH_MAX_LENGTH - 1)} b`)).toBe(
      'a'.repeat(SEARCH_MAX_LENGTH - 1),
    )
  })
})

describe('isSearchShortcut', () => {
  const base = {
    key: 'k',
    code: 'KeyK',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
  }

  it('is Ctrl+K on Windows/Linux and only Cmd+K on a Mac', () => {
    expect(isSearchShortcut({ ...base, ctrlKey: true }, false)).toBe(true)
    expect(isSearchShortcut({ ...base, ctrlKey: true, key: 'K' }, false)).toBe(true)
    expect(isSearchShortcut({ ...base, metaKey: true }, false)).toBe(false)
    expect(isSearchShortcut({ ...base, metaKey: true }, true)).toBe(true)
    // No Mac, Ctrl+K é "apagar até o fim da linha": não é o atalho.
    expect(isSearchShortcut({ ...base, ctrlKey: true }, true)).toBe(false)
    expect(isSearchShortcut({ ...base, ctrlKey: true, metaKey: true }, true)).toBe(false)
  })

  it('needs the modifier and the K, and nothing else', () => {
    expect(isSearchShortcut(base, false)).toBe(false)
    expect(isSearchShortcut({ ...base, ctrlKey: true, key: 'j', code: 'KeyJ' }, false)).toBe(false)
    expect(isSearchShortcut({ ...base, ctrlKey: true, altKey: true }, false)).toBe(false)
    expect(isSearchShortcut({ ...base, ctrlKey: true, shiftKey: true }, false)).toBe(false)
  })

  it('ignores a held key and IME composition', () => {
    expect(isSearchShortcut({ ...base, ctrlKey: true, repeat: true }, false)).toBe(false)
    expect(isSearchShortcut({ ...base, ctrlKey: true, isComposing: true }, false)).toBe(false)
  })

  it('accepts the physical K on layouts without the ASCII letter, but not another Latin letter', () => {
    expect(isSearchShortcut({ ...base, ctrlKey: true, key: 'л', code: 'KeyK' }, false)).toBe(true)
    // Dvorak: a tecla física K produz "t"; Ctrl+T não é o atalho.
    expect(isSearchShortcut({ ...base, ctrlKey: true, key: 't', code: 'KeyK' }, false)).toBe(false)
  })
})

describe('detectMac', () => {
  it('reads userAgentData first and falls back to navigator.platform', () => {
    expect(detectMac({ platform: 'MacIntel' })).toBe(true)
    expect(detectMac({ platform: 'Win32' })).toBe(false)
    expect(detectMac({ platform: 'Win32', userAgentData: { platform: 'macOS' } })).toBe(true)
    expect(detectMac({ platform: 'MacIntel', userAgentData: { platform: 'Windows' } })).toBe(false)
    expect(detectMac({})).toBe(false)
  })
})

describe('hasForeignModal', () => {
  /** Um contêiner com um elemento de atributos dados (nenhum = contêiner vazio). */
  const withElement = (attributes?: Record<string, string>) => {
    const root = document.createElement('div')
    if (attributes) {
      const element = document.createElement('div')
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
      root.append(element)
    }
    return root
  }

  it('is false with nothing open, with the drawer or with the search itself', () => {
    expect(hasForeignModal(withElement())).toBe(false)
    expect(
      hasForeignModal(
        withElement({ role: 'dialog', 'data-state': 'open', 'data-slot': 'sheet-content' }),
      ),
    ).toBe(false)
    expect(
      hasForeignModal(
        withElement({ role: 'dialog', 'data-state': 'open', 'data-search-dialog': '' }),
      ),
    ).toBe(false)
  })

  it('is true for any other open dialog or alert dialog, and false when it is closed', () => {
    expect(hasForeignModal(withElement({ role: 'dialog', 'data-state': 'open' }))).toBe(true)
    expect(hasForeignModal(withElement({ role: 'alertdialog', 'data-state': 'open' }))).toBe(true)
    expect(hasForeignModal(withElement({ role: 'dialog', 'data-state': 'closed' }))).toBe(false)
  })
})

describe('moveActive', () => {
  it('goes down and up, wrapping at the ends', () => {
    expect(moveActive(0, 'ArrowDown', 3)).toBe(1)
    expect(moveActive(2, 'ArrowDown', 3)).toBe(0)
    expect(moveActive(2, 'ArrowUp', 3)).toBe(1)
    expect(moveActive(0, 'ArrowUp', 3)).toBe(2)
  })

  it('starts from the ends when nothing is active', () => {
    expect(moveActive(-1, 'ArrowDown', 3)).toBe(0)
    expect(moveActive(-1, 'ArrowUp', 3)).toBe(2)
  })

  it('has no active option on an empty list, and stays put on a single one', () => {
    expect(moveActive(0, 'ArrowDown', 0)).toBe(-1)
    expect(moveActive(0, 'ArrowUp', 0)).toBe(-1)
    expect(moveActive(0, 'ArrowDown', 1)).toBe(0)
    expect(moveActive(0, 'ArrowUp', 1)).toBe(0)
  })
})

describe('searchPath', () => {
  it('is null for a page at the root', () => {
    expect(searchPath([], null)).toBeNull()
  })

  it('shows the ancestors from the top, separated by " / "', () => {
    expect(searchPath([page('1', 'Leituras')], null)).toBe('Leituras')
    expect(searchPath([page('1', 'Leituras'), page('2', 'Livros')], null)).toBe('Leituras / Livros')
  })

  it('keeps only the last two ancestors, with an ellipsis before them', () => {
    const chain = ['A', 'B', 'C', 'D', 'E'].map((title, index) => page(String(index), title))
    expect(searchPath(chain, null)).toBe('… / D / E')
  })

  it('leaves out the home page and names an untitled ancestor', () => {
    expect(searchPath([page('home', 'Página inicial'), page('2', 'Livros')], 'home')).toBe('Livros')
    expect(searchPath([page('home', 'Página inicial')], 'home')).toBeNull()
    expect(searchPath([page('1', '')], null)).toBe('Sem título')
  })
})

describe('resolveSearchMode', () => {
  type Input = Parameters<typeof resolveSearchMode>[0]
  const base: Input = {
    normalized: 'filmes',
    debounced: 'filmes',
    workspace: 'ready',
    recents: { failed: false, loading: false },
    search: { isPending: false, isError: false },
  }
  const mode = (patch: Partial<Input>) => resolveSearchMode({ ...base, ...patch })

  it('shows the results once the term settled and the search answered', () => {
    expect(mode({})).toBe('results')
  })

  it('is loading while the debounce has not caught up or the search is pending', () => {
    expect(mode({ debounced: 'fil' })).toBe('loading')
    expect(mode({ search: { isPending: true, isError: false } })).toBe('loading')
  })

  it('shows the error when the search failed', () => {
    expect(mode({ search: { isPending: false, isError: true } })).toBe('error')
  })

  it('with a term: loads while the workspace loads, errors when it failed', () => {
    const pending = { isPending: true, isError: false }
    expect(mode({ workspace: 'pending', search: pending })).toBe('loading')
    expect(mode({ workspace: 'error', search: pending })).toBe('error')
    // O erro do workspace vale mesmo com o debounce ainda correndo.
    expect(mode({ workspace: 'error', debounced: 'fil', search: pending })).toBe('error')
  })

  it('with a term and no workspace (none, including an idle query): never loads, shows the empty results', () => {
    const pending = { isPending: true, isError: false }
    expect(mode({ workspace: 'none', search: pending })).toBe('results')
    expect(mode({ workspace: 'none', debounced: 'fil', search: pending })).toBe('results')
  })

  it('without a term: follows the recents when the workspace is fine', () => {
    const empty = { normalized: '', debounced: '' }
    expect(mode(empty)).toBe('recents')
    expect(mode({ ...empty, recents: { failed: false, loading: true } })).toBe('loading')
    expect(mode({ ...empty, recents: { failed: true, loading: false } })).toBe('error')
  })

  it('without a term: the workspace state wins over the recents', () => {
    const empty = { normalized: '', debounced: '' }
    expect(mode({ ...empty, workspace: 'pending' })).toBe('loading')
    expect(mode({ ...empty, workspace: 'error' })).toBe('error')
    expect(mode({ ...empty, workspace: 'none' })).toBe('recents')
  })
})

describe('resultsAnnouncement', () => {
  it('says empty, one and many', () => {
    expect(resultsAnnouncement(0)).toBe('Nenhuma página encontrada.')
    expect(resultsAnnouncement(1)).toBe('1 resultado.')
    expect(resultsAnnouncement(7)).toBe('7 resultados.')
  })
})
