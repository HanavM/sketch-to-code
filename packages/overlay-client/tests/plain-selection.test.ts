import { describe, expect, it } from 'vitest'
import { isInteractive, plainKind, plainQuote, selectionLine, shapeLine } from '../src/plain-selection.js'

// the developer words the old line was made of: a tag shown as a tag, pixels,
// a layout mode, a file path
const JARGON = /\d+×\d+|\bpx\b|\bflex\b|\bgrid\b|\.jsx|\.tsx|src\/|<\w+>|:\d+:\d+|tweak/

describe('plainKind', () => {
  it('names things the way a person would', () => {
    expect(plainKind({ tag: 'button' })).toBe('button')
    expect(plainKind({ tag: 'a', href: true })).toBe('link')
    expect(plainKind({ tag: 'h1' })).toBe('heading')
    expect(plainKind({ tag: 'img' })).toBe('picture')
    expect(plainKind({ tag: 'div' })).toBe('box')
    expect(plainKind({ tag: 'custom-thing' })).toBe('box')
  })
  it('reads input types and ARIA roles before the tag', () => {
    expect(plainKind({ tag: 'input' })).toBe('text box')
    expect(plainKind({ tag: 'input', type: 'checkbox' })).toBe('checkbox')
    expect(plainKind({ tag: 'input', type: 'SUBMIT' })).toBe('button')
    expect(plainKind({ tag: 'div', role: 'button' })).toBe('button')
    expect(plainKind({ tag: 'span', role: 'nonsense' })).toBe('text')
  })
})

describe('plainQuote', () => {
  it('quotes short visible text, squashing whitespace', () => {
    expect(plainQuote({ tag: 'button', text: '  count is\n 0 ' })).toBe(' “count is 0”')
  })
  it('falls back to the label, and is empty with neither', () => {
    expect(plainQuote({ tag: 'img', text: '', label: 'Vite logo' })).toBe(' “Vite logo”')
    expect(plainQuote({ tag: 'div', text: '   ' })).toBe('')
  })
  it('cuts long text with an ellipsis', () => {
    const q = plainQuote({ tag: 'p', text: 'Edit src/App.jsx and save to test HMR, then do more things' })
    expect(q.length).toBeLessThanOrEqual(35)
    expect(q.endsWith('…”')).toBe(true)
  })
})

describe('isInteractive', () => {
  it('is true for things made to be clicked or typed into', () => {
    for (const tag of ['button', 'input', 'select', 'textarea', 'summary']) expect(isInteractive({ tag })).toBe(true)
    expect(isInteractive({ tag: 'a', href: true })).toBe(true)
    expect(isInteractive({ tag: 'div', role: 'button' })).toBe(true)
  })
  it('is false for content, and for an anchor with no href', () => {
    for (const tag of ['h1', 'p', 'div', 'img', 'section']) expect(isInteractive({ tag })).toBe(false)
    expect(isInteractive({ tag: 'a', href: false })).toBe(false)
  })
})

describe('selectionLine', () => {
  it('has no developer words, says what was picked and what to do', () => {
    const line = selectionLine({ tag: 'button', text: 'count is 0' })
    expect(line).not.toMatch(JARGON)
    expect(line).toBe(
      'picked up the button “count is 0” — drag it to move, pull a corner to resize, drag anywhere else to draw',
    )
  })
  it('adds the Test hint only when asked', () => {
    expect(selectionLine({ tag: 'button' })).not.toMatch(/Test/)
    const hinted = selectionLine({ tag: 'button' }, { testHint: true })
    expect(hinted).toMatch(/▶ Test/)
    expect(hinted).not.toMatch(JARGON)
  })
  it('words copies and sets without jargon', () => {
    const line = selectionLine({ tag: 'li', text: 'Milk' }, { linked: 3, setSize: 2 })
    expect(line).toMatch(/appears 3 times/)
    expect(line).toMatch(/2 picked up together/)
    expect(line).not.toMatch(JARGON)
    expect(selectionLine({ tag: 'li' }, { linked: 1, setSize: 1 })).not.toMatch(/times|together/)
  })
  it('the shape line names no tag and no file', () => {
    expect(shapeLine()).toBe('picked up a shape — click a colour to paint it')
    expect(shapeLine({ linked: 2 })).not.toMatch(JARGON)
  })
})
