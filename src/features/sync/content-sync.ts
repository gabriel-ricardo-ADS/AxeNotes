import type * as Y from 'yjs'
import type { TextBlock } from '@/features/sync/page-text'

/**
 * Como está o salvamento da página aberta (indicador perto do "Editada há…"):
 * - `saved`: o servidor tem tudo; `saving`: há envio pendente ou em andamento;
 * - `offline`: sem rede, as edições ficam no aparelho e vão ao voltar;
 * - `error`: o envio falhou e está sendo tentado de novo;
 * - `tooLarge`: o documento passou do limite do servidor (o conteúdo continua no aparelho);
 * - `blocked`: o servidor recusou (sem permissão ou página na lixeira);
 * - `readonly`: leitor ou página na lixeira, só recebe (o indicador não aparece).
 */
export type SyncStatus =
  'saved' | 'saving' | 'offline' | 'error' | 'tooLarge' | 'blocked' | 'readonly'

/** Sincronização do conteúdo de uma página enquanto ela está aberta. */
export interface ContentSyncSession {
  /** Para de sincronizar, tentando antes enviar o pendente (com limite de tempo). */
  stop: () => Promise<void>
  /** Editor ↔ leitor (ex.: a página foi para a lixeira): leitor só recebe. */
  setCanWrite: (canWrite: boolean) => void
  /** Blocos atuais do editor, para o texto de busca e as prévias (`page_texts`). */
  setTextSource: (source: (() => readonly TextBlock[]) | null) => void
  getStatus: () => SyncStatus
  /** Avisa a cada mudança de status. Devolve a função que cancela. */
  subscribe: (listener: () => void) => () => void
  /** Avisa a cada envio confirmado pelo servidor. Devolve a função que cancela. */
  onSaved: (listener: () => void) => () => void
}

export interface ContentSyncOptions {
  /** false para leitor e página na lixeira: nunca envia. */
  canWrite: boolean
}

/**
 * Ponto de extensão do conteúdo (docs/adr/0001-conteudo-yjs.md): recebe o Y.Doc já carregado do
 * aparelho e passa a enviar/receber updates. A implementação real é `supabaseSync`.
 */
export interface ContentSync {
  start: (pageId: string, doc: Y.Doc, options: ContentSyncOptions) => ContentSyncSession
}

/** Nada sai do aparelho (testes do doc local). */
export const localOnlySync: ContentSync = {
  start: () => ({
    stop: () => Promise.resolve(),
    setCanWrite: () => undefined,
    setTextSource: () => undefined,
    getStatus: () => 'saved',
    subscribe: () => () => undefined,
    onSaved: () => () => undefined,
  }),
}
