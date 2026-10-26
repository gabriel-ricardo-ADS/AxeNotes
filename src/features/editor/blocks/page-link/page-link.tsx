import { createReactBlockSpec } from '@blocknote/react'
import { PageLinkView } from '@/features/editor/blocks/page-link/PageLinkView'

/**
 * Bloco "link para página" (também o de subpágina): guarda só o id da página; ícone e título vêm do
 * cache do workspace na hora de desenhar. Excluir ou duplicar o bloco mexe só no link, nunca na página.
 */
export const createPageLinkBlock = createReactBlockSpec(
  {
    type: 'pageLink',
    propSchema: { pageId: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block }) => (
      <div className="axn-page-link-row" contentEditable={false}>
        <PageLinkView pageId={block.props.pageId} />
      </div>
    ),
  },
)
