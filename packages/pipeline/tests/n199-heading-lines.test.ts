import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { barsOf, headingNote, isBarInk, proseLineIds } from '../src/barlabels.js'
import { inkColoursBrief } from '../src/inkcolour.js'
import { verifyTextLinesNotRules } from '../src/textrules.js'
import type { GroundedAction } from '../src/intent2.js'

// round 45 c3 pizza oven: two red level lines for the headline, the note typed between them
const L = [{ strokeId: 's12', shape: 'line', box: { x: 70, y: 230, w: 467, h: 0 }, from: { x: 70, y: 230 }, to: { x: 537, y: 230 } },
  { strokeId: 's13', shape: 'line', box: { x: 70, y: 312, w: 322, h: 0 }, from: { x: 70, y: 312 }, to: { x: 392, y: 312 } }]
const NOTE = { text: 'Fired at 900 / degrees, huge bold', at: { x: 80, y: 270 } }
const act = (copy: boolean): GroundedAction => ({
  kind: 'design', targets: [], instruction: 'hero', rejected: [], shapeMarks: L,
  inkColours: L.map((m) => ({ strokeId: m.strokeId, mark: 'line', paint: 'text', color: '#d2462e', box: m.box, how: 'pen', ...(copy ? { copy: true } : {}) })),
} as unknown as GroundedAction)
let id = 0
const node = (rect: DomNode['rect'], bg: string, text = ''): DomNode => ({
  id: `n${id++}`, tag: text ? 'h1' : 'div', srcLoc: null, rect, text, classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: bg, color: 'rgb(210, 70, 46)', fontSize: '60px', fontWeight: '700', borderRadius: '0' },
} as DomNode)
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })

describe('n199: a pen line by a heading note is where its words go, never a bar', () => {
  it('reads a heading note (copy, a number, a slash, a big look) as words, a bar label as not', () => {
    expect(headingNote(NOTE.text)).toBe(true)
    expect(headingNote('Your bike, fixed / by Friday, huge bold')).toBe(true)
    expect(headingNote('Rent $1,120 of $1,120')).toBe(false)
    expect(headingNote('Groceries 60%, big')).toBe(false)
    expect(headingNote('Savings, orange bar')).toBe(false)
    expect(headingNote('Eating out')).toBe(false)
  })
  it('marks both lines of the stacked heading as copy, even 82px apart', () => {
    expect([...proseLineIds(L, [NOTE])].sort()).toEqual(['s12', 's13'])
    expect([...proseLineIds(L, [{ text: 'Rent', at: { x: 80, y: 220 } }])]).toEqual([])
  })
  it('never treats those lines as bars and tells the build the words take the colour, the line is not painted', () => {
    const a = act(true)
    expect(isBarInk(a.inkColours![0]!, a)).toBe(false)
    expect(barsOf([a])).toEqual([])
    const b = inkColoursBrief({ actions: [a], pageFill: null } as never)
    expect(b).toContain('those WORDS are coloured #d2462e')
    expect(b).toContain('never painted: no bar')
    expect(b).not.toContain('a BAR')
    expect(barsOf([act(false)]).length).toBe(2)
  })
  it('fails a red strip painted along a heading line, passes the words alone', () => {
    const bad = snap([node({ x: 70, y: 226, w: 460, h: 8 }, 'rgb(210, 70, 46)'), node({ x: 70, y: 236, w: 470, h: 70 }, 'rgba(0, 0, 0, 0)', 'Fired at 900')])
    const v = verifyTextLinesNotRules(L as never, bad, new Set(), new Set(['s12', 's13']))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/stands for words typed by it .* a thin bar/)
    const good = verifyTextLinesNotRules(L as never, snap([node({ x: 70, y: 200, w: 470, h: 70 }, 'rgba(0, 0, 0, 0)', 'Fired at 900')]), new Set(), new Set(['s12', 's13']))
    expect(good.satisfied).toBe(true)
  })
})
