/**
 * Nomes dos bancos IndexedDB do app. O conteúdo de cada página fica num banco próprio do y-indexeddb,
 * `axenotes-page-<id>` (docs/adr/0001-conteudo-yjs.md).
 */
const PAGE_DB_PREFIX = 'axenotes-page-'

/** Metadados da sincronização (estado e última abertura de cada página), nome fixo. */
export const SYNC_META_DB = 'axenotes-sync'
/** Nome do object store de `SYNC_META_DB` (uma linha por página, chave `pageId`). */
export const SYNC_META_STORE = 'pages'

/** Nome do banco IndexedDB do y-indexeddb de uma página: `axenotes-page-<id>`. */
export const pageDbName = (pageId: string): string => `${PAGE_DB_PREFIX}${pageId}`

/** Id da página de um banco `axenotes-page-<id>`; `null` para outros bancos. */
export const pageIdFromDbName = (name: string): string | null =>
  name.startsWith(PAGE_DB_PREFIX) && name.length > PAGE_DB_PREFIX.length
    ? name.slice(PAGE_DB_PREFIX.length)
    : null

const openedThisSession = new Set<string>()

/**
 * Anota um banco aberto nesta aba. Sem `indexedDB.databases()` o logout não tem como listar os bancos
 * por prefixo; apaga então os nomes fixos e os anotados aqui (os de sessões anteriores ficam).
 */
export function rememberOpenedDatabase(name: string): void {
  openedThisSession.add(name)
}

/** Bancos de página abertos nesta aba (anotados por `rememberOpenedDatabase`). */
export function openedDatabases(): string[] {
  return [...openedThisSession]
}

/** Esquece os bancos anotados (depois de apagá-los no logout). */
export function forgetOpenedDatabases(): void {
  openedThisSession.clear()
}
