import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { KEEP_EDITOR_FOCUS } from '@/features/editor/touch/touch-editor'

interface BarButtonProps {
  label: string
  /** Ícone; sem ele, desenha `children` (a amostra de cor). */
  icon?: LucideIcon
  children?: ReactNode
  onClick: () => void
  pressed?: boolean
  expanded?: boolean
  disabled?: boolean
  /** Fechar teclado: o toque pode tirar o foco (é o que ele faz). */
  allowBlur?: boolean
}

/** Botão de 44 px da barra e dos painéis do toque; o toque não tira o foco do editor (nem o teclado). */
export function BarButton({
  label,
  icon: Icon,
  children,
  onClick,
  pressed,
  expanded,
  disabled,
  allowBlur,
}: BarButtonProps) {
  return (
    <button
      type="button"
      className="axn-touch-button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      {...(allowBlur ? {} : KEEP_EDITOR_FOCUS)}
    >
      {Icon ? <Icon size={20} aria-hidden="true" /> : children}
    </button>
  )
}
