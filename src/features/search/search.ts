import type { PageRow } from '@/features/workspace/types'
import { t } from '@/i18n'

/** Quantos resultados o cliente pede (o servidor aceita até 50). */
export const SEARCH_LIMIT = 20
/** Espera depois da última tecla antes de consultar o servidor. */
export const SEARCH_DEBOUNCE_MS = 200
/**
 * Tamanho máximo do termo. O título tem no máximo 500 caracteres, então nenhum termo útil passa disso;
 * cortar só alarga a busca (ela é por trecho), nunca esconde um resultado.
 */
export const SEARCH_MAX_LENGTH = 200

/** Um resultado de `search_pages`: o servidor não devolve `sort_key`, então não é um `PageRow`. */
export interface SearchResult {
  id: string
  parentId: string | null
  title: string
  icon: PageRow['icon']
  /** ISO 8601. */
  lastEditedAt: string
}

/**
 * Termo como vai ao servidor: sem espaços nas pontas, em NFC (um "é" decomposto vira o "é" comum) e com
 * no máximo SEARCH_MAX_LENGTH caracteres. NÃO tira acento, não muda a caixa e NÃO escapa `%`, `_` ou `\`:
 * isso é do servidor (`search_pages`), e escapar duas vezes quebraria a busca. Vazio = "sem texto".
 */
export function normalizeTerm(raw: string): string {
  const term = raw.normalize('NFC').trim()
  return Array.from(term).slice(0, SEARCH_MAX_LENGTH).join('').trim()
}

interface ShortcutEvent {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
  isComposing: boolean
}

/**
 * É o atalho de busca? Mac: ⌘K (no Mac, Ctrl+K é "apagar até o fim da linha" nos campos de texto).
 * Windows/Linux: Ctrl+K. Sem Alt nem Shift; ignora tecla segurada e composição de IME. Layouts sem a letra
 * K ASCII (ex.: cirílico) valem pela tecla física.
 */
export function isSearchShortcut(event: ShortcutEvent, isMac: boolean): boolean {
  if (event.repeat || event.isComposing || event.altKey || event.shiftKey) return false
  if (isMac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return false
  const key = event.key.toLowerCase()
  return /^[a-z]$/.test(key) ? key === 'k' : event.code === 'KeyK'
}

/** O aparelho é um Mac (inclui iPad com teclado, que se apresenta como Mac)? */
export function detectMac(nav: {
  platform?: string
  userAgentData?: { platform?: string }
}): boolean {
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ''
  return /mac/i.test(platform)
}

/**
 * Há um diálogo modal aberto que NÃO é a gaveta do mobile nem a própria busca? (Mover para…, ícone, excluir
 * definitivamente.) Nesse caso o atalho não abre a busca por cima.
 */
export function hasForeignModal(root: ParentNode): boolean {
  const open = root.querySelectorAll(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  )
  return [...open].some(
    (element) =>
      element.getAttribute('data-slot') !== 'sheet-content' &&
      !element.hasAttribute('data-search-dialog'),
  )
}

/** Opção ativa depois de ↑ ou ↓, com volta nas pontas. Sem opções: -1. */
export function moveActive(index: number, key: 'ArrowDown' | 'ArrowUp', length: number): number {
  if (length <= 0) return -1
  if (key === 'ArrowDown') return index < 0 || index >= length - 1 ? 0 : index + 1
  return index <= 0 ? length - 1 : index - 1
}

const MAX_PATH_PARTS = 2

/**
 * Caminho curto da página para a lista: os ancestrais (do topo ao pai), sem a página inicial, só os dois
 * últimos e "…" antes quando há mais. `null` se não há ancestral (página na raiz).
 */
export function searchPath(ancestors: readonly PageRow[], homeId: string | null): string | null {
  const titles = ancestors
    .filter((page) => page.id !== homeId)
    .map((page) => page.title || t('workspace.tree.untitled'))
  if (titles.length === 0) return null
  const shown = titles.slice(-MAX_PATH_PARTS)
  return [...(titles.length > shown.length ? ['…'] : []), ...shown].join(t('search.pathSeparator'))
}

/** Texto anunciado ao leitor de tela quando os resultados chegam. */
export function resultsAnnouncement(count: number): string {
  if (count <= 0) return t('search.empty')
  return count === 1 ? t('search.oneResult') : t('search.results', { count })
}
