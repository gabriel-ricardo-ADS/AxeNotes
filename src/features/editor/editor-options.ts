import { editorDictionary } from '@/features/editor/dictionary'
import { handleEditorLinkClick, isSafeLink } from '@/features/editor/safe-links'
import { editorSchema } from '@/features/editor/schema'

/** Opções do BlockNote que valem para todo editor do AxeNotes (o da página e o dos testes). */
export const EDITOR_OPTIONS = {
  schema: editorSchema,
  dictionary: editorDictionary,
  // Só http, https e mailto viram link (colar, autolink, desenhar). O `<a>` sai com
  // rel="noopener noreferrer nofollow"; o clique abre com `noopener` (o padrão do BlockNote não punha).
  links: { isValidLink: isSafeLink, onClick: handleEditorLinkClick },
} as const
