import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'
import { TextField, type TextFieldProps } from '@/features/auth/components/TextField'
import { t } from '@/i18n'

type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>

/** Campo de senha com botão de mostrar/ocultar (no lugar de "confirmar senha", que cansa no celular). */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      // Evita que o corretor/maiúscula automática mexa na senha.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          aria-label={visible ? t('auth.password.hide') : t('auth.password.show')}
          aria-pressed={visible}
          onClick={() => {
            setVisible((value) => !value)
          }}
          className="flex size-11 items-center justify-center rounded-tag text-muted-foreground hover:text-strong md:size-9"
        >
          {visible ? (
            <EyeOffIcon className="size-4" aria-hidden="true" />
          ) : (
            <EyeIcon className="size-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  )
}
