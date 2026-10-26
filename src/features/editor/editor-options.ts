import { editorDictionary } from '@/features/editor/dictionary'
import { isSafeLink } from '@/features/editor/safe-links'
import { editorSchema } from '@/features/editor/schema'

/** Opções do BlockNote que valem para todo editor do AxeNotes (o da página e o dos testes). */
export const EDITOR_OPTIONS = {
  schema: editorSchema,
  dictionary: editorDictionary,
  // Só http, https e mailto viram link (colar, autolink, desenhar). O BlockNote abre em outra aba com
  // rel="noopener noreferrer nofollow".
  links: { isValidLink: isSafeLink },
} as const
