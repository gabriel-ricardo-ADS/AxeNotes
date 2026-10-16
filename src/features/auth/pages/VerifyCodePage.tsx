import { useMutation } from '@tanstack/react-query'
import { useState, type SyntheticEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { resendSignupCode, verifySignupCode } from '@/features/auth/api/auth'
import { AuthCard } from '@/features/auth/components/AuthLayout'
import { CodeInput } from '@/features/auth/components/CodeInput'
import { FormError, FormNotice } from '@/features/auth/components/FormError'
import { ResendButton } from '@/features/auth/components/ResendButton'
import { TextField } from '@/features/auth/components/TextField'
import { authErrorMessageKey, mapAuthError } from '@/features/auth/errors'
import { readCodeState } from '@/features/auth/navigation-state'
import {
  emailSchema,
  toFieldErrors,
  verifyCodeSchema,
  type FieldErrors,
} from '@/features/auth/schemas'
import { useCooldown } from '@/features/auth/hooks/use-cooldown'
import { t } from '@/i18n'

/** Espera entre reenvios de código (o Supabase também limita o envio de e-mails no servidor). */
const RESEND_COOLDOWN_SECONDS = 60

/**
 * /codigo: confirma o cadastro com o código de 6 dígitos. Sem `location.state` (PWA do iOS
 * reaberto) pede o e-mail antes do código, em vez de redirecionar.
 */
export function VerifyCodePage() {
  const location = useLocation()
  const known = readCodeState(location.state)

  const [emailInput, setEmailInput] = useState(known.email ?? '')
  const [code, setCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS, known.sent === true)

  const verify = useMutation({
    mutationFn: (values: { email: string; code: string }) =>
      verifySignupCode(values.email, values.code),
    // Código errado: limpa o campo para digitar de novo (e liberar o envio automático).
    onError: () => {
      setCode('')
    },
  })
  const resend = useMutation({
    mutationFn: resendSignupCode,
    onSuccess: () => {
      setNotice(t('auth.code.resent'))
      cooldown.start()
    },
    onError: (error) => {
      if (mapAuthError(error) === 'rate_limited') cooldown.start()
    },
  })

  const error = verify.error ?? resend.error
  const errorMessage = error ? t(authErrorMessageKey(mapAuthError(error))) : null

  function submit(currentCode: string) {
    if (verify.isPending) return
    const parsed = verifyCodeSchema.safeParse({ email: emailInput, code: currentCode })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    setNotice(null)
    resend.reset()
    verify.mutate(parsed.data)
  }

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    submit(code)
  }

  function handleResend() {
    const parsed = emailSchema.safeParse({ email: emailInput })
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error))
      return
    }
    setFieldErrors({})
    verify.reset()
    resend.mutate(parsed.data.email)
  }

  const description = known.email
    ? t('auth.code.description', { email: known.email })
    : t('auth.code.descriptionNoEmail')

  return (
    <AuthCard title={t('auth.code.title')} description={description}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormError>{errorMessage}</FormError>
        <FormNotice>{notice}</FormNotice>
        {known.email ? null : (
          <TextField
            label={t('auth.fields.email')}
            type="email"
            value={emailInput}
            onChange={(event) => {
              setEmailInput(event.target.value)
            }}
            error={fieldErrors.email}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
        <CodeInput
          value={code}
          onChange={setCode}
          onComplete={submit}
          error={fieldErrors.code}
          disabled={verify.isPending}
          focusOnMount={known.email !== undefined}
        />
        <p className="text-meta text-muted-foreground">{t('auth.code.hint')}</p>
        <Button type="submit" disabled={verify.isPending}>
          {verify.isPending ? t('auth.code.submitting') : t('auth.code.submit')}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-1">
        <ResendButton
          remaining={cooldown.remaining}
          pending={resend.isPending}
          onClick={handleResend}
        />
        <Link to="/entrar" className="text-ui text-primary underline underline-offset-2">
          {t('auth.code.backToSignIn')}
        </Link>
      </div>
    </AuthCard>
  )
}
