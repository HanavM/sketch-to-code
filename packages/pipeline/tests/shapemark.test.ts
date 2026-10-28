import { describe, expect, it } from 'vitest'
import { shapeOf, isShapeMark, cleanPath, verifyShapeMarks, verifyTextClearOfFields, type ShapeMark } from '../src/shapemark.js'
import { isTextMark } from '../src/textmark.js'
import { instantEligible } from '../src/instant.js'
// @ts-expect-error — plain .mjs bench module, no types
import { textLine, wave, line, box, circle, hatch, walk, jitter } from '../../../tests/bench/lib/draw.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { rbox, rline, rring, rarrow, rtext, rscribble } from '../../../tests/bench/lib/rough.mjs'

type P = { x: number; y: number }
/** What the hand session draws: waypoints walked at 6px with a slight wobble. */
const hand = (wp: number[][], seed = 1): P[] => jitter(walk(wp.map(([x, y]) => ({ x, y })), 6), 1.2, seed)

describe('shapeOf — boxes, lines and rings that mark where things go', () => {
  it('reads boxes, tidy, rough and hand-walked, as boxes with their clean bounds', () => {
    expect(shapeOf(box(100, 50, 300, 120))?.shape).toBe('box')
    for (const s of [1, 2, 3]) expect(shapeOf(rbox(0, 0, 300, 120, { seed: s }))?.shape, `rbox ${s}`).toBe('box')
    const b = shapeOf(hand([[60, 270], [135, 270], [135, 292], [60, 292], [60, 270]]))
    expect(b?.shape).toBe('box')
    expect(Math.abs(b!.box.w - 75)).toBeLessThan(6)
    // a toggle-sized box too
    expect(shapeOf(hand([[1188, 107], [1213, 107], [1213, 120], [1188, 120], [1188, 107]]))?.shape).toBe('box')
  })

  it('reads straight lines, level ones set exactly level', () => {
    expect(shapeOf(line(0, 0, 400, 0))?.shape).toBe('line')
    for (const w of [60, 200, 600, 1100]) {
      for (const s of [1, 2, 3]) {
        expect(shapeOf(rline(10, 100, 10 + w, 100 + (s % 2 ? 6 : -4), { seed: s * 31 + w }))?.shape, `rline ${w}/${s}`).toBe('line')
      }
    }
    const l = shapeOf(hand([[60, 93], [1213, 95]]))!
    expect(l.shape).toBe('line')
    expect(l.from!.y).toBe(l.to!.y)
    // a deliberate slant keeps its ends
    const d = shapeOf(hand([[700, 0], [500, 800]]))!
    expect(d.shape).toBe('line')
    expect(d.from!.x - d.to!.x).toBeGreaterThan(150)
  })

  it('reads rings as clean ellipses', () => {
    expect(shapeOf(circle(200, 200, 60))?.shape).toBe('ellipse')
    expect(shapeOf(rring(100, 100, 80, 30))?.shape).toBe('ellipse')
    expect(shapeOf(rring(300, 300, 120, 120, { seed: 4 }))?.shape).toBe('ellipse')
  })

  it('leaves text squiggles, waves, arrows, hatching and scribbles alone', () => {
    expect(isShapeMark(textLine(0, 0, 300))).toBe(false)
    for (const s of [1, 2, 3]) expect(isShapeMark(rtext(10, 10, 300, { seed: s }))).toBe(false)
    expect(isShapeMark(wave(80, 700, 1120, { amp: 28, crests: 1.5 }))).toBe(false)
    expect(isShapeMark(rarrow(0, 0, 300, 10))).toBe(false)
    expect(isShapeMark(hatch(0, 0, 200, 60))).toBe(false)
    expect(isShapeMark(rscribble(0, 0, 200, 80))).toBe(false)
    expect(isShapeMark([{ x: 0, y: 0 }, { x: 3, y: 2 }])).toBe(false)
  })

  it('never claims a stroke the text reader claims', () => {
    for (const p of [textLine(0, 0, 300), rtext(0, 0, 500, { seed: 9 })]) {
      expect(isTextMark(p) && isShapeMark(p)).toBe(false)
    }
  })

  it('hands a depiction the clean shape, not the wobble', () => {
    const r = shapeOf(rring(100, 100, 50, 50))!
    expect(cleanPath(r, { x: r.box.x, y: r.box.y })).toMatch(/^M 0 \d+ A /)
    const b = shapeOf(box(10, 20, 100, 50))!
    expect(cleanPath(b, { x: 10, y: 20 })).toBe(`M 0 0 H ${b.box.w} V ${b.box.h} H 0 Z`)
  })

  it('keeps a box or line out of the instant render: it gets built, not mounted as ink', () => {
    const snap = { nodes: [], truncated: false, url: 'http://x/', takenAt: 0, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 } } as never
    const v = instantEligible([{ id: 's1', points: box(10, 10, 200, 100).map((p: P, i: number) => ({ ...p, t: i })) }], snap)
    expect(v.ok).toBe(false)
  })

  it('checks each drawn box landed where it was drawn, and says how far off it is', () => {
    const marks: ShapeMark[] = [
      { strokeId: 's4', shape: 'box', box: { x: 1112, y: 169, w: 48, h: 26 } },
      { strokeId: 's5', shape: 'box', box: { x: 1112, y: 250, w: 48, h: 26 } },
      { strokeId: 's1', shape: 'line', box: { x: 120, y: 57, w: 118, h: 0 }, from: { x: 120, y: 57 }, to: { x: 238, y: 57 } },
    ]
    const before = { nodes: [{ id: 'm', tag: 'main', rect: { x: 0, y: 0, w: 1280, h: 900 } }] }
    const node = (id: string, x: number, y: number, w: number, h: number) => ({ id, tag: 'button', rect: { x, y, w, h } })
    const placed = verifyShapeMarks(marks, before, { nodes: [...before.nodes, node('t1', 1112, 170, 48, 28), node('t2', 1112, 249, 48, 28)] })
    expect(placed.satisfied).toBe(true)
    const slid = verifyShapeMarks(marks, before, { nodes: [...before.nodes, node('t1', 1112, 201, 48, 28), node('t2', 1112, 298, 48, 28)] })
    expect(slid.satisfied).toBe(false)
    expect(slid.reason).toMatch(/drawn at \(1112,169\) 48x26: the <button> built for it sits 33px too low/)
    expect(slid.reason).toMatch(/49px too low/)
    const none = verifyShapeMarks(marks, before, { nodes: before.nodes })
    expect(none.satisfied).toBe(false)
    expect(none.reason).toMatch(/nothing about that size/)
    // lines alone are not checked (a line may be text, a rule or an underline)
    expect(verifyShapeMarks([marks[2]!], before, before).unverifiable).toBe(true)
  })

  it('n20: a big card off by 90px is a miss (slack stops at 28px) and is named as centred on the screen', () => {
    const card: ShapeMark[] = [{ strokeId: 's0', shape: 'box', box: { x: 429, y: 149, w: 422, h: 422 } }]
    const before = { nodes: [{ id: 'm', tag: 'main', rect: { x: 0, y: 0, w: 1280, h: 900 } }] }
    const at = (y: number) => ({ nodes: [...before.nodes, { id: 'c', tag: 'div', rect: { x: 429, y, w: 422, h: 423 } }] })
    const low = verifyShapeMarks(card, before, at(238.5))
    expect(low.satisfied).toBe(false)
    expect(low.reason).toMatch(/90px too low/)
    expect(low.reason).toMatch(/centred on the screen.*149px from the top/)
    expect(verifyShapeMarks(card, before, at(170)).satisfied).toBe(true)
  })

  it('n20: words newly sitting on a form field fail; a label above its field passes', () => {
    const field = { id: 'f', tag: 'input', rect: { x: 470, y: 432, w: 340, h: 44 }, text: '' }
    const label = (y: number) => ({ id: 'l', tag: 'label', rect: { x: 470, y, w: 340, h: 16 }, text: 'Password', textBox: { x: 470, y, w: 60, h: 16 } })
    const ok = { nodes: [field, label(410)] }
    expect(verifyTextClearOfFields({ nodes: [] }, ok).satisfied).toBe(true)
    const on = { nodes: [field, label(440)] }
    const v = verifyTextClearOfFields({ nodes: [] }, on)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/"Password" sits on top of the field/)
    // already there before this run: not this run's fault
    expect(verifyTextClearOfFields(on, on).satisfied).toBe(true)
    expect(verifyTextClearOfFields({ nodes: [] }, { nodes: [label(10)] }).unverifiable).toBe(true)
  })
})
