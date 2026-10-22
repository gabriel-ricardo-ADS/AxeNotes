import type * as Y from 'yjs'

/** Sincronização do conteúdo de uma página enquanto ela está aberta. */
export interface ContentSyncSession {
  /** Para de sincronizar. O 2b espera aqui o envio dos updates pendentes. */
  stop: () => Promise<void>
}

/**
 * Ponto de extensão do 2b (docs/adr/0001-conteudo-yjs.md): recebe o Y.Doc já carregado do aparelho e
 * passa a enviar/receber updates do Supabase. No 2a só existe a versão local.
 */
export interface ContentSync {
  start: (pageId: string, doc: Y.Doc) => ContentSyncSession
}

/** 2a: nada sai do aparelho. */
export const localOnlySync: ContentSync = {
  start: () => ({ stop: () => Promise.resolve() }),
}
