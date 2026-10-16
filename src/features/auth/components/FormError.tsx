/** Erro geral de um formulário (não de um campo). `role="alert"` faz o leitor de tela anunciar. */
export function FormError({ children }: { children: string | null | undefined }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-tag border border-danger/50 bg-red-block px-3 py-2 text-ui text-red"
    >
      {children}
    </p>
  )
}

/** Aviso neutro (ex.: "enviamos um novo código"). */
export function FormNotice({ children }: { children: string | null | undefined }) {
  if (!children) return null
  return (
    <p
      role="status"
      className="rounded-tag border bg-popover px-3 py-2 text-ui text-muted-foreground"
    >
      {children}
    </p>
  )
}
