import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { createCalloutBlock } from '@/features/editor/blocks/callout/callout'

/**
 * Blocos do editor: os nativos do roadmap (2a) e os do AxeNotes (2c). Lista explícita (e não "todos
 * menos mídia") para um bloco novo de uma versão do BlockNote não aparecer sozinho. Imagem, vídeo,
 * áudio e arquivo são da Fase 3: sem eles, nenhum menu oferece upload.
 */
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    toggleListItem: defaultBlockSpecs.toggleListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    divider: defaultBlockSpecs.divider,
    table: defaultBlockSpecs.table,
    callout: createCalloutBlock(),
  },
})

/** O editor com o schema do AxeNotes. */
export type AxnEditor = typeof editorSchema.BlockNoteEditor

/** Um bloco do schema do AxeNotes. */
export type AxnBlock = typeof editorSchema.Block
