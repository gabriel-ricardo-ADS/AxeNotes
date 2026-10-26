import {
  buildBlockMenu,
  filterMenu,
  normalizeQuery,
  type BlockMenuInput,
  type MenuEntry,
} from '@/features/editor/block-menu/block-menu'
import { transformTargets } from '@/features/editor/block-menu/block-actions'
import { createTestEditor } from '@/features/editor/test-editor'

// O schema traz o link de página, que lê páginas pela API: sem o cliente de verdade (nem .env).
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const editor = createTestEditor()
const targets = transformTargets(editor)

function menuFor(
  type: string,
  props: Record<string, unknown> = { textColor: 'default', backgroundColor: 'default' },
  apple = false,
) {
  const input: BlockMenuInput = {
    block: { type, props },
    contentType: editor.schema.blockSchema[type as 'paragraph'].content,
    targets,
    typeLabel: (name) => `tipo:${name}`,
    apple,
    labels: {
      transform: 'Transformar em',
      color: 'Cor',
      textColor: 'Texto',
      backgroundColor: 'Fundo',
      copyLink: 'Link para o bloco',
      duplicate: 'Duplicar',
      remove: 'Excluir',
      colorNames: {
        default: 'Padrão',
        gray: 'Cinza',
        brown: 'Marrom',
        orange: 'Laranja',
        yellow: 'Amarelo',
        green: 'Verde',
        blue: 'Azul',
        purple: 'Roxo',
        pink: 'Rosa',
        red: 'Vermelho',
      },
    },
  }
  return buildBlockMenu(input)
}

const ids = (entries: readonly MenuEntry[]) => entries.map((entry) => entry.id)
const child = (entries: readonly MenuEntry[], parent: string) =>
  entries.find((entry) => entry.id === parent)?.children ?? []

describe('transformTargets', () => {
  it('offers only text blocks of the schema (no media, divider, table or page link), in order', () => {
    const types = targets.map((target) => target.type)
    expect(types[0]).toBe('paragraph')
    expect(types).toContain('heading')
    expect(types).toEqual(
      expect.arrayContaining([
        'bulletListItem',
        'numberedListItem',
        'checkListItem',
        'toggleListItem',
        'quote',
        'codeBlock',
        'callout',
      ]),
    )
    for (const blocked of ['image', 'video', 'audio', 'file', 'divider', 'table', 'pageLink']) {
      expect(types).not.toContain(blocked)
    }
  })
})

describe('buildBlockMenu', () => {
  it('a paragraph gets every item, in the order of the reference, with shortcuts', () => {
    const menu = menuFor('paragraph')
    expect(menu.title).toBe('Parágrafo')
    expect(ids(menu.entries)).toEqual(['transform', 'color', 'copyLink', 'duplicate', 'remove'])
    expect(menu.entries.map((entry) => entry.shortcut ?? null)).toEqual([
      null,
      null,
      'Alt+Shift+L',
      'Ctrl+D',
      'Del',
    ])
    expect(child(menu.entries, 'transform').find((entry) => entry.checked)?.label).toBe('Parágrafo')
  })

  it('uses ⌘ and ⌥ on Apple devices', () => {
    const menu = menuFor('paragraph', undefined, true)
    expect(menu.entries.find((entry) => entry.id === 'duplicate')?.shortcut).toBe('⌘D')
    expect(menu.entries.find((entry) => entry.id === 'copyLink')?.shortcut).toBe('⌥⇧L')
  })

  it('marks the current heading level', () => {
    const menu = menuFor('heading', {
      level: 2,
      isToggleable: false,
      textColor: 'default',
      backgroundColor: 'default',
    })
    const checked = child(menu.entries, 'transform').filter((entry) => entry.checked)
    expect(checked).toHaveLength(1)
    expect(checked[0]?.label).toBe(menu.title)
    expect(menu.title).toMatch(/2/)
  })

  it('lists text and background colors (default + 9) and marks the current ones', () => {
    const menu = menuFor('callout', { emoji: '💡', textColor: 'default', backgroundColor: 'green' })
    expect(menu.title).toBe('Destaque')
    const colors = child(menu.entries, 'color')
    expect(colors).toHaveLength(20)
    expect(colors[0]?.section).toBe('Texto')
    expect(colors[10]?.section).toBe('Fundo')
    expect(colors.filter((entry) => entry.checked).map((entry) => entry.id)).toEqual([
      'color:textColor:default',
      'color:backgroundColor:green',
    ])
  })

  it('a divider, a table and a page link cannot be transformed; the link has no color', () => {
    expect(ids(menuFor('divider', {}).entries)).toEqual(['copyLink', 'duplicate', 'remove'])
    expect(menuFor('divider', {}).title).toBe('tipo:divider')
    expect(ids(menuFor('table', { textColor: 'default' }).entries)).toEqual([
      'color',
      'copyLink',
      'duplicate',
      'remove',
    ])
    expect(ids(menuFor('pageLink', { pageId: '' }).entries)).toEqual([
      'copyLink',
      'duplicate',
      'remove',
    ])
  })
})

describe('filterMenu', () => {
  const menu = menuFor('paragraph')

  it('ignores accents and case, and matches the start of words', () => {
    expect(normalizeQuery('  Título   UM ')).toBe('titulo um')
    expect(ids(filterMenu(menu.entries, 'cor'))).toEqual(['color'])
    expect(ids(filterMenu(menu.entries, 'DUPL'))).toEqual(['duplicate'])
    expect(ids(filterMenu(menu.entries, 'apagar'))).toEqual(['remove'])
  })

  it('flattens sub-items with their path', () => {
    const headings = filterMenu(menu.entries, 'titu')
    expect(headings.length).toBeGreaterThanOrEqual(3)
    expect(headings[0]?.path).toMatch(/^Transformar em › Título/)

    const green = filterMenu(menu.entries, 'fundo verde')
    expect(green.map((entry) => entry.path)).toEqual(['Cor › Fundo › Verde'])
    expect(green[0]?.command).toEqual({ kind: 'color', prop: 'backgroundColor', color: 'green' })
  })

  it('returns everything for an empty query and nothing for nonsense', () => {
    expect(filterMenu(menu.entries, '   ')).toHaveLength(menu.entries.length)
    expect(filterMenu(menu.entries, 'xyzzy')).toEqual([])
  })
})
