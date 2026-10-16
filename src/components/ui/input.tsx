import * as React from 'react'
import { cn } from '@/lib/utils'

// Campo de texto no estilo shadcn/ui. Fonte de 16 px: abaixo disso o Safari do iOS dá zoom ao focar.
function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'min-h-11 w-full rounded-tag border bg-popover px-3 text-body text-strong placeholder:text-faint md:min-h-9',
        'transition-colors duration-(--duration-ui) focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
