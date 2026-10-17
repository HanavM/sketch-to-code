import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { plainReading, SCRIBBLE_MIN_COVER, zigzags } from '../src/plain-reading.js'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'

const dnode = (id: string, tag: string, srcLoc: string, text: string, rect: DomNode['rect'], parent: string | null = null): DomNode => ({
  id, tag, srcLoc, text, classes: [], parent, depth: parent ? 2 : 1, rect,
  style: {
    color: 'rgb(17,24,39)', backgroundColor: 'rgb(255,255,255)', display: 'block', position: 'static',
    zIndex: 'auto', flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '',
    fontWeight: '', borderRadius: '',
  } as DomNode['style'],
})

/** A hurried scratch-out: a tight zigzag across a box. */
const zigzag = (id: string, x: number, y: number, w: number, h: number, teeth = 8): Stroke => ({
  id,
  points: Array.from({ length: teeth * 2 + 1 }, (_, i) => ({
    x: x + (w * i) / (teeth * 2),
    y: i % 2 === 0 ? y : y + h,
    t: i * 12,
  })),
})
/** A smooth decorative wave: two gentle crests. */
const wave = (id: string, x: number, y: number, w: number): Stroke => ({
  id,
  points: Array.from({ length: 60 }, (_, i) => ({ x: x + (w * i) / 59, y: y + 10 * Math.sin((i / 59) * 2 * Math.PI), t: i * 8 })),
})
const arrow = (id: string): Stroke => ({ id, points: Array.from({ length: 12 }, (_, i) => ({ x: 700 + i * 30, y: 500, t: i * 10 })) })

const section = dnode('e1', 'section', 'src/App.tsx:10:5', '', { x: 0, y: 200, w: 1200, h: 400 })
const heading = dnode('e2', 'h1', 'src/App.tsx:11:7', 'Ship faster', { x: 100, y: 240, w: 500, h: 48 }, 'e1')
const button = dnode('e3', 'button', 'src/App.tsx:14:7', 'Get started', { x: 100, y: 320, w: 140, h: 40 }, 'e1')
const other = dnode('e4', 'button', 'src/App.tsx:15:7', 'Learn more', { x: 260, y: 320, w: 140, h: 40 }, 'e1')
const snap: DomSnapshot = {
  nodes: [section, heading, button, other], truncated: false, url: 'http://x/', takenAt: 0,
  viewport: { w: 1200, h: 800, scrollX: 0, scrollY: 0 },
}

