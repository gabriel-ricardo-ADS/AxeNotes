import { blocksToYXmlFragment, yXmlFragmentToBlocks } from '@blocknote/core/yjs'
import * as Y from 'yjs'
import { handleEditorLinkClick, isSafeLink, openSafeLink } from '@/features/editor/safe-links'
import { createTestEditor } from '@/features/editor/test-editor'

// O schema traz o link de página, que lê páginas pela API: sem o cliente de verdade (nem .env).
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const DANGEROUS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'java\nscript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'tel:+5511999999999',
  'ftp://exemplo.com/arquivo',
]

/** Todos os href de links num HTML (o que o editor desenha). */
function hrefsIn(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return [...doc.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '')
}

describe('isSafeLink', () => {
  it('accepts http, https and mailto (and relative links inside the app)', () => {
    for (const href of [
      'https://exemplo.com',
      'http://exemplo.com/a?b=c#d',
      'mailto:ana@exemplo.com',
      '/p/00000000-0000-4000-8000-000000000001#bloco-1',
    ]) {
      expect(isSafeLink(href)).toBe(true)
    }
  })

  it('refuses every other protocol, hidden or not', () => {
    for (const href of [...DANGEROUS, '', null, undefined]) {
      expect(isSafeLink(href)).toBe(false)
    }
  })
})

describe('links in the editor', () => {
  it('drops dangerous links when HTML is pasted (the text stays, the link does not)', () => {
    const editor = createTestEditor()
    for (const href of DANGEROUS) {
      const blocks = editor.tryParseHTMLToBlocks(`<p><a href="${href}">clique</a></p>`)
      const content = JSON.stringify(blocks)
      expect(content).toContain('clique')
      expect(content).not.toContain('"type":"link"')
    }
    const safe = JSON.stringify(
      editor.tryParseHTMLToBlocks('<p><a href="https://exemplo.com">ok</a></p>'),
    )
    expect(safe).toContain('"href":"https://exemplo.com"')
  })

  it('never renders a dangerous href, even from a Y.Doc built by hand', () => {
    // Os blocos entram direto (sem passar por colar/validar), como chegariam de outro aparelho.
    const source = createTestEditor()
    source.replaceBlocks(source.document, [
      {
        type: 'paragraph',
        content: DANGEROUS.map((href) => ({
          type: 'link' as const,
          href,
          content: [{ type: 'text' as const, text: 'x', styles: {} }],
        })),
      },
      {
        type: 'paragraph',
        content: [{ type: 'link', href: 'https://exemplo.com', content: 'ok' }],
      },
    ])
    expect(JSON.stringify(source.document)).toContain('javascript:alert(1)')

    const editor = createTestEditor()
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('document-store')
    blocksToYXmlFragment(editor, source.document, fragment)

    const loaded = yXmlFragmentToBlocks(editor, fragment)
    const html = editor.blocksToFullHTML(loaded)
    const hrefs = hrefsIn(html)

    expect(hrefs).toContain('https://exemplo.com')
    for (const href of hrefs) {
      expect(href === '' || isSafeLink(href)).toBe(true)
    }
    expect(html).not.toMatch(/javascript:|data:text|vbscript:/i)
  })

  it('opens external links in a new tab without opener or referrer', () => {
    const editor = createTestEditor()
    const html = editor.blocksToFullHTML([
      {
        type: 'paragraph',
        content: [{ type: 'link', href: 'https://exemplo.com', content: 'ok' }],
      },
    ])
    const anchor = new DOMParser().parseFromString(html, 'text/html').querySelector('a')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.getAttribute('rel')).toMatch(/noopener/)
    expect(anchor?.getAttribute('rel')).toMatch(/noreferrer/)
  })
})

describe('opening links', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens safe links in a new tab with noopener and noreferrer', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openSafeLink('https://exemplo.com/a')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://exemplo.com/a', '_blank', 'noopener,noreferrer')
  })

  it('never opens a dangerous link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    for (const href of DANGEROUS) expect(openSafeLink(href)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('a click on an editor link is handled by us (not by the default window.open without noopener)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const anchor = document.createElement('a')
    anchor.setAttribute('data-inline-content-type', 'link')
    anchor.setAttribute('href', 'mailto:ana@exemplo.com')
    const text = document.createElement('span')
    anchor.appendChild(text)
    document.body.appendChild(anchor)
    const event = new MouseEvent('click')
    Object.defineProperty(event, 'target', { value: text })

    expect(handleEditorLinkClick(event)).toBe(true)
    expect(open).toHaveBeenCalledWith('mailto:ana@exemplo.com', '_blank', 'noopener,noreferrer')
    anchor.remove()
  })
})
