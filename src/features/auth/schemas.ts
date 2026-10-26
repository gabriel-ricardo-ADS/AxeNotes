import { z } from 'zod'
import { t } from '@/i18n'

/**
 * Tamanho do código OTP. Precisa bater com "Email OTP Length" do painel do Supabase
 * (Authentication → Sign In / Providers → Email); ver supabase/README.md.
 */
export const CODE_LENGTH = 6

/** O Supabase (bcrypt) aceita no máximo 72 BYTES de senha, não 72 caracteres. */
const PASSWORD_MAX_BYTES = 72
const PASSWORD_MIN_LENGTH = 8
const NAME_MAX_LENGTH = 100 // mesmo limite do trigger de cadastro (handle_new_user)

const encoder = new TextEncoder()

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, t('auth.errors.emailRequired'))
  .pipe(z.email(t('auth.errors.emailInvalid')))

/** Senha nova (cadastro e recuperação): regras de força. No login só exigimos que exista. */
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, t('auth.errors.passwordTooShort'))
  .refine((value) => encoder.encode(value).length <= PASSWORD_MAX_BYTES, {
    error: t('auth.errors.passwordTooLong'),
  })

const code = z
  .string()
  .regex(new RegExp(`^\\d{${String(CODE_LENGTH)}}$`), t('auth.errors.codeInvalid'))

/**
 * Login: e-mail válido e senha preenchida (as regras de força valem só ao criar ou trocar a
 * senha).
 */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, t('auth.errors.passwordRequired')),
})

/** Cadastro: nome (até 100 caracteres), e-mail e senha nova (mínimo 8 caracteres, até 72 bytes). */
export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, t('auth.errors.nameRequired'))
    .max(NAME_MAX_LENGTH, t('auth.errors.nameTooLong')),
  email,
  password: newPassword,
})

/** Só o e-mail (pedir a recuperação da senha, reenviar o código). */
export const emailSchema = z.object({ email })
/** E-mail e código de 6 dígitos (confirmar o cadastro e a recuperação). */
export const verifyCodeSchema = z.object({ email, code })
/** Senha nova da recuperação, com as mesmas regras de força do cadastro. */
export const newPasswordSchema = z.object({ password: newPassword })

/** Só dígitos, no máximo CODE_LENGTH: aceita colar "123 456", "123-456" etc. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

/** Primeira mensagem de erro de cada campo, indexada pelo nome do campo. */
export type FieldErrors = Partial<Record<string, string>>

/** Primeira mensagem de cada campo, para mostrar sob o input correspondente. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '')
    out[field] ??= issue.message
  }
  return out
}
