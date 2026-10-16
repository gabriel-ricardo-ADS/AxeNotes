import { formatDistance } from 'date-fns'
import { ptBR } from 'date-fns/locale/pt-BR'
import { t } from '@/i18n'

/** "Editada há 19 dias", "Editada há menos de um minuto". `now` entra como parâmetro para os testes. */
export function formatEditedAgo(iso: string, now: Date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // Relógio do aparelho atrasado: nunca mostrar algo no futuro.
  const reference = date.getTime() > now.getTime() ? date : now
  const distance = formatDistance(date, reference, { locale: ptBR })
  return t('page.editedAgo', { distance })
}
