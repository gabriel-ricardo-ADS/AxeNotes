import { useEffect, useRef, type ChangeEvent } from 'react'
import { TextField } from '@/features/auth/components/TextField'
import { CODE_LENGTH, normalizeCode } from '@/features/auth/schemas'
import { t } from '@/i18n'

interface CodeInputProps {
  value: string
  onChange: (value: string) => void
  /** Chamado uma vez quando o código chega a 6 dígitos (digitado, colado ou autopreenchido). */
  onComplete?: (code: string) => void
  error?: string | undefined
  disabled?: boolean
  /** Foca o campo ao montar (pelo efeito, não pelo atributo autoFocus). */
  focusOnMount?: boolean
}

/**
 * Código de 6 dígitos. Um único <input> (não seis caixas): é o que o autopreenchimento do iOS
 * (`one-time-code`) e o colar esperam. Não usa maxLength de propósito, para o colar de "123 456"
 * não ser cortado antes de limparmos os caracteres que não são dígitos.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  error,
  disabled,
  focusOnMount,
}: CodeInputProps) {
  const completedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus()
  }, [focusOnMount])

  // Se quem usa o campo apagar o valor (ex.: depois de um código errado), vale completar de novo.
  useEffect(() => {
    if (value.length < CODE_LENGTH) completedRef.current = false
  }, [value])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = normalizeCode(event.target.value)
    onChange(next)

    if (next.length >= CODE_LENGTH && !completedRef.current) {
      completedRef.current = true
      onComplete?.(next)
    }
  }

  return (
    <TextField
      label={t('auth.fields.code')}
      value={value}
      onChange={handleChange}
      error={error}
      disabled={disabled}
      ref={inputRef}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder="000000"
      className="text-center text-h3 tracking-[0.4em] tabular-nums"
    />
  )
}