describe('plainReading: a scribble the prompt rule already decides (s2c-049)', () => {
  it('a scratch-out over a button is a delete, read with no model and no tokens', () => {
    const s = [zigzag('s0', 110, 325, 120, 28)]
    const r = plainReading(s, snap)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rule).toBe('scribble-delete')
    expect(r.tokens).toEqual({ input: 0, cacheRead: 0, output: 0 })
    expect(r.interpretation.actions).toHaveLength(1)
    const a = r.interpretation.actions[0]!
    expect(a.kind).toBe('delete')
    expect(a.targets[0]!.srcLoc).toBe('src/App.tsx:14:7')
    expect(r.raw.reading).toBe('You scribbled out the button with "Get started": delete it.')
    expect(r.interpretation.reading).toBe(r.raw.reading)
  })

  it('the raw reading survives the server re-grounding a run does', () => {
    const s = [zigzag('s0', 110, 325, 120, 28)]
    const r = plainReading(s, snap)
    if (!r.ok) throw new Error(r.reason)
    // runV2 re-grounds the client-echoed raw interpretation from scratch
    const again = groundInterpretation(JSON.parse(JSON.stringify(r.raw)), buildEvidence(s, snap, []), snap, 'gesture')
    expect(again.rejected).toEqual([])
    expect(again.actions.map((a) => [a.kind, a.targets[0]!.srcLoc])).toEqual([['delete', 'src/App.tsx:14:7']])
  })

  it('a scratch-out across a heading deletes the heading, not its section', () => {
    const r = plainReading([zigzag('s0', 120, 245, 420, 36, 12)], snap)
    if (!r.ok) throw new Error(r.reason)
    expect(r.interpretation.actions[0]!.targets[0]!.srcLoc).toBe('src/App.tsx:11:7')
    expect(r.raw.reading).toBe('You scribbled out the heading with "Ship faster": delete it.')
  })

  it('two scribbles on two sibling buttons delete both, in one reading', () => {
    const r = plainReading([zigzag('s0', 110, 325, 120, 28), zigzag('s1', 270, 325, 120, 28)], snap)
    if (!r.ok) throw new Error(r.reason)
    expect(r.interpretation.actions.map((a) => a.targets[0]!.srcLoc).sort()).toEqual(['src/App.tsx:14:7', 'src/App.tsx:15:7'])
    expect(r.raw.reading).toMatch(/^You scribbled out the button with "Get started" and the button with "Learn more": delete them\.$/)
  })

  it('a scratch-out across a line with inline <code> in it deletes the line (s2c-046 starter shape)', () => {
    const line = dnode('p1', 'p', 'src/App.jsx:20:7', 'Edit and save to test', { x: 400, y: 500, w: 400, h: 24 })
    const code1 = dnode('k1', 'code', 'src/App.jsx:21:14', 'src/App.jsx', { x: 440, y: 502, w: 90, h: 20 }, 'p1')
    const code2 = dnode('k2', 'code', 'src/App.jsx:21:60', 'HMR', { x: 700, y: 502, w: 40, h: 20 }, 'p1')
    const s2: DomSnapshot = { ...snap, nodes: [line, code1, code2] }
    const ink = [zigzag('s0', 408, 504, 384, 16)]
    // the brief alone calls this unconfined: points split between the <p> and its <code>s
    const brief = JSON.parse(buildEvidence(ink, s2, []).brief) as { strokes: Array<{ mostlyInsideElement: string | null }> }
    expect(brief.strokes[0]!.mostlyInsideElement).toBeNull()
    const r = plainReading(ink, s2)
    if (!r.ok) throw new Error(r.reason)
    expect(r.interpretation.actions.map((a) => a.targets[0]!.srcLoc)).toEqual(['src/App.jsx:20:7'])
  })

  it('a loose, wide zigzag (the README demo\'s own scribble: no turn sharper than 60°) still reads as a scratch-out', () => {
    // record-60s.mjs scribble(): 9 points, teeth 48 px apart, 16 px tall
    const r0 = { x: 400, y: 500, w: 400, h: 24 }
    const pts = Array.from({ length: 9 }, (_, i) => ({ x: r0.x + 8 + ((r0.w - 16) * i) / 8, y: i % 2 ? r0.y + r0.h - 4 : r0.y + 4, t: i * 20 }))
    const st: Stroke = { id: 's0', points: pts }
    const line = dnode('p1', 'p', 'src/App.jsx:20:7', 'Edit and save to test', r0)
    const brief = JSON.parse(buildEvidence([st], { ...snap, nodes: [line] }, []).brief) as { strokes: Array<{ directionReversals: number }> }
    expect(brief.strokes[0]!.directionReversals).toBeLessThan(4)
    expect(zigzags(st)).toBe(7)
    const r = plainReading([st], { ...snap, nodes: [line] })
    if (!r.ok) throw new Error(r.reason)
    expect(r.interpretation.actions[0]!.kind).toBe('delete')
  })

  it('zigzags ignores hand tremor on a straight line and counts a wave\'s crests only', () => {
    const shaky: Stroke = { id: 'l', points: Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: 100 + (i % 2) * 1.5, t: i })) }
    expect(zigzags(shaky)).toBe(0)
    expect(zigzags(wave('w', 0, 100, 400))).toBeLessThanOrEqual(2)
  })

  it('a scribbly triple ring round a button in a small card is not a delete of the card', () => {
    const card = dnode('c1', 'div', 'src/Card.tsx:3:5', '', { x: 100, y: 100, w: 300, h: 160 })
    const btn = dnode('c2', 'button', 'src/Card.tsx:9:7', 'Buy', { x: 200, y: 160, w: 100, h: 36 }, 'c1')
    const loops: Stroke = {
      id: 's0',
      points: Array.from({ length: 120 }, (_, i) => {
        const a = (i / 40) * 2 * Math.PI
        return { x: 250 + 80 * Math.cos(a), y: 178 + 45 * Math.sin(a), t: i * 5 }
      }),
    }
    expect(zigzags(loops)).toBeGreaterThanOrEqual(4)
    const r = plainReading([loops], { ...snap, nodes: [card, btn] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/circles something inside c1/)
  })

  it('declines anything with typed words: the model reads those', () => {
    const r = plainReading([zigzag('s0', 110, 325, 120, 28)], snap, 'gesture', [
      { id: 'n1', text: 'make this red instead', at: { x: 120, y: 330 }, anchor: { kind: 'run' } },
    ])
    expect(r).toMatchObject({ ok: false })
  })

  it('ignores an empty note (nothing was typed)', () => {
    const r = plainReading([zigzag('s0', 110, 325, 120, 28)], snap, 'gesture', [
      { id: 'n1', text: '   ', at: { x: 120, y: 330 }, anchor: { kind: 'run' } },
    ])
    expect(r.ok).toBe(true)
  })

  it('declines in design mode', () => {
    expect(plainReading([zigzag('s0', 110, 325, 120, 28)], snap, 'design')).toMatchObject({ ok: false })
  })

  it('declines a smooth wave (decoration, not a delete)', () => {
    const r = plainReading([wave('s0', 110, 330, 120)], snap)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.reason).toMatch(/not a scribble/)
  })

  it('declines a scribble with any other mark in the sketch', () => {
    expect(plainReading([zigzag('s0', 110, 325, 120, 28), arrow('s1')], snap)).toMatchObject({ ok: false })
  })

  it(`declines a small scratch in a big section (under ${SCRIBBLE_MIN_COVER * 100}% of it: maybe a fill)`, () => {
    const r = plainReading([zigzag('s0', 800, 450, 120, 40)], snap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/covers \d+% of its element/)
  })

  it('declines scribbles on an element and on something inside it', () => {
    const card = dnode('c1', 'div', 'src/Card.tsx:3:5', '', { x: 100, y: 100, w: 300, h: 160 })
    const title = dnode('c2', 'h3', 'src/Card.tsx:4:7', 'Pro plan', { x: 120, y: 110, w: 200, h: 30 }, 'c1')
    const s2: DomSnapshot = { ...snap, nodes: [card, title] }
    const r = plainReading([zigzag('s0', 125, 112, 180, 24), zigzag('s1', 110, 160, 280, 90)], s2)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.reason).toMatch(/inside it/)
  })

  it('declines an element with no source stamp', () => {
    const bare = { ...button, srcLoc: null as unknown as string }
    const r = plainReading([zigzag('s0', 110, 325, 120, 28)], { ...snap, nodes: [section, heading, bare, other] })
    expect(r.ok).toBe(false)
  })
})
