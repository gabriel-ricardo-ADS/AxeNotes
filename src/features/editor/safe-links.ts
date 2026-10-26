/** Protocolos que um link do editor pode ter. Qualquer outro (javascript:, data:, tel:…) não vira link. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Espaços e caracteres de controle que o navegador ignora dentro de uma URL ("java\nscript:"). */
function withoutIgnoredChars(href: string): string {
  let result = ''
  for (const char of href) {
    const code = char.codePointAt(0) ?? 0
    const ignored = code <= 0x20 || code === 0x7f || /\s/u.test(char) || code === 0xfeff
    if (!ignored) result += char
  }
  return result
}

/**
 * Validador de links do editor (opção `links.isValidLink` do BlockNote): vale para colar HTML, colar
 * texto, autolink e para desenhar o link (um href inválido vira `href=""`, mesmo vindo de um Y.Doc
 * montado por outro membro). Endereço relativo conta como do próprio app (https).
 */
export function isSafeLink(href: string | null | undefined): boolean {
  if (typeof href !== 'string') return false
  const cleaned = withoutIgnoredChars(href)
  if (cleaned === '') return false
  try {
    return SAFE_PROTOCOLS.has(new URL(cleaned, 'https://axenotes.invalid/').protocol)
  } catch {
    return false
  }
}

/**
 * Abre um link do editor em outra aba SEM dar à página aberta acesso a esta (`noopener,noreferrer`;
 * o `rel` do `<a>` não vale para `window.open`). Link fora da lista não abre. Devolve se abriu.
 */
export function openSafeLink(href: string | null | undefined): boolean {
  if (!isSafeLink(href) || typeof href !== 'string') return false
  const url = new URL(href.trim(), window.location.href).href
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

/**
 * Clique num link dentro do editor (opção `links.onClick` do BlockNote): abre pelo {@link openSafeLink}
 * e marca o clique como tratado (o padrão do BlockNote abriria sem `noopener`).
 */
export function handleEditorLinkClick(event: MouseEvent): boolean {
  const target = event.target
  const anchor =
    target instanceof Element ? target.closest('a[data-inline-content-type="link"]') : null
  openSafeLink(anchor?.getAttribute('href'))
  return true
}
