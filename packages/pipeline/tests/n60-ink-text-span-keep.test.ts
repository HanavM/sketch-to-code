import { describe, expect, it } from 'vitest'
import { allTextBrief, allTextColour, inkTextOf, onInkText, verifyAllText } from '../src/alltext.js'
import { keepSpanRepair, spanMisses } from '../src/linespan.js'

// round 33 c2 slow agency (n49 sketch): "See our projects" drawn on a line in red ink, "all text white" typed
const a = allTextColour(['all text white'])!
const actions = [
  { inkColours: [{ paint: 'text', color: '#ef4444', box: { x: 1062, y: 786, w: 154, h: 0 } }] },
  { inkColours: [{ paint: 'background', color: '#ef4444', box: { x: 1100, y: 330, w: 60, h: 60 } }] },
  { onScreen: true, inkColours: [{ paint: 'text', color: '#22c55e', box: { x: 0, y: 0, w: 10, h: 0 } }] },
]
const node = (text: string, color: string, rect: { x: number; y: number; w: number; h: number }) =>
  ({ id: text, tag: 'p', text, rect, textBox: rect, style: { color, backgroundColor: 'transparent' } })
const snap = (nodes: ReturnType<typeof node>[]) => ({ viewport: { w: 1280, h: 900 }, nodes } as never)

describe('pen-coloured text keeps its ink under "all text white" (n60)', () => {
  it('finds the red text line, not fills, not lines already on screen, not white ink', () => {
    expect(inkTextOf(actions as never, a)).toEqual([{ box: { x: 1062, y: 786, w: 154, h: 0 }, color: '#ef4444' }])
    expect(inkTextOf([{ inkColours: [{ paint: 'text', color: '#fefefe', box: { x: 0, y: 0, w: 9, h: 0 } }] }] as never, a)).toEqual([])
    expect(inkTextOf(actions as never, null)).toEqual([])
  })
  it('tells the build the ink overrules the note there', () => {
    const b = allTextBrief(a, inkTextOf(actions as never, a))
    expect(b).toContain('EXCEPT text the user drew in a coloured pen')
    expect(b).toContain('x 1062 to 1216, y 786 are #ef4444')
    expect(allTextBrief(a)).not.toContain('EXCEPT')
  })
  it('the check leaves red text on the red line alone and still catches grey text elsewhere', () => {
    const ink = onInkText(inkTextOf(actions as never, a))
    const page = [
      node('slow studio', '#ffffff', { x: 64, y: 40, w: 90, h: 20 }),
      node('Work About Contact', '#ffffff', { x: 1040, y: 40, w: 170, h: 20 }),
      node('A design studio', '#ffffff', { x: 64, y: 730, w: 400, h: 20 }),
      node('See our projects', '#ef4444', { x: 1050, y: 770, w: 150, h: 20 }),
    ]
    expect(verifyAllText(a, snap(page)).satisfied).toBe(false) // 3 of 4 white: the red link was asked to go white
    expect(verifyAllText(a, snap(page), ink).satisfied).toBe(true)
    const grey = [...page.slice(0, 3).map((n, i) => (i === 2 ? { ...n, style: { ...n.style, color: '#777777' } } : n)), page[3]!]
    expect(verifyAllText(a, snap(grey), ink).satisfied).toBe(false)
  })
})

describe('a repair that sized a giant word to its line is kept (n60)', () => {
  const rec = (sat: boolean, n = 1) => ({ details: [{ kind: 'line-span', verdict: { satisfied: sat, reason: sat ? 'ok' : Array(n).fill('the heading "slow" was drawn').join('; ') } }] })
  it('reads the line-span misses from a verify record', () => {
    expect(spanMisses(rec(true))).toBe(0)
    expect(spanMisses(rec(false, 2))).toBe(2)
    expect(spanMisses({ details: [{ kind: 'marks', verdict: {} }] })).toBe(null)
  })
  it('keeps it when a heading now spans, unless the boxes moved by a lot', () => {
    expect(keepSpanRepair({ span: 1, miss: 40 }, { span: 0, miss: 120 })).toBe(true)
    expect(keepSpanRepair({ span: 1, miss: 40 }, { span: 0, miss: 400 })).toBe(false)
    expect(keepSpanRepair({ span: 1, miss: 40 }, { span: 1, miss: 60 })).toBe(false)
    expect(keepSpanRepair({ span: null, miss: 40 }, { span: 0, miss: 60 })).toBe(false)
  })
})

describe('two giant words on their own lines that touch are put back on their lines (n60)', async () => {
  const { verifyOwnWords } = await import('../src/ownwords.js')
  const L = (y: number, words: string) => ({ shape: 'line', box: { x: 64, y, w: 860, h: 0 }, from: { x: 64, y }, to: { x: 924, y }, words })
  const marks = [L(382, 'SLOW, giant outlined letters'), L(636, 'WORK, giant outlined letters')]
  const n = (id: string, text: string, y: number, h: number) => ({ id, text, rect: { x: 64, y, w: 860, h }, textBox: { x: 64, y, w: 860, h } })
  it('names each drawn line instead of pushing one down', () => {
    const v = verifyOwnWords(['SLOW, giant outlined letters', 'WORK, same'], marks, { nodes: [] }, { nodes: [n('a', 'SLOW', 160, 300), n('b', 'WORK', 380, 300)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('sit on y 382')
    expect(v.reason).toContain('on y 636')
    expect(v.reason).toContain('never move either one below its drawn line')
  })
})
