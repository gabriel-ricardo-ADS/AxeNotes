import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import type { AxnEditor } from '@/features/editor/schema'
import { t } from '@/i18n'

/** O que "/" → "Página" precisa do app (injetado: o editor não conhece rotas nem a API). */
export interface SubpageDeps {
  /** A página aberta, que vira a mãe da subpágina. */
  currentPageId: string
  /** `usePageMutations().createPage`: devolve o id, ou null se o servidor recusou. */
  createPage: (parentId: string, options: { id: string }) => Promise<string | null>
  /** Abre a subpágina com o foco no título (como a criação pela árvore). */
  openPage: (pageId: string) => void
  onError: (message: string) => void
  newId?: () => string
}

/**
 * "/" → "Página": cria a subpágina da página atual e põe no lugar do "/" um bloco que aponta para ela.
 * O id nasce aqui, então o bloco já existe enquanto o insert vai ao servidor (o cache otimista mostra
 * "Sem título"). Deu certo: abre a subpágina. Falhou: tira o bloco e avisa. Desfazer (Ctrl+Z) depois
 * tira só o bloco; a página continua na árvore.
 */
export async function insertSubpage(editor: AxnEditor, deps: SubpageDeps): Promise<string | null> {
  const id = (deps.newId ?? (() => crypto.randomUUID()))()
  const block = insertOrUpdateBlockForSlashMenu(editor, { type: 'pageLink', props: { pageId: id } })

  const created = await deps.createPage(deps.currentPageId, { id })
  if (created === null) {
    try {
      if (editor.getBlock(block.id)) editor.removeBlocks([block.id])
    } catch {
      // o editor já saiu de cena (outra página aberta): não há bloco para tirar
    }
    deps.onError(t('editor.errors.subpage'))
    return null
  }
  deps.openPage(created)
  return created
}

/**
 * "Link para página": troca o bloco onde o "/" foi digitado (se ainda vazio) pelo link, ou insere o link
 * logo depois dele; o cursor vai para o próximo bloco de texto. Sem o bloco (apagado enquanto o seletor
 * estava aberto), o link vai para o fim da página.
 */
export function insertPageLink(editor: AxnEditor, atBlockId: string | null, pageId: string) {
  const anchor =
    (atBlockId === null ? undefined : editor.getBlock(atBlockId)) ?? editor.document.at(-1)
  if (!anchor) return
  if (editor.schema.blockSchema[anchor.type].content === 'none') {
    const [inserted] = editor.insertBlocks([{ type: 'paragraph' }], anchor, 'after')
    if (inserted) editor.setTextCursorPosition(inserted, 'end')
  } else {
    editor.setTextCursorPosition(anchor, 'end')
  }
  insertOrUpdateBlockForSlashMenu(editor, { type: 'pageLink', props: { pageId } })
}
