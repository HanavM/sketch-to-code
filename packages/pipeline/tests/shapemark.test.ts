import { describe, expect, it } from 'vitest'
import { shapeOf, isShapeMark, cleanPath, verifyShapeMarks, verifyTextClearOfFields, marksMiss, type ShapeMark } from '../src/shapemark.js'
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

  it('n22: a field pushed down by the one above is told it follows; a landed button below is told to stay', () => {
    // n20 try 3 round 1, the real numbers: email 16 low, password 15 low (because of email), button landed
    const marks: ShapeMark[] = [
      { strokeId: 's0', shape: 'box', box: { x: 429, y: 149, w: 422, h: 422 } },
      { strokeId: 's3', shape: 'box', box: { x: 470, y: 287, w: 340, h: 45 } },
      { strokeId: 's4', shape: 'box', box: { x: 469, y: 375, w: 341, h: 46 } },
      { strokeId: 's5', shape: 'box', box: { x: 470, y: 447, w: 341, h: 48 } },
    ]
    const before = { nodes: [{ id: 'm', tag: 'main', rect: { x: 0, y: 0, w: 1280, h: 900 } }] }
    const n = (id: string, tag: string, x: number, y: number, w: number, h: number) => ({ id, tag, rect: { x, y, w, h } })
    const v = verifyShapeMarks(marks, before, { nodes: [...before.nodes,
      n('c', 'div', 429, 150, 422, 422), n('e', 'input', 470, 304, 340, 42), n('p', 'input', 470, 392, 340, 42), n('b', 'button', 470, 454, 340, 44)] })
    expect(v.satisfied).toBe(false)
    const parts = v.reason.split('; the ')
    const email = parts.find((x) => x.includes('(470,287)'))!
    const pass = parts.find((x) => x.includes('(469,375) 341x46'))!
    const btn = parts.find((x) => x.includes('(470,447) 341x48'))!
    expect(email).toMatch(/16px too low; move it/)
    expect(pass).toMatch(/only because the <input> drawn at \(470,287\) above it/)
    expect(pass).toMatch(/do not move this one on its own/)
    expect(btn).toMatch(/lands now, but its place hangs on the <input> drawn at \(469,375\)/)
    expect(btn).toMatch(/keep this one at its drawn top \(447px\)/)
    // the card round them is not "above" them
    expect(v.reason).not.toMatch(/drawn at \(429,149\) above/)
    // a field whose own gap is also wrong is told only its own share
    const w = verifyShapeMarks(marks, before, { nodes: [...before.nodes,
      n('c', 'div', 429, 150, 422, 422), n('e', 'input', 470, 304, 340, 42), n('p', 'input', 470, 418, 340, 42), n('b', 'button', 470, 474, 340, 44)] })
    expect(w.reason).toMatch(/Part of that comes from the <input> drawn at \(470,287\) above it; once that one is fixed this one is still 25px too low, so change only the spacing between them by that much/)
    // nothing off: nothing said
    expect(verifyShapeMarks(marks, before, { nodes: [...before.nodes,
      n('c', 'div', 429, 150, 422, 422), n('e', 'input', 470, 288, 340, 44), n('p', 'input', 470, 376, 340, 44), n('b', 'button', 470, 448, 340, 46)] }).satisfied).toBe(true)
  })

  it('n22: each action is judged alone but sees the boxes of the other actions above it', () => {
    const page: ShapeMark[] = [
      { strokeId: 's3', shape: 'box', box: { x: 470, y: 287, w: 340, h: 45 } },
      { strokeId: 's4', shape: 'box', box: { x: 469, y: 375, w: 341, h: 46 } },
    ]
    const before = { nodes: [] }
    const after = { nodes: [{ id: 'e', tag: 'input', rect: { x: 470, y: 301, w: 340, h: 42 } }, { id: 'p', tag: 'input', rect: { x: 470, y: 392, w: 340, h: 42 } }] }
    const pass = verifyShapeMarks([page[1]!], before, after, page)
    expect(pass.satisfied).toBe(false)
    expect(pass.reason).toMatch(/only because the <input> drawn at \(470,287\)/)
    expect(pass.reason).not.toMatch(/\(470,287\) 340x45:/)
    expect(pass.marks).toHaveLength(1)
    expect(verifyShapeMarks([page[1]!], before, after).reason).toMatch(/15px too low; move it/)
  })

  it('n22: a card built 90px low takes its fields with it: they are matched where the card put them and told they hang on it', () => {
    // n22 login try 2, the real rects: the email box had been matched to the password field
    const page: ShapeMark[] = [
      { strokeId: 's0', shape: 'box', box: { x: 429, y: 149, w: 422, h: 422 } },
      { strokeId: 's3', shape: 'box', box: { x: 470, y: 287, w: 340, h: 45 } },
      { strokeId: 's4', shape: 'box', box: { x: 469, y: 375, w: 341, h: 46 } },
      { strokeId: 's5', shape: 'box', box: { x: 470, y: 447, w: 341, h: 48 } },
    ]
    const n = (id: string, tag: string, x: number, y: number, w: number, h: number) => ({ id, tag, rect: { x, y, w, h } })
    const after = { nodes: [n('c', 'div', 429, 232, 422, 436), n('h', 'h1', 469, 272, 342, 32),
      n('e', 'input', 469, 390, 342, 42), n('p', 'input', 469, 478, 342, 42), n('b', 'button', 469, 550, 342, 44)] }
    const v = verifyShapeMarks(page, { nodes: [] }, after)
    const at = (id: string) => v.marks!.find((m) => m.strokeId === id)!.built!.y
    expect(at('s3')).toBe(390)
    expect(at('s4')).toBe(478)
    expect(at('s5')).toBe(550)
    expect(v.reason).toMatch(/looks centred on the screen/)
    expect(v.reason).toMatch(/Part of that comes from the <div> drawn at \(429,149\) it sits in; once that one is fixed this one is still 12px too low/)
  })

  it('n22: a card built far off but exactly its size is that card, off (not "nothing built")', () => {
    const page: ShapeMark[] = [
      { strokeId: 's0', shape: 'box', box: { x: 429, y: 149, w: 422, h: 422 } },
      { strokeId: 's3', shape: 'box', box: { x: 470, y: 287, w: 340, h: 45 } },
    ]
    const n = (id: string, tag: string, x: number, y: number, w: number, h: number) => ({ id, tag, rect: { x, y, w, h } })
    const v = verifyShapeMarks(page, { nodes: [] }, { nodes: [n('c', 'div', 0, 150, 421, 440), n('e', 'input', 41, 298, 340, 44)] })
    expect(v.reason).toMatch(/\(429,149\) 422x422: the <div> built for it sits 429px too far left/)
    expect(v.reason).toMatch(/\(470,287\) 340x45: the <input> built for it sits 429px too far left, but only because the <div> drawn at \(429,149\) it sits in/)
  })

  it('n24: a column of toggles that all sit low is told the cause is above it, under the drawn tabs line', () => {
    // r2 e3 settings, n22 round 1: the real numbers (tabs line at y=141, toggles 30, 26, 22, 19 low)
    const marks: ShapeMark[] = [
      { strokeId: 's1', shape: 'line', box: { x: 120, y: 141, w: 1040, h: 0 }, from: { x: 120, y: 141 }, to: { x: 1160, y: 141 } },
      { strokeId: 's2', shape: 'box', box: { x: 1112, y: 168, w: 48, h: 28 } },
      { strokeId: 's3', shape: 'box', box: { x: 1112, y: 250, w: 49, h: 27 } },
      { strokeId: 's4', shape: 'box', box: { x: 1111, y: 331, w: 49, h: 27 } },
      { strokeId: 's5', shape: 'box', box: { x: 1112, y: 411, w: 48, h: 27 } },
    ]
    const n = (id: string, y: number) => ({ id, tag: 'span', rect: { x: 1112, y, w: 48, h: 28 } })
    const v = verifyShapeMarks(marks, { nodes: [] }, { nodes: [n('a', 198), n('b', 275), n('c', 352), n('d', 429)] })
    expect(v.satisfied).toBe(false)
    const top = v.reason.split('; the ').find((x) => x.includes('(1112,168)'))!
    expect(top).toMatch(/The 3 drawn boxes below it ride on it, so the whole page from here down sits about 30px low/)
    expect(top).toMatch(/drawn, its top is 27px below the line drawn at y=141; built, it is 57px below/)
    expect(top).toMatch(/take 30px OUT of the space above it/)
    expect(top).toMatch(/Never add space/)
    // a button further down, off by the same, rides the same drift and is not moved on its own
    const withBtn = [...marks, { strokeId: 's6', shape: 'box' as const, box: { x: 120, y: 499, w: 152, h: 45 } }]
    const b = verifyShapeMarks(withBtn, { nodes: [] }, { nodes: [n('a', 198), n('b', 275), n('c', 352), n('d', 429), { id: 'e', tag: 'button', rect: { x: 120, y: 527, w: 152, h: 45 } }] })
    const btn = b.reason.split('; the ').find((x) => x.includes('(120,499)'))!
    expect(btn).toMatch(/28px too low, the same as the <span> drawn at \(1112,168\)/)
    expect(btn).toMatch(/Do not move this one on its own/)
    // a box with a box above it is not told about the top
    expect(v.reason.split('; the ').find((x) => x.includes('(1112,250)'))).not.toMatch(/OUT of the space/)
  })

  it('n24: marksMiss totals how far the drawn boxes are off in a verify record', () => {
    const rec = [{ kind: 'add', index: 0, verdict: { satisfied: true } },
      { kind: 'marks', index: 2, verdict: { satisfied: false, marks: [{ dx: 0, dy: 30, built: {} }, { dx: 1, dy: -22, built: {} }] } }]
    expect(marksMiss(rec)).toBe(53)
    expect(marksMiss({ verified: rec })).toBe(53)
    expect(marksMiss([{ kind: 'marks', verdict: { marks: [{ dx: null, dy: null, built: null }] } }])).toBe(200)
    expect(marksMiss([{ kind: 'add' }])).toBeNull()
  })

  it('n25: a header built where drawn is held; the drift is named in the gap under the line, with the row pitch', () => {
    const marks: ShapeMark[] = [
      { strokeId: 's1', shape: 'line', box: { x: 120, y: 141, w: 1040, h: 0 }, from: { x: 120, y: 141 }, to: { x: 1160, y: 141 } },
      { strokeId: 's2', shape: 'box', box: { x: 1112, y: 167, w: 48, h: 30 } },
      { strokeId: 's3', shape: 'box', box: { x: 1112, y: 249, w: 49, h: 29 } },
      { strokeId: 's4', shape: 'box', box: { x: 1112, y: 330, w: 49, h: 29 } },
      { strokeId: 's5', shape: 'box', box: { x: 1112, y: 410, w: 49, h: 29 } },
      { strokeId: 's6', shape: 'box', box: { x: 120, y: 498, w: 152, h: 46 } },
    ]
    const n = (id: string, y: number) => ({ id, tag: 'button', rect: { x: 1112, y, w: 48, h: 30 } })
    const tabs = { id: 't', tag: 'nav', rect: { x: 120, y: 100, w: 1040, h: 42 } }
    const after = { nodes: [tabs, n('a', 244), n('b', 334), n('c', 423), n('d', 512), { id: 'e', tag: 'button', rect: { x: 120, y: 610, w: 152, h: 46 } }] }
    const v = verifyShapeMarks(marks, { nodes: [] }, after)
    const top = v.reason.split('; the ').find((x) => x.includes('(1112,167)'))!
    expect(top).toMatch(/built where drawn \(its bottom at y=142\), so the header is right/)
    expect(top).toMatch(/drawn, this box's top is 26px below it; built, 102px/)
    expect(top).toMatch(/Keep the heading and the tabs exactly as they are/)
    expect(top).toMatch(/built 9px taller each than drawn: drawn, one row's top to the next is 81px; built, 90px/)
    const btn = v.reason.split('; the ').find((x) => x.includes('(120,498)'))!
    expect(btn).toMatch(/103px of that is the <button> drawn at \(1112,410\)/)
    expect(btn).toMatch(/The gap between them is about right/)
    expect(btn).not.toMatch(/OUT of the space/)
    // a header that is itself built low gets that part named above the line
    const low = verifyShapeMarks(marks, { nodes: [] }, { nodes: [{ ...tabs, rect: { ...tabs.rect, y: 140 } }, ...after.nodes.slice(1)] })
    expect(low.reason).toMatch(/The line drawn at y=141 is itself built 41px too low/)
  })

  it('n25: an on toggle whose knob pokes past its track is a miss with the right travel', () => {
    const marks: ShapeMark[] = [{ strokeId: 's2', shape: 'box', box: { x: 1112, y: 167, w: 44, h: 24 } }]
    const ok = verifyShapeMarks(marks, { nodes: [] }, { nodes: [
      { id: 't', tag: 'button', rect: { x: 1112, y: 167, w: 44, h: 24 } }, { id: 'k', tag: 'span', rect: { x: 1134, y: 169, w: 20, h: 20 } }] })
    expect(ok.satisfied).toBe(true)
    const bad = verifyShapeMarks(marks, { nodes: [] }, { nodes: [
      { id: 't', tag: 'button', rect: { x: 1112, y: 167, w: 44, h: 24 } }, { id: 'k', tag: 'span', rect: { x: 1142, y: 169, w: 20, h: 20 } }] })
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toMatch(/sticks 6px out past the track's right end/)
    expect(bad.reason).toMatch(/translate-x-\[20px\]/)
  })
})

