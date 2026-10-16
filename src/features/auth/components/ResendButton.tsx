import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

interface ResendButtonProps {
  /** Segundos que faltam para poder reenviar (0 = liberado). */
  remaining: number
  pending: boolean
  onClick: () => void
}

/** "Reenviar código", com espera entre reenvios (o Supabase também limita no servidor). */
export function ResendButton({ remaining, pending, onClick }: ResendButtonProps) {
  return (
    <Button variant="ghost" disabled={remaining > 0 || pending} onClick={onClick}>
      {remaining > 0 ? t('auth.code.resendIn', { seconds: remaining }) : t('auth.code.resend')}
    </Button>
  )
}
