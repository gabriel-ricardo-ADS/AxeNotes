// Modelo puro do menu do bloco (⋮⋮): que itens aparecem para cada bloco, com que rótulos, atalhos e
// marcas, e como a busca "Pesquisar ações…" filtra. A tela fica em BlockMenuPanel.tsx; o que cada item
// faz no editor, em block-actions.ts. Ver docs/CODEMAP.md §3.15.

/** Cor do BlockNote (as 9 da paleta de etiquetas, mais o padrão). */
export const BLOCK_COLORS = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const

export type BlockColor = (typeof BLOCK_COLORS)[number]

/** Prop de cor que o menu mexe. */
export type ColorProp = 'textColor' | 'backgroundColor'

/** O que um item do menu faz. */
export type BlockCommand =
  | { kind: 'transform'; type: string; props?: Record<string, string | number | boolean> }
  | { kind: 'color'; prop: ColorProp; color: string }
  | { kind: 'copyLink' }
  | { kind: 'duplicate' }
  | { kind: 'remove' }

/** Ícone de um item (o componente escolhe o desenho). */
export type MenuIcon = 'transform' | 'color' | 'link' | 'duplicate' | 'remove' | 'block' | 'swatch'

/** Um item do menu: ação (`command`) ou submenu (`children`). */
export interface MenuEntry {
  id: string
  label: string
  aliases: readonly string[]
  icon: MenuIcon
  shortcut?: string
  /** O estado atual do bloco (tipo ou cor) — mostra ✓. */
  checked?: boolean
  /** Título da seção que começa neste item (ex.: "Texto", "Fundo" no submenu de cor); "" = só um divisor. */
  section?: string
  /** Grupo do item, que entra no nome acessível e na busca ("Fundo" + "Verde"). */
  group?: string
  swatch?: { prop: ColorProp; color: string }
  command?: BlockCommand
  children?: readonly MenuEntry[]
  /** Na lista achatada da busca: "Transformar em › Título 1". */
  path?: string
}

/** Um destino do "Transformar em" (só blocos do schema com texto, sem mídia). */
export interface TransformTarget {
  id: string
  label: string
  aliases: readonly string[]
  type: string
  props?: Record<string, string | number | boolean>
}

/** O que o modelo precisa saber do bloco e do app (tudo já em pt-BR). */
export interface BlockMenuInput {
  block: { type: string; props: Record<string, unknown> }
  /** `content` do bloco no schema: só "inline" pode virar outro tipo. */
  contentType: string
  targets: readonly TransformTarget[]
  /** Nome do tipo quando ele não está nos destinos (divisor, tabela, link para página). */
  typeLabel: (type: string) => string
  labels: {
    transform: string
    color: string
    textColor: string
    backgroundColor: string
    copyLink: string
    duplicate: string
    remove: string
    colorNames: Record<BlockColor, string>
  }
  /** Mac/iPhone/iPad: atalhos com ⌘ e ⌥. */
  apple: boolean
}

/** Rótulo dos atalhos do menu, no estilo do sistema. */
export function shortcutLabels(apple: boolean) {
  return apple
    ? { duplicate: '⌘D', copyLink: '⌥⇧L', remove: 'Del', openMenu: '⌘/' }
    : { duplicate: 'Ctrl+D', copyLink: 'Alt+Shift+L', remove: 'Del', openMenu: 'Ctrl+/' }
}

function sameProps(
  wanted: Record<string, string | number | boolean> | undefined,
  actual: Record<string, unknown>,
): boolean {
  return Object.entries(wanted ?? {}).every(([key, value]) => actual[key] === value)
}

/** O destino que descreve o bloco como ele está (tipo e props batem), se houver. */
export function currentTarget(
  block: BlockMenuInput['block'],
  targets: readonly TransformTarget[],
): TransformTarget | undefined {
  return targets.find(
    (target) => target.type === block.type && sameProps(target.props, block.props),
  )
}

