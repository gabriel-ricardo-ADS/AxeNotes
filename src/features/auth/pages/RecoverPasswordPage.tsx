import { useMutation } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { requestPasswordReset, updatePassword, verifyRecoveryCode } from '@/features/auth/api/auth'
import { useAuth } from '@/features/auth/auth-context'
import { AuthCard } from '@/features/auth/components/AuthLayout'
import { CodeInput } from '@/features/auth/components/CodeInput'
import { FormError, FormNotice } from '@/features/auth/components/FormError'
import { PasswordField } from '@/features/auth/components/PasswordField'
import { ResendButton } from '@/features/auth/components/ResendButton'
import { TextField } from '@/features/auth/components/TextField'
import { authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { useCooldown } from '@/features/auth/hooks/use-cooldown'
import {
  emailSchema,
  newPasswordSchema,
  toFieldErrors,
  verifyCodeSchema,
  type FieldErrors,
} from '@/features/auth/schemas'
import { t } from '@/i18n'

const RESEND_COOLDOWN_SECONDS = 60

type Step = 'email' | 'code' | 'password'

/**
 * /recuperar-senha, em três etapas: e-mail → código de 6 dígitos → nova senha. A resposta ao
 * pedir o código é sempre a mesma, exista a conta ou não (não revela cadastros).
 */
export function RecoverPasswordPage() {
  const { setRecovering } = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS)

  const request = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      cooldown.start()
    },
    onError: (error) => {
      if (mapAuthError(error) === 'rate_limited') cooldown.start()
    },
  })
  const verify = useMutation({
    mutationFn: (values: { email: string; code: string }) =>
      verifyRecoveryCode(values.email, values.code),
  })
  const save = useMutation({ mutationFn: updatePassword })

  const error = request.error ?? verify.error ?? save.error
  const errorMessage = error ? t(authErrorMessageKey(mapAuthError(error))) : null

  function sendCode(event: SyntheticEvent) {
    event.preventDefault()
    const parsed = emailSchema.safeParse({ email })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    request.mutate(parsed.data.email, {
      onSuccess: () => {
        setNotice(null)
        setCode('')
        setStep('code')
      },
    })
  }

  function resendCode() {
    const parsed = emailSchema.safeParse({ email })
    if (!parsed.success) return
    verify.reset()
    request.mutate(parsed.data.email, {
      onSuccess: () => {
        setNotice(t('auth.code.resent'))
      },
    })
  }

  function submitCode(currentCode: string) {
    if (verify.isPending) return
    const parsed = verifyCodeSchema.safeParse({ email, code: currentCode })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    setNotice(null)
    request.reset()
    // Marca a recuperação ANTES de verificar: o código aceito já abre uma sessão, e a guarda
    // "só deslogado" não pode tirar a pessoa daqui antes da nova senha. Se falhar, desfaz.
    setRecovering(true)
    verify.mutate(parsed.data, {
      onSuccess: () => {
        setPassword('')
        setStep('password')
      },
      onError: () => {
        setRecovering(false)
        setCode('')
      },
    })
  }

  function submitPassword(event: SyntheticEvent) {
    event.preventDefault()
    const parsed = newPasswordSchema.safeParse({ password })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    save.mutate(parsed.data.password, {
      // Sessão já existe: ao liberar a guarda, o app abre sozinho.
      onSuccess: () => {
        setRecovering(false)
      },
    })
  }

  if (step === 'password') {
    return (
      <AuthCard
        title={t('auth.recover.newPasswordTitle')}
        description={t('auth.recover.newPasswordDescription')}
      >
        <form noValidate onSubmit={submitPassword} className="flex flex-col gap-4">
          <FormError>{errorMessage}</FormError>
          <PasswordField
            label={t('auth.fields.newPassword')}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
            error={fieldErrors.password}
            hint={t('auth.password.hint')}
            autoComplete="new-password"
          />
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('auth.recover.saving') : t('auth.recover.savePassword')}
          </Button>
        </form>
      </AuthCard>
    )
  }

  if (step === 'code') {
    return (
      <AuthCard
        title={t('auth.recover.title')}
        description={t('auth.recover.codeDescription', { email })}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submitCode(code)
          }}
          className="flex flex-col gap-4"
        >
          <FormError>{errorMessage}</FormError>
          <FormNotice>{notice}</FormNotice>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            error={fieldErrors.code}
            disabled={verify.isPending}
            focusOnMount
          />
          <p className="text-meta text-muted-foreground">{t('auth.code.hint')}</p>
          <Button type="submit" disabled={verify.isPending}>
            {verify.isPending ? t('auth.recover.verifying') : t('auth.recover.verify')}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-1">
          <ResendButton
            remaining={cooldown.remaining}
            pending={request.isPending}
            onClick={resendCode}
          />
          <Link to="/entrar" className="text-ui text-primary underline underline-offset-2">
            {t('auth.recover.backToSignIn')}
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.recover.title')} description={t('auth.recover.emailDescription')}>
      <form noValidate onSubmit={sendCode} className="flex flex-col gap-4">
        <FormError>{errorMessage}</FormError>
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
        <Button type="submit" disabled={request.isPending}>
          {request.isPending ? t('auth.recover.sending') : t('auth.recover.sendCode')}
        </Button>
      </form>
      <p className="text-center">
        <Link to="/entrar" className="text-ui text-primary underline underline-offset-2">
          {t('auth.recover.backToSignIn')}
        </Link>
      </p>
    </AuthCard>
  )
}
