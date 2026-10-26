// Lógica pura da busca: normalizar o termo, reconhecer o atalho, escolher o modo da tela e marcar o
// termo no trecho. A chamada ao servidor fica em api/search.ts; o diálogo, em components/SearchDialog.tsx.
// Ver docs/CODEMAP.md §3.10.
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
  /** Trecho do corpo em volta do termo, quando só o corpo casou (o título casou: null). */
  snippet: string | null
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

export interface HighlightPart {
  text: string
  match: boolean
}

/** Um caractere como a busca o compara: sem acento e em minúsculas (como o `immutable_unaccent`). */
const fold = (char: string) => char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Divide o trecho em partes, marcando as ocorrências do termo (ignora acento e caixa, como o servidor).
 * Só texto: quem desenha usa `<mark>` nas partes `match`, sem HTML vindo do servidor.
 */
export function highlightParts(text: string, term: string): HighlightPart[] {
  const needle = Array.from(term.trim()).map(fold).join('')
  if (needle === '') return [{ text, match: false }]
  const chars = Array.from(text)
  // Texto "dobrado" e, para cada posição dele, o caractere original de onde veio.
  let folded = ''
  const origin: number[] = []
  chars.forEach((char, index) => {
    const piece = fold(char)
    folded += piece
    origin.push(...Array<number>(piece.length).fill(index))
  })
  const parts: HighlightPart[] = []
  let cursor = 0
  let from = folded.indexOf(needle)
  while (from !== -1) {
    const start = origin[from] ?? chars.length
    const end = (origin[from + needle.length - 1] ?? chars.length - 1) + 1
    if (start > cursor) parts.push({ text: chars.slice(cursor, start).join(''), match: false })
    parts.push({ text: chars.slice(start, end).join(''), match: true })
    cursor = end
    from = folded.indexOf(needle, from + needle.length)
  }
  if (cursor < chars.length) parts.push({ text: chars.slice(cursor).join(''), match: false })
  return parts
}

/** Texto anunciado ao leitor de tela quando os resultados chegam. */
export function resultsAnnouncement(count: number): string {
  if (count <= 0) return t('search.empty')
  return count === 1 ? t('search.oneResult') : t('search.results', { count })
}

/** Como está o workspace do usuário, do ponto de vista da busca. */
export type WorkspaceState = 'pending' | 'error' | 'none' | 'ready'

export type SearchMode = 'recents' | 'loading' | 'error' | 'results'

interface SearchModeInput {
  /** Termo digitado, já normalizado (vazio = sem texto). */
  normalized: string
  /** O mesmo termo depois do debounce. */
  debounced: string
  /**
   * `pending` = carregando de verdade (`isPending` com a consulta rodando); `error` = falhou e não há dados;
   * `none` = não há workspace (resposta `null` ou consulta parada, que nunca vai carregar); `ready` = tem workspace.
   */
  workspace: WorkspaceState
  recents: { failed: boolean; loading: boolean }
  search: { isPending: boolean; isError: boolean }
}

/**
 * O que o diálogo mostra. O workspace vem primeiro: a busca só é habilitada com ele, e uma consulta desabilitada
 * fica `isPending` para sempre, então sem este filtro "Buscando…" nunca terminaria. Sem workspace (`none`) não
 * há o que buscar: com texto, resultado vazio; sem texto, recentes (vazios).
 */
export function resolveSearchMode({
  normalized,
  debounced,
  workspace,
  recents,
  search,
}: SearchModeInput): SearchMode {
  if (workspace === 'error') return 'error'
  if (workspace === 'pending') return 'loading'
  if (normalized === '') return recents.failed ? 'error' : recents.loading ? 'loading' : 'recents'
  if (workspace === 'none') return 'results'
  if (debounced !== normalized || search.isPending) return 'loading'
  return search.isError ? 'error' : 'results'
}
