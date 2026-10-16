// Estilo comum das linhas da sidebar (árvore, favoritos). Com mouse, o grupo de ações fica sobreposto
// à direita da linha e só aparece ao passar o mouse ou focar (não rouba espaço do título). No toque
// (sem hover) fica na própria linha, sempre visível.
export const rowActionsClass =
  'flex shrink-0 items-center [@media(hover:hover)]:absolute [@media(hover:hover)]:inset-y-0 [@media(hover:hover)]:right-0 [@media(hover:hover)]:rounded-tag [@media(hover:hover)]:bg-hover [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100 data-[open=true]:opacity-100'

export const rowButtonClass =
  'flex h-11 w-9 shrink-0 items-center justify-center rounded-tag text-muted-foreground hover:bg-hover hover:text-strong md:h-7 md:w-6 md:pointer-coarse:h-11 md:pointer-coarse:w-9'
