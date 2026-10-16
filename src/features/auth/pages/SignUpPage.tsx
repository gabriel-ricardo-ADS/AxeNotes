import { useMutation } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { signUp } from '@/features/auth/api/auth'
import { AuthCard } from '@/features/auth/components/AuthLayout'
import { FormError } from '@/features/auth/components/FormError'
import { PasswordField } from '@/features/auth/components/PasswordField'
import { TextField } from '@/features/auth/components/TextField'
import { authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { readFrom } from '@/features/auth/navigation-state'
import { signUpSchema, toFieldErrors, type FieldErrors } from '@/features/auth/schemas'
import { t } from '@/i18n'

/** /criar-conta: nome, e-mail e senha; depois segue para o código de 6 dígitos enviado por e-mail. */
export function SignUpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const mutation = useMutation({ mutationFn: signUp })
  const errorMessage = mutation.error ? t(authErrorMessageKey(mapAuthError(mutation.error))) : null

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    const parsed = signUpSchema.safeParse({ name, email, password })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    mutation.mutate(parsed.data, {
      onSuccess: () => {
        void navigate('/codigo', {
          state: { email: parsed.data.email, sent: true, from: readFrom(location.state) },
        })
      },
    })
  }

  const from = readFrom(location.state)
  const carryState = from === undefined ? undefined : { from }

  return (
    <AuthCard title={t('auth.signUp.title')} description={t('auth.signUp.description')}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormError>{errorMessage}</FormError>
        <TextField
          label={t('auth.fields.name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          error={fieldErrors.name}
          autoComplete="name"
        />
        <TextField
          label={t('auth.fields.email')}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
          }}
          error={fieldErrors.email}
          autoComplete="email"
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
          hint={t('auth.password.hint')}
          autoComplete="new-password"
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('auth.signUp.submitting') : t('auth.signUp.submit')}
        </Button>
      </form>

      <p className="text-center text-ui text-muted-foreground">
        {t('auth.signUp.hasAccount')}{' '}
        <Link to="/entrar" state={carryState} className="text-primary underline underline-offset-2">
          {t('auth.signUp.signIn')}
        </Link>
      </p>
    </AuthCard>
  )
}
