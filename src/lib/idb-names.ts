/**
 * Nomes dos bancos IndexedDB do app. O conteúdo de cada página fica num banco próprio do y-indexeddb,
 * `axenotes-page-<id>` (docs/adr/0001-conteudo-yjs.md).
 */
const PAGE_DB_PREFIX = 'axenotes-page-'

export const pageDbName = (pageId: string): string => `${PAGE_DB_PREFIX}${pageId}`

const openedThisSession = new Set<string>()

/**
 * Anota um banco aberto nesta aba. Sem `indexedDB.databases()` o logout não tem como listar os bancos
 * por prefixo; apaga então os nomes fixos e os anotados aqui (os de sessões anteriores ficam).
 */
export function rememberOpenedDatabase(name: string): void {
  openedThisSession.add(name)
}

export function openedDatabases(): string[] {
  return [...openedThisSession]
}

export function forgetOpenedDatabases(): void {
  openedThisSession.clear()
}
