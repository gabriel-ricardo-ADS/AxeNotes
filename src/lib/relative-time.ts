import { formatDistance } from 'date-fns'
import { ptBR } from 'date-fns/locale/pt-BR'
import { t, type TranslationKey } from '@/i18n'

function formatAgo(key: TranslationKey, iso: string, now: Date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // Relógio do aparelho atrasado: nunca mostrar algo no futuro.
  const reference = date.getTime() > now.getTime() ? date : now
  const distance = formatDistance(date, reference, { locale: ptBR })
  return t(key, { distance })
}

/** "Editada há 19 dias", "Editada há menos de um minuto". `now` entra como parâmetro para os testes. */
export function formatEditedAgo(iso: string, now: Date): string {
  return formatAgo('page.editedAgo', iso, now)
}

/** "Excluída há 3 dias". */
export function formatTrashedAgo(iso: string, now: Date): string {
  return formatAgo('trash.trashedAgo', iso, now)
}
