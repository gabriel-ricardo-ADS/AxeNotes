import { t } from '@/i18n'

/**
 * Tela neutra (só o fundo) enquanto a sessão ou o código de uma tela carrega: evita piscar o app ou
 * o formulário. O aviso é só para leitor de tela.
 */
export function ScreenLoading() {
  return (
    <div role="status" data-screen-loading="" className="h-dvh bg-background">
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
