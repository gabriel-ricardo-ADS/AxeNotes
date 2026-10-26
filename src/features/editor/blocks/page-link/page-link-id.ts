import { z } from 'zod'

const pageIdSchema = z.guid()

/** O `pageId` gravado no bloco é um id de página válido? (o Y.Doc pode vir de outro membro). */
export function isPageId(value: string): boolean {
  return pageIdSchema.safeParse(value).success
}
