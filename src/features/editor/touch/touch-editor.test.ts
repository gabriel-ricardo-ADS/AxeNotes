import {
  bottomInset,
  checklistToggleTarget,
  cursorScrollDelta,
  findScrollParent,
  isZoomed,
  marginHandlePosition,
  shouldShowTouchBar,
  slashPanelRect,
  type TouchBarState,
} from '@/features/editor/touch/touch-editor'

const SHOWN: TouchBarState = {
  touch: true,
  keyboardOpen: true,
  focused: true,
  editable: true,
  modalOpen: false,
  zoomed: false,
}

describe('shouldShowTouchBar', () => {
  it('shows with touch, the keyboard open and the editable editor focused', () => {
    expect(shouldShowTouchBar(SHOWN)).toBe(true)
  })

  it.each([
    ['without touch (desktop, iPad with trackpad)', { touch: false }],
    ['with the keyboard closed (or a physical keyboard)', { keyboardOpen: false }],
    ['without focus in the editor', { focused: false }],
    ['read-only (viewer, page in the trash)', { editable: false }],
    ['with a modal open', { modalOpen: true }],
    ['with pinch zoom', { zoomed: true }],
  ])('hides %s', (_, change) => {
    expect(shouldShowTouchBar({ ...SHOWN, ...change })).toBe(false)
  })
})

describe('isZoomed', () => {
  it('only counts a scale away from 1', () => {
    expect(isZoomed(1)).toBe(false)
    expect(isZoomed(1.004)).toBe(false)
    expect(isZoomed(1.5)).toBe(true)
    expect(isZoomed(0.8)).toBe(true)
  })
})

describe('checklistToggleTarget', () => {
  it('goes checklist → text and any text block → checklist', () => {
    expect(checklistToggleTarget('checkListItem', 'inline')).toBe('paragraph')
    expect(checklistToggleTarget('paragraph', 'inline')).toBe('checkListItem')
    expect(checklistToggleTarget('bulletListItem', 'inline')).toBe('checkListItem')
    expect(checklistToggleTarget('heading', 'inline')).toBe('checkListItem')
  })

  it('does nothing for blocks without text', () => {
    expect(checklistToggleTarget('divider', 'none')).toBeNull()
    expect(checklistToggleTarget('table', 'table')).toBeNull()
    expect(checklistToggleTarget('pageLink', 'none')).toBeNull()
  })
})

describe('slashPanelRect', () => {
  const area = { offsetTop: 0, offsetLeft: 0, width: 390, height: 544 }

  it('sits right above the bar, full width, with at most 60% of the space above it', () => {
    // 544 − 50 de barra = 494 livres; 60% = 296.
    expect(slashPanelRect(area, 50, 1000)).toEqual({ x: 0, y: 198, width: 390, maxHeight: 296 })
  })

  it('a shorter menu keeps its height and still touches the bar', () => {
    expect(slashPanelRect(area, 50, 120)).toMatchObject({ y: 544 - 50 - 120, maxHeight: 296 })
  })

  it('follows the iOS visual viewport when Safari scrolls the page (offsetTop/offsetLeft)', () => {
    const scrolled = { offsetTop: 280, offsetLeft: 12, width: 366, height: 500 }
    const rect = slashPanelRect(scrolled, 44, 100)
    expect(rect).toEqual({ x: 12, y: 280 + 500 - 44 - 100, width: 366, maxHeight: 273 })
  })

  it('never goes negative with almost no room (iPhone landscape)', () => {
    expect(slashPanelRect({ ...area, height: 40 }, 50, 300).maxHeight).toBe(0)
  })
})

describe('cursorScrollDelta', () => {
  const area = { offsetTop: 0, height: 544 }

  it('does nothing while the line is above the bar (with the 8 px margin)', () => {
    expect(cursorScrollDelta({ caretBottom: 480, area, coveredBottom: 50 })).toBe(0)
    expect(cursorScrollDelta({ caretBottom: 486, area, coveredBottom: 50 })).toBe(0)
  })

  it('scrolls just the difference when the line would be under the bar', () => {
    expect(cursorScrollDelta({ caretBottom: 520, area, coveredBottom: 50 })).toBe(34)
  })

  it('also clears the open "/" panel', () => {
    expect(cursorScrollDelta({ caretBottom: 300, area, coveredBottom: 50 + 296 })).toBe(110)
  })

  it('uses the iOS offsetTop (layout viewport coordinates)', () => {
    const scrolled = { offsetTop: 300, height: 500 }
    expect(cursorScrollDelta({ caretBottom: 700, area: scrolled, coveredBottom: 50 })).toBe(0)
    expect(cursorScrollDelta({ caretBottom: 760, area: scrolled, coveredBottom: 50 })).toBe(18)
  })
})

describe('bottomInset', () => {
  it('iOS: what the keyboard covers plus the bar and the panel', () => {
    expect(bottomInset({ height: 500, layoutHeight: 844 }, 50)).toBe(344 + 50)
  })

  it('Android (resizes-content): just the bar, the layout already shrank', () => {
    expect(bottomInset({ height: 544, layoutHeight: 544 }, 50)).toBe(50)
  })

  it('does not change when Safari scrolls the page (offsetTop), so it never loops', () => {
    const base = { height: 500, layoutHeight: 844 }
    // A área inteira do visualViewport (com o offsetTop), como o hook passa: o valor não depende dele.
    const values = [0, 120, 344].map((offsetTop) => {
      const area = { ...base, offsetTop, offsetLeft: 0, width: 390 }
      return bottomInset(area, 50)
    })
    expect(new Set(values).size).toBe(1)
  })
})

describe('marginHandlePosition', () => {
  const container = { top: 252, left: 304 }

  it('sits in the left margin, centered on a one-line block', () => {
    expect(marginHandlePosition({ top: 282, left: 304, height: 30 }, container)).toEqual({
      top: 30 + (30 - 44) / 2,
      left: -48,
    })
  })

  it('stays on the first line of a tall block', () => {
    expect(marginHandlePosition({ top: 252, left: 304, height: 200 }, container).top).toBe(2)
  })

  it('never leaves the screen on the left', () => {
    expect(marginHandlePosition({ top: 0, left: 10, height: 30 }, { top: 0, left: 10 }).left).toBe(
      -10,
    )
  })
})

describe('findScrollParent', () => {
  /** `<wrapper><article><section/></article></wrapper>` no documento; devolve a seção. */
  function sectionInside(wrapper: HTMLElement) {
    const article = document.createElement('article')
    const section = document.createElement('section')
    article.append(section)
    wrapper.append(article)
    document.body.replaceChildren(wrapper)
    return section
  }

  it('finds the scrolling ancestor (the app <main>)', () => {
    const main = document.createElement('main')
    main.style.overflowY = 'auto'
    expect(findScrollParent(sectionInside(main))).toBe(main)
  })

  it('falls back to the document', () => {
    expect(findScrollParent(sectionInside(document.createElement('div')))).toBe(
      document.documentElement,
    )
  })
})
