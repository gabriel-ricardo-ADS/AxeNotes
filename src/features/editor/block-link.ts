// Link para um bloco: /p/:pageId#bloco-<id>. Abrir esse endereço rola até o bloco e o destaca por ~2 s.
// Ver docs/CODEMAP.md §3.15.

/** Prefixo do hash que aponta para um bloco. */
export const BLOCK_HASH_PREFIX = '#bloco-'

/** Quanto tempo o bloco fica destacado. */
export const BLOCK_HIGHLIGHT_MS = 2000

// Ids de bloco do BlockNote: uuid, ou "initialBlockId" no primeiro bloco de uma página nova.
const BLOCK_ID = /^[A-Za-z0-9-]{1,64}$/

/** Endereço completo do link para o bloco. */
export function blockLinkUrl(origin: string, pageId: string, blockId: string): string {
  return `${origin}/p/${pageId}${BLOCK_HASH_PREFIX}${blockId}`
}

/** O id do bloco no hash (`#bloco-<id>`), ou null se o hash não for um link de bloco válido. */
export function parseBlockHash(hash: string): string | null {
  if (!hash.startsWith(BLOCK_HASH_PREFIX)) return null
  const id = hash.slice(BLOCK_HASH_PREFIX.length)
  return BLOCK_ID.test(id) ? id : null
}

/** Cor do destaque (o azul de foco do app, translúcido). */
const HIGHLIGHT = 'rgb(35 131 226 / 0.28)'

/**
 * Acha o bloco dentro do editor, rola até ele e o destaca por {@link BLOCK_HIGHLIGHT_MS} com uma animação
 * de fundo (Web Animations: o ProseMirror redesenha o DOM do bloco e apagaria um atributo ou classe
 * nossos). Devolve false se o bloco (ainda) não está na tela. Não põe o foco nele: no celular, isso
 * abriria o teclado.
 */
export function revealBlock(root: HTMLElement, blockId: string): boolean {
  if (!BLOCK_ID.test(blockId)) return false
  const outer = root.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(blockId)}"]`)
  if (!outer) return false
  const block = outer.querySelector<HTMLElement>(':scope > .bn-block') ?? outer

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // jsdom (testes) não implementa scrollIntoView nem animate.
  if (typeof outer.scrollIntoView === 'function') {
    outer.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }
  if (typeof block.animate === 'function') {
    // Sem movimento: o destaque fica parado e some no fim, sem esmaecer.
    const fade = reduceMotion
      ? [{ backgroundColor: HIGHLIGHT }, { backgroundColor: HIGHLIGHT }]
      : [
          { backgroundColor: HIGHLIGHT, offset: 0 },
          { backgroundColor: HIGHLIGHT, offset: 0.4 },
          { backgroundColor: 'transparent', offset: 1 },
        ]
    block.animate(fade, {
      duration: BLOCK_HIGHLIGHT_MS,
      easing: 'ease-out',
      id: 'axn-block-highlight',
    })
  }
  return true
}
