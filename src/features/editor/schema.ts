import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'

/**
 * Blocos do editor na Fase 2a: os nativos do roadmap. Lista explícita (e não "todos menos mídia")
 * para um bloco novo de uma versão do BlockNote não aparecer sozinho. Imagem, vídeo, áudio e arquivo
 * são da Fase 3: sem eles, nenhum menu oferece upload.
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
  },
})
