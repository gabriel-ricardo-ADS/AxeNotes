import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

// Botão no estilo shadcn/ui, só com as variantes que o app usa. Alvo de toque de 44 px no mobile.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-tag text-ui font-medium transition-colors duration-(--duration-ui) disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-hover',
        ghost: 'text-muted-foreground hover:bg-hover hover:text-strong',
        link: 'text-primary underline underline-offset-2 hover:text-primary-hover',
      },
      size: {
        default: 'min-h-11 px-4 md:min-h-9',
        inline: 'min-h-11 px-2 md:min-h-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
