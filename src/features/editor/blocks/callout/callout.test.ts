import {
  calloutEmoji,
  CALLOUT_DEFAULT_BACKGROUND,
  CALLOUT_DEFAULT_EMOJI,
} from '@/features/editor/blocks/callout/callout'
import { slashMenuItems } from '@/features/editor/slash-menu'
import { createTestEditor } from '@/features/editor/test-editor'
import { blocksToPlainText } from '@/features/sync/page-text'

describe('callout block', () => {
  it('is born gray from the "/" menu, with the default emoji', () => {
    const editor = createTestEditor()
    const item = slashMenuItems(editor, 'destaque')[0]
    editor.setTextCursorPosition(editor.document[0] ?? '', 'end')
    item?.onItemClick()

    const block = editor.document[0]
    expect(block?.type).toBe('callout')
    expect(block?.props).toMatchObject({
      emoji: CALLOUT_DEFAULT_EMOJI,
      backgroundColor: CALLOUT_DEFAULT_BACKGROUND,
      textColor: 'default',
    })
  })

  it('round-trips its props and rich text through the document JSON', () => {
    const editor = createTestEditor()
    editor.replaceBlocks(editor.document, [
      {
        type: 'callout',
        props: { emoji: '🌿', backgroundColor: 'green' },
        content: [
          { type: 'text', text: 'Um passo ', styles: { italic: true } },
          { type: 'text', text: 'de cada vez', styles: { bold: true } },
        ],
      },
    ])
    const saved = JSON.parse(JSON.stringify(editor.document)) as typeof editor.document

    const reopened = createTestEditor()
    reopened.replaceBlocks(reopened.document, saved)
    expect(reopened.document).toEqual(saved)
    expect(reopened.document[0]?.props).toMatchObject({ emoji: '🌿', backgroundColor: 'green' })
  })

  it('turns into a paragraph and back keeping the text', () => {
    const editor = createTestEditor()
    const [callout] = editor.replaceBlocks(editor.document, [
      { type: 'callout', content: 'Lembrete importante' },
    ]).insertedBlocks
    if (!callout) throw new Error('no block')

    const paragraph = editor.updateBlock(callout, { type: 'paragraph' })
    expect(paragraph.type).toBe('paragraph')
    expect(blocksToPlainText(editor.document)).toBe('Lembrete importante')

    const back = editor.updateBlock(paragraph, { type: 'callout' })
    expect(back.type).toBe('callout')
    expect(blocksToPlainText(editor.document)).toBe('Lembrete importante')
  })

  it('puts the callout text (not the emoji) into the search text', () => {
    const editor = createTestEditor()
    editor.replaceBlocks(editor.document, [
      { type: 'callout', props: { emoji: '🔥' }, content: 'Brilhe sempre' },
      { type: 'paragraph', content: 'depois' },
    ])
    expect(blocksToPlainText(editor.document)).toBe('Brilhe sempre\ndepois')
  })

  it('only shows a short emoji (anything else falls back to the default)', () => {
    expect(calloutEmoji('🌿')).toBe('🌿')
    expect(calloutEmoji('')).toBe(CALLOUT_DEFAULT_EMOJI)
    expect(calloutEmoji('<img src=x onerror=alert(1)>')).toBe(CALLOUT_DEFAULT_EMOJI)
    expect(calloutEmoji('texto comprido demais 🌿🌿🌿')).toBe(CALLOUT_DEFAULT_EMOJI)
  })
})