/** Título do menu (o tipo do bloco) e os itens, na ordem da referência. */
export function buildBlockMenu(input: BlockMenuInput): { title: string; entries: MenuEntry[] } {
  const { block, labels, apple } = input
  const shortcuts = shortcutLabels(apple)
  const current = currentTarget(block, input.targets)
  const entries: MenuEntry[] = []

  if (input.contentType === 'inline' && input.targets.length > 0) {
    entries.push({
      id: 'transform',
      label: labels.transform,
      aliases: ['transformar', 'converter', 'mudar tipo', 'turn into', 'tipo'],
      icon: 'transform',
      children: input.targets.map((target) => ({
        id: `transform:${target.id}`,
        label: target.label,
        aliases: target.aliases,
        icon: 'block',
        checked: target === current,
        command: {
          kind: 'transform',
          type: target.type,
          ...(target.props && { props: target.props }),
        },
      })),
    })
  }

  const colorProps = (['textColor', 'backgroundColor'] as const).filter(
    (prop) => typeof block.props[prop] === 'string',
  )
  if (colorProps.length > 0) {
    entries.push({
      id: 'color',
      label: labels.color,
      aliases: ['cor', 'cores', 'color', 'colour', 'pintar'],
      icon: 'color',
      children: colorProps.flatMap((prop) =>
        BLOCK_COLORS.map((color, index) => ({
          id: `color:${prop}:${color}`,
          label: labels.colorNames[color],
          aliases: [color],
          icon: 'swatch' as const,
          checked: block.props[prop] === color,
          swatch: { prop, color },
          command: { kind: 'color' as const, prop, color },
          group: prop === 'textColor' ? labels.textColor : labels.backgroundColor,
          ...(index === 0 && {
            section: prop === 'textColor' ? labels.textColor : labels.backgroundColor,
          }),
        })),
      ),
    })
  }

  entries.push(
    {
      id: 'copyLink',
      label: labels.copyLink,
      aliases: ['link', 'copiar link', 'copy link', 'ancora', 'compartilhar'],
      icon: 'link',
      shortcut: shortcuts.copyLink,
      command: { kind: 'copyLink' },
      section: '',
    },
    {
      id: 'duplicate',
      label: labels.duplicate,
      aliases: ['duplicar', 'copiar bloco', 'clonar', 'duplicate'],
      icon: 'duplicate',
      shortcut: shortcuts.duplicate,
      command: { kind: 'duplicate' },
    },
    {
      id: 'remove',
      label: labels.remove,
      aliases: ['excluir', 'apagar', 'deletar', 'remover', 'delete'],
      icon: 'remove',
      shortcut: shortcuts.remove,
      command: { kind: 'remove' },
    },
  )

  return { title: current?.label ?? input.typeLabel(block.type), entries }
}

/** Texto comparável: sem acento, sem caixa, espaços simples. */
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Toda palavra digitada é o começo de alguma palavra do item ("cor" acha "Cor", não "âncora"). */
function matches(words: readonly string[], parts: readonly string[]): boolean {
  const haystack = normalizeQuery(parts.join(' ')).split(' ')
  return words.every((word) => haystack.some((candidate) => candidate.startsWith(word)))
}

/**
 * Filtra pela busca: um item de topo aparece se o rótulo ou um alias casa; um subitem aparece achatado
 * ("Cor › Fundo › Verde") se o rótulo, um alias ou a seção casam. Toda palavra digitada precisa ser o
 * começo de uma palavra do item.
 */
export function filterMenu(entries: readonly MenuEntry[], query: string): MenuEntry[] {
  const words = normalizeQuery(query).split(' ').filter(Boolean)
  if (words.length === 0) return [...entries]

  const result: MenuEntry[] = []
  for (const entry of entries) {
    if (matches(words, [entry.label, ...entry.aliases])) result.push(entry)
    for (const child of entry.children ?? []) {
      const group = child.group ?? ''
      if (matches(words, [group, child.label, ...child.aliases])) {
        const flat: MenuEntry = { ...child }
        delete flat.section
        result.push({
          ...flat,
          path: [entry.label, group, child.label].filter(Boolean).join(' › '),
        })
      }
    }
  }
  return result
}
