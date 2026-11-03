/**
 * n180: a one-line heading drawn as a level line must have its letters' middle on that line.
 * r43 pets: "18 dogs near you" drawn at y 120, x 330-560; built at (373,120) 197x29 and (344,122) 197x29,
 * both passed as "sits on the drawn line", so no repair ever lifted it.
 */
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { verifyDesignPlacement } from '../src/verify.js'

const N = (id: string, x: number, y: number, w: number, h: number, parent: string | null, tag = 'div', text = '', fontSize = '14px'): DomNode => ({
  id, tag, srcLoc: `src/App.tsx:${id}`, rect: { x, y, w, h }, text, classes: [],
  ...(text ? { textBox: { x, y, w, h } } : {}),
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row',
    gap: '0', padding: '0', margin: '0', backgroundColor: '', color: '',
    fontSize, fontWeight: '700', borderRadius: '0',
  },
  parent, depth: parent ? 1 : 0,
})
const snap = (nodes: DomNode[]): DomSnapshot => ({
  nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'http://t/', takenAt: 0, truncated: false,
})
const before = snap([N('body', 0, 0, 1280, 900, null, 'body')])
const line = { x: 330, y: 120, w: 230, h: 1 }

describe('n180 one-line heading on its drawn line', () => {
  it('fails the pets heading built with its top on the line (15px low), says up and how far', () => {
    const after = snap([N('body', 0, 0, 1280, 900, null, 'body'), N('h', 344, 122, 197, 29, 'body', 'h2', '18 dogs near you', '22px')])
    const v = verifyDesignPlacement(before, after, line)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('16px below its drawn line')
    expect(v.reason).toContain('Move it up 16px')
  })
  it('passes when the letters are centred on the line', () => {
    const after = snap([N('body', 0, 0, 1280, 900, null, 'body'), N('h', 330, 106, 222, 29, 'body', 'h2', '18 dogs near you', '22px')])
    expect(verifyDesignPlacement(before, after, line).satisfied).toBe(true)
  })
  it('allows a few px either way', () => {
    const after = snap([N('body', 0, 0, 1280, 900, null, 'body'), N('h', 330, 112, 222, 29, 'body', 'h2', '18 dogs near you', '22px')])
    expect(verifyDesignPlacement(before, after, line).satisfied).toBe(true)
  })
  it('leaves a wrapped (several-line) block to the old rule', () => {
    const after = snap([N('body', 0, 0, 1280, 900, null, 'body'), N('h', 330, 110, 230, 90, 'body', 'h1', 'A long title that wraps over three lines', '24px')])
    expect(verifyDesignPlacement(before, after, line).satisfied).toBe(true)
  })
})

describe('n180 one line of words alone on a line spans it', () => {
  it('fails the pets replay heading: centred and a third short', () => {
    const after = snap([N('body', 0, 0, 1280, 900, null, 'body'), N('h', 389, 114, 164, 24, 'body', 'h2', '18 dogs near you', '18px')])
    const v = verifyDesignPlacement(before, after, line)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('start it at x 330')
    expect(v.reason).toContain('make the letters bigger')
  })
  it('passes when the letters run along the line', () => {
    const after = snap([N('body', 0, 0, 1280, 900, null, 'body'), N('h', 331, 106, 222, 29, 'body', 'h2', '18 dogs near you', '22px')])
    expect(verifyDesignPlacement(before, after, line).satisfied).toBe(true)
  })
  it('a row of links on one line is not held to the span', () => {
    const nav = { x: 1058, y: 35, w: 174, h: 1 }
    const after = snap([
      N('body', 0, 0, 1280, 900, null, 'body'),
      N('a1', 1040, 24, 39, 20, 'body', 'a', 'Dogs'), N('a2', 1100, 24, 34, 20, 'body', 'a', 'Cats'), N('a3', 1160, 24, 50, 20, 'body', 'a', 'Donate'),
    ])
    expect(verifyDesignPlacement(before, after, nav).satisfied).toBe(true)
  })
})

import { markPaleDividers } from '../src/ruleline.js'
import { parseCssColor } from '../src/palette.js'

describe('n180 a pale wordless line across the page is a divider', () => {
  const marks = () => [
    { strokeId: 's1', shape: 'line', box: { x: 2, y: 72, w: 1276, h: 0 } },
    { strokeId: 's4', shape: 'line', box: { x: 330, y: 120, w: 230, h: 0 }, words: '18 dogs near you', wordsAt: { x: 445, y: 120 } },
    { strokeId: 's9', shape: 'line', box: { x: 2, y: 400, w: 1276, h: 0 } },
  ]
  it('marks the pets header rule (#ececec on white) rule-only, not the heading or a dark full-width line', () => {
    const inks = [
      { strokeId: 's1', paint: 'text', color: '#ececec', how: 'pen' },
      { strokeId: 's4', paint: 'text', color: '#2a2a2a', how: 'pen' },
      { strokeId: 's9', paint: 'text', color: '#222222', how: 'pen' },
    ] as Array<{ strokeId: string; paint: string; color: string; how: string; ruleOnly?: true }>
    markPaleDividers(marks(), inks, parseCssColor('#ffffff'), 1280)
    expect(inks.map((c) => c.ruleOnly ?? false)).toEqual([true, false, false])
  })
})

import { columnOf } from '../src/textplace.js'
import type { ShapeMark } from '../src/shapemark.js'

describe('n180 a heading line flush with a card edge is not that card\'s centred label', () => {
  const card = { strokeId: 's5', shape: 'box', box: { x: 329, y: 159, w: 284, h: 253 } } as unknown as ShapeMark
  it('the pets heading line (330-560 over the card at 329-613) is not centred over it', () => {
    const line = { strokeId: 's4', shape: 'line', box: { x: 330, y: 120, w: 230, h: 0 }, words: '18 dogs near you' } as unknown as ShapeMark
    expect(columnOf(line, [line, card])).toBeNull()
  })
  it('a short line centred under a card is still its label', () => {
    const line = { strokeId: 'l', shape: 'line', box: { x: 411, y: 430, w: 120, h: 0 }, words: 'Biscuit' } as unknown as ShapeMark
    expect(columnOf(line, [line, card])).toBe(card)
  })
})
