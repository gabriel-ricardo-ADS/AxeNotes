import { useId, type ComponentProps, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string
  error?: string | undefined
  hint?: string | undefined
  /** Conteúdo à direita dentro do campo (ex.: botão de mostrar a senha). */
  trailing?: ReactNode
}

/** Campo com rótulo, dica e erro ligados por aria (o erro é anunciado ao leitor de tela). */
export function TextField({ label, error, hint, trailing, className, ...props }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ui font-medium text-strong">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={trailing ? `pr-12 ${className ?? ''}` : className}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-meta text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
