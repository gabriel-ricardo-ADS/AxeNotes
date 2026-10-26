import {
  BLOCK_HIGHLIGHT_MS,
  blockLinkUrl,
  parseBlockHash,
  revealBlock,
} from '@/features/editor/block-link'
import { installMatchMedia } from '@/test/match-media'

// O helper de matchMedia importa o layout do app, que traz o cliente Supabase (sem .env na CI).
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const PAGE = '00000000-0000-4000-8000-000000000001'
const BLOCK = '1f0e6c3a-7b1e-4c5d-9a2b-3c4d5e6f7a8b'

describe('blockLinkUrl / parseBlockHash', () => {
  it('builds /p/:pageId#bloco-<id> and reads it back', () => {
    const url = blockLinkUrl('https://app.exemplo', PAGE, BLOCK)
    expect(url).toBe(`https://app.exemplo/p/${PAGE}#bloco-${BLOCK}`)
    expect(parseBlockHash(new URL(url).hash)).toBe(BLOCK)
    // O primeiro bloco de uma página nova tem esse id no BlockNote.
    expect(parseBlockHash('#bloco-initialBlockId')).toBe('initialBlockId')
  })

  it('refuses anything that is not a block id (no selector built from raw text)', () => {
    for (const hash of [
      '',
      '#',
      '#bloco-',
      `#outro-${BLOCK}`,
      '#bloco-a"]',
      '#bloco-a b',
      '#bloco-<img src=x>',
      `#bloco-${'a'.repeat(65)}`,
    ]) {
      expect(parseBlockHash(hash)).toBeNull()
    }
  })
})

function getRoot(): HTMLElement {
  const root = document.getElementById('root')
  if (!root) throw new Error('no root')
  return root
}

describe('revealBlock', () => {
  beforeEach(() => {
    installMatchMedia(true)
    document.body.innerHTML = `<div id="root"><div class="bn-block-outer" data-id="${BLOCK}"><div class="bn-block">texto</div></div></div>`
  })

  it('scrolls to the block and highlights it for ~2 s (an animation, not a DOM change)', () => {
    const root = getRoot()
    const outer = getRoot().querySelector<HTMLElement>('.bn-block-outer') ?? getRoot()
    const inner = getRoot().querySelector<HTMLElement>('.bn-block') ?? getRoot()
    const scrollIntoView = vi.fn()
    const animate = vi.fn()
    outer.scrollIntoView = scrollIntoView
    inner.animate = animate

    expect(revealBlock(root, BLOCK)).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: BLOCK_HIGHLIGHT_MS, id: 'axn-block-highlight' }),
    )
    expect(outer.outerHTML).not.toContain('highlight')
  })

  it('returns false when the block is not there (yet) or the id is invalid', () => {
    const root = getRoot()
    expect(revealBlock(root, '00000000-0000-4000-8000-00000000dead')).toBe(false)
    expect(revealBlock(root, 'a"]')).toBe(false)
  })
})
