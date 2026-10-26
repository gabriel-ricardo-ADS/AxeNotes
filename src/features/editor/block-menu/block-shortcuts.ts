// Atalhos do bloco no editor: Ctrl/⌘+D duplica, Alt+Shift+L copia o link do bloco, Ctrl/⌘+/ abre o menu
// do bloco e Enter num link de página abre a página. Só valem com o foco DENTRO do editor: em diálogos,
// na busca e no título da página as teclas seguem fazendo o que já faziam. Ver docs/CODEMAP.md §3.15.

/** O que um atalho pede. */
export type BlockShortcut = 'duplicate' | 'copyLink' | 'openMenu'

/** As teclas de um evento (o suficiente para testar sem DOM). */
export interface ShortcutKeys {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Mac, iPhone ou iPad (⌘ no lugar do Ctrl). */
export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

/** Qual atalho do bloco estas teclas formam, se algum. */
export function matchBlockShortcut(keys: ShortcutKeys, apple: boolean): BlockShortcut | null {
  const mod = apple ? keys.metaKey && !keys.ctrlKey : keys.ctrlKey && !keys.metaKey
  // Com Alt no Mac o `key` vira outro caractere ("¬"): a tecla física vem em `code`.
  if (keys.altKey && keys.shiftKey && !keys.ctrlKey && !keys.metaKey && keys.code === 'KeyL') {
    return 'copyLink'
  }
  if (!mod || keys.altKey) return null
  if (!keys.shiftKey && keys.key.toLowerCase() === 'd') return 'duplicate'
  if (keys.key === '/' || keys.code === 'Slash') return 'openMenu'
  return null
}

/** O que o editor faz com cada atalho (recebe o bloco onde está o cursor). */
export interface BlockShortcutHandlers {
  /** O editor aceita edição agora? Leitor e lixeira: nenhum atalho age. */
  isEditable: () => boolean
  /** O elemento editável (contenteditable) do BlockNote. */
  editorElement: () => HTMLElement | undefined
  run: (shortcut: BlockShortcut) => void
  /** Enter com um link de página selecionado: abre o link. Devolve true se tratou. */
  openPageLink: () => boolean
}

/**
 * Escuta as teclas na raiz do editor (fase de captura, antes do BlockNote) e age só quando o evento
 * nasce dentro do elemento editável. Devolve a função que para de escutar.
 */
export function listenBlockShortcuts(
  root: HTMLElement,
  handlers: BlockShortcutHandlers,
  apple = isApplePlatform(),
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || !handlers.isEditable()) return
    const editable = handlers.editorElement()
    if (!editable || !(event.target instanceof Node) || !editable.contains(event.target)) return

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (handlers.openPageLink()) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }

    const shortcut = matchBlockShortcut(event, apple)
    if (shortcut === null) return
    event.preventDefault()
    event.stopPropagation()
    handlers.run(shortcut)
  }
  root.addEventListener('keydown', onKeyDown, true)
  return () => {
    root.removeEventListener('keydown', onKeyDown, true)
  }
}
