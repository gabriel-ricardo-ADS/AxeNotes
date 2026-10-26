// O que os itens do menu do bloco fazem no editor. Cada ação é UM passo de desfazer (editor.transact).
// Ver docs/CODEMAP.md §3.15.
import { getDefaultBlockTypeItems, type PartialBlock } from '@blocknote/core'
import type { BlockCommand, TransformTarget } from '@/features/editor/block-menu/block-menu'
import { blockLinkUrl } from '@/features/editor/block-link'
import { CALLOUT_DEFAULT_BACKGROUND } from '@/features/editor/blocks/callout/callout'
import type { AxnBlock, AxnEditor, editorSchema } from '@/features/editor/schema'
import { t } from '@/i18n'

type AxnPartialBlock = PartialBlock<
  typeof editorSchema.blockSchema,
  typeof editorSchema.inlineContentSchema,
  typeof editorSchema.styleSchema
>

/** O bloco sem ids (nele e nos filhos): inserido de novo, ganha ids novos. Um link continua o mesmo link. */
export function withoutIds(block: AxnBlock): AxnPartialBlock {
  const { children, ...rest } = block
  const partial: Partial<typeof rest> = { ...rest }
  delete partial.id
  return { ...partial, children: children.map(withoutIds) }
}

/** Põe o cursor no bloco, se ele tem texto (divisor e link de página não têm onde pôr o cursor). */
function placeCursor(
  editor: AxnEditor,
  block: { id: string; type: string } | undefined,
  where: 'start' | 'end',
) {
  const type = block?.type as keyof typeof editor.schema.blockSchema | undefined
  if (block && type && editor.schema.blockSchema[type].content !== 'none') {
    editor.setTextCursorPosition(block.id, where)
  }
}

/** Duplica o bloco (com os filhos) logo depois dele e põe o cursor na cópia. Devolve o id da cópia. */
export function duplicateBlock(editor: AxnEditor, blockId: string): string | null {
  const block = editor.getBlock(blockId)
  if (!block) return null
  return editor.transact(() => {
    const [copy] = editor.insertBlocks([withoutIds(block)], block, 'after')
    placeCursor(editor, copy, 'end')
    return copy?.id ?? null
  })
}

/** Exclui o bloco (e os filhos). O cursor vai para o vizinho de baixo ou, sem ele, para o de cima. */
export function removeBlock(editor: AxnEditor, blockId: string) {
  const block = editor.getBlock(blockId)
  if (!block) return
  editor.transact(() => {
    const next = editor.getNextBlock(block)
    const previous = editor.getPrevBlock(block)
    editor.removeBlocks([block])
    if (next) placeCursor(editor, editor.getBlock(next.id), 'start')
    else placeCursor(editor, previous ? editor.getBlock(previous.id) : undefined, 'end')
  })
}

/**
 * Troca o tipo do bloco mantendo o texto e as cores. Virar destaque sem cor de fundo ganha o cinza do
 * destaque novo; sair do destaque descarta o emoji (o tipo novo não tem a prop).
 */
export function transformBlock(
  editor: AxnEditor,
  blockId: string,
  type: string,
  props: Record<string, string | number | boolean> = {},
) {
  const block = editor.getBlock(blockId)
  if (!block) return
  const extra =
    type === 'callout' && (block.props as Record<string, unknown>).backgroundColor === 'default'
      ? { backgroundColor: CALLOUT_DEFAULT_BACKGROUND }
      : {}
  editor.transact(() => {
    const updated = editor.updateBlock(block, {
      type,
      props: { ...props, ...extra },
    } as AxnPartialBlock)
    placeCursor(editor, updated, 'end')
  })
}

/** Muda a cor do texto ou do fundo do bloco. */
export function setBlockColor(
  editor: AxnEditor,
  blockId: string,
  prop: 'textColor' | 'backgroundColor',
  color: string,
) {
  const block = editor.getBlock(blockId)
  if (!block || typeof (block.props as Record<string, unknown>)[prop] !== 'string') return
  editor.updateBlock(block, { props: { [prop]: color } })
}

/** Copia o link do bloco (`/p/:pageId#bloco-<id>`) para a área de transferência. */
export async function copyBlockLink(pageId: string, blockId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(blockLinkUrl(window.location.origin, pageId, blockId))
    return true
  } catch {
    return false
  }
}

/** O que a ação precisa do app (a página e como avisar). */
export interface CommandContext {
  pageId: string
  notify: (notice: { kind: 'info' | 'error'; text: string }) => void
}

/** Executa um item do menu do bloco. */
export async function runBlockCommand(
  editor: AxnEditor,
  blockId: string,
  command: BlockCommand,
  context: CommandContext,
) {
  switch (command.kind) {
    case 'transform':
      transformBlock(editor, blockId, command.type, command.props)
      return
    case 'color':
      setBlockColor(editor, blockId, command.prop, command.color)
      return
    case 'duplicate':
      duplicateBlock(editor, blockId)
      return
    case 'remove':
      removeBlock(editor, blockId)
      return
    case 'copyLink': {
      const copied = await copyBlockLink(context.pageId, blockId)
      context.notify(
        copied
          ? { kind: 'info', text: t('editor.blockMenu.linkCopied') }
          : { kind: 'error', text: t('editor.blockMenu.linkCopyFailed') },
      )
      return
    }
  }
}

// Ordem do "Transformar em" (a da referência), pelas chaves do dicionário do BlockNote.
const TARGET_ORDER = [
  'paragraph',
  'heading',
  'heading_2',
  'heading_3',
  'heading_4',
  'heading_5',
  'heading_6',
  'toggle_heading',
  'toggle_heading_2',
  'toggle_heading_3',
  'bullet_list',
  'numbered_list',
  'check_list',
  'toggle_list',
  'quote',
]

/** Posição de um tipo no "Transformar em" (um tipo novo de uma versão do BlockNote vai para o fim). */
function orderOf(key: string): number {
  const index = TARGET_ORDER.indexOf(key)
  return index === -1 ? TARGET_ORDER.length : index
}

/**
 * Destinos do "Transformar em" para o schema do AxeNotes: os tipos com texto que o BlockNote oferece
 * (texto, títulos, listas, citação), código e destaque. Divisor, tabela e link de página ficam de fora.
 */
export function transformTargets(editor: AxnEditor): TransformTarget[] {
  const dictionary = editor.dictionary.slash_menu
  const defaults = getDefaultBlockTypeItems(editor)
    .sort((a, b) => orderOf(a.key) - orderOf(b.key))
    .map((item) => ({
      id: item.key,
      // O BlockNote chama o título de nível 1 só de "Título"; na lista ele precisa do número.
      label: item.key === 'heading' ? t('editor.blockMenu.heading1') : dictionary[item.key].title,
      aliases: dictionary[item.key].aliases,
      type: item.type,
      ...(item.props && { props: item.props }),
    }))
  return [
    ...defaults,
    {
      id: 'code_block',
      label: dictionary.code_block.title,
      aliases: dictionary.code_block.aliases,
      type: 'codeBlock',
    },
    {
      id: 'callout',
      label: t('editor.callout.title'),
      aliases: ['callout', 'destaque', 'aviso', 'nota'],
      type: 'callout',
    },
  ]
}
