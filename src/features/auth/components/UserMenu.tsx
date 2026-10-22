import { LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { useProfile } from '@/features/auth/hooks/use-profile'
import { loadPageEditor } from '@/features/editor/load-page-editor'
import { t } from '@/i18n'
import { flushPendingContent } from '@/lib/pending-content'

/** Quanto o "Sair" espera o envio do conteúdo pendente antes de perguntar. */
export const SIGN_OUT_FLUSH_MS = 5000

type Phase = 'idle' | 'syncing' | 'confirm' | 'signingOut'

/**
 * Rodapé da sidebar: nome do usuário (profiles.display_name) e botão Sair. Antes de sair, tenta
 * enviar o conteúdo das páginas que ainda não chegou ao servidor (o logout apaga o IndexedDB); se
 * sobrar algo, pergunta antes.
 */
export function UserMenu() {
  const { signOut } = useAuth()
  const profile = useProfile()
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const displayName = profile.data?.displayName ?? ''
  const name = displayName === '' ? t('auth.user.fallbackName') : displayName

  async function doSignOut() {
    setPhase('signingOut')
    try {
      await signOut()
    } catch (error) {
      setErrorMessage(t(authErrorMessageKey(mapAuthError(error))))
      setPhase('idle')
    }
  }

  async function handleSignOut() {
    setErrorMessage(null)
    setPhase('syncing')
    // A sincronização vive no chunk do editor; carregá-lo registra quem sabe enviar o pendente
    // (inclusive de páginas fechadas). Se não carregar (offline sem cache), segue sem ele.
    await loadPageEditor().catch(() => undefined)
    const { pending } = await flushPendingContent(SIGN_OUT_FLUSH_MS)
    if (pending > 0) {
      setPhase('confirm')
      return
    }
    await doSignOut()
  }

  const busy = phase === 'syncing' || phase === 'signingOut'

  return (
    <section aria-label={t('auth.user.menuLabel')} className="flex flex-col gap-1 border-t pt-2">
      {profile.isPending ? (
        <span aria-hidden="true" className="mx-2 my-2 h-4 w-28 rounded-tag bg-hover" />
      ) : (
        <p className="truncate px-2 py-1 font-medium text-strong" title={name}>
          {name}
        </p>
      )}
      {errorMessage ? (
        <p role="alert" className="px-2 text-meta text-danger">
          {errorMessage}
        </p>
      ) : null}
      <Button
        variant="ghost"
        size="inline"
        disabled={busy}
        onClick={() => {
          void handleSignOut()
        }}
        className="justify-start"
      >
        <LogOutIcon className="size-4 shrink-0" aria-hidden="true" />
        {phase === 'syncing'
          ? t('auth.user.syncing')
          : phase === 'signingOut'
            ? t('auth.user.signingOut')
            : t('auth.user.signOut')}
      </Button>

      <AlertDialog
        open={phase === 'confirm'}
        onOpenChange={(open) => {
          if (!open) setPhase('idle')
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('auth.user.pendingTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('auth.user.pendingDescription')}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                onClick={() => {
                  void doSignOut()
                }}
              >
                {t('auth.user.pendingConfirm')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
