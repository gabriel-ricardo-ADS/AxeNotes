import { useMutation } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { signIn } from '@/features/auth/api/auth'
import { AuthCard } from '@/features/auth/components/AuthLayout'
import { FormError } from '@/features/auth/components/FormError'
import { PasswordField } from '@/features/auth/components/PasswordField'
import { TextField } from '@/features/auth/components/TextField'
import { authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { readFrom } from '@/features/auth/navigation-state'
import { signInSchema, toFieldErrors, type FieldErrors } from '@/features/auth/schemas'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

/** /entrar: e-mail + senha. Sessão persistente; o código por e-mail não é pedido a cada login. */
export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const mutation = useMutation({
    mutationFn: (values: { email: string; password: string }) =>
      signIn(values.email, values.password),
  })

  const kind = mutation.error ? mapAuthError(mutation.error) : null
  // Conta ainda não confirmada: em vez de erro, leva à tela do código.
  const errorMessage =
    kind !== null && kind !== 'email_not_confirmed' ? t(authErrorMessageKey(kind)) : null

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    mutation.mutate(parsed.data, {
      onError: (error) => {
        if (mapAuthError(error) === 'email_not_confirmed') {
          void navigate('/codigo', {
            state: { email: parsed.data.email, from: readFrom(location.state) },
          })
        }
      },
    })
  }

  // A rota de origem acompanha quem vai criar conta ou recuperar a senha e depois entra.
  const from = readFrom(location.state)
  const carryState = from === undefined ? undefined : { from }

  return (
    <AuthCard title={t('auth.signIn.title')} description={t('auth.signIn.description')}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormError>{errorMessage}</FormError>
        <TextField
          label={t('auth.fields.email')}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
          }}
          error={fieldErrors.email}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <PasswordField
          label={t('auth.fields.password')}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
          error={fieldErrors.password}
          autoComplete="current-password"
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-1 text-ui text-muted-foreground">
        <Link
          to="/recuperar-senha"
          state={carryState}
          className={cn(buttonVariants({ variant: 'link', size: 'inline' }))}
        >
          {t('auth.signIn.forgot')}
        </Link>
        <p>
          {t('auth.signIn.noAccount')}{' '}
          <Link
            to="/criar-conta"
            state={carryState}
            className="text-primary underline underline-offset-2"
          >
            {t('auth.signIn.createAccount')}
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
