import { LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { useProfile } from '@/features/auth/hooks/use-profile'
import { t } from '@/i18n'

/** Rodapé da sidebar: nome do usuário (profiles.display_name) e botão Sair. */
export function UserMenu() {
  const { signOut } = useAuth()
  const profile = useProfile()
  const [signingOut, setSigningOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const displayName = profile.data?.displayName ?? ''
  const name = displayName === '' ? t('auth.user.fallbackName') : displayName

  async function handleSignOut() {
    setSigningOut(true)
    setErrorMessage(null)
    try {
      await signOut()
    } catch (error) {
      setErrorMessage(t(authErrorMessageKey(mapAuthError(error))))
      setSigningOut(false)
    }
  }

  return (
    <section
      aria-label={t('auth.user.menuLabel')}
      className="flex flex-col gap-1 border-t pt-2"
    >
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
        disabled={signingOut}
        onClick={() => {
          void handleSignOut()
        }}
        className="justify-start"
      >
        <LogOutIcon className="size-4 shrink-0" aria-hidden="true" />
        {signingOut ? t('auth.user.signingOut') : t('auth.user.signOut')}
      </Button>
    </section>
  )
}
