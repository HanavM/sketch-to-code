import { describe, expect, it } from 'vitest'
import { shapeOf, type ShapeMark } from '../src/shapemark.js'
import { markTextPlaces } from '../src/textplace.js'
import { copyOf, tiltWordsBrief, tiltWordsOf, toLocal, unturn, verifyTiltWords } from '../src/tiltwords.js'

// round 33 c3 gig ticket, as drawn in n49 (waypoints walked into dense points)
const walk = (way: number[][]) => {
  const out: Array<{ x: number; y: number; t: number }> = []
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) out.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n, t: 0 })
  }
  const [lx, ly] = way[way.length - 1]!
  out.push({ x: lx!, y: ly!, t: 0 })
  return out
}
const mark = (id: string, way: number[][]): ShapeMark => ({ ...shapeOf(walk(way))!, strokeId: id })
const ticketMarks = () => {
  const marks = [
    mark('t', [[235, 260], [1008, 183], [1045, 540], [270, 618], [236, 263]]),
    mark('d', [[793, 206], [829, 560]]),
    mark('h1', [[288, 352], [583, 322]]),
    mark('h2', [[295, 416], [448, 400]]),
    mark('date', [[302, 467], [655, 432]]),
    mark('one', [[832, 301], [926, 290]]),
  ]
  markTextPlaces(marks, [
    { text: 'The Night Owls, big bold black', focus: ['h1'] },
    { text: 'Fri 12 Dec · Doors 8pm · The Grain Hall, grey', focus: ['date'] },
    { text: 'ONE, big bold white', focus: ['one'] },
  ])
  return marks
}

describe('words on lines inside a box drawn turned (n61)', () => {
  it('turns page points back into the box frame', () => {
    const t = { deg: 10, w: 200, h: 100, cx: 500, cy: 300 }
    expect(toLocal({ x: 500, y: 300 }, t)).toEqual({ x: 100, y: 50 })
    // the box's own top-left corner, turned onto the page, comes back to 0,0
    const c = Math.cos(Math.PI / 18), s = Math.sin(Math.PI / 18)
    const p = { x: 500 + (-100 * c - -50 * s), y: 300 + (-100 * s + -50 * c) }
    const l = toLocal(p, t)
    expect(Math.abs(l.x)).toBeLessThan(1e-6)
    expect(Math.abs(l.y)).toBeLessThan(1e-6)
  })
  it('finds the ticket lines in its own frame, the bare line as the heading\'s second line, not the divider', () => {
    const sets = tiltWordsOf([{ shapeMarks: ticketMarks() }])
    expect(sets).toHaveLength(1)
    const { lines, tilt } = sets[0]!
    expect(tilt.deg).toBeLessThan(-3)
    expect(lines.map((l) => l.strokeId).sort()).toEqual(['date', 'h1', 'h2', 'one'])
    const h1 = lines.find((l) => l.strokeId === 'h1')!
    expect(h1.lines).toBe(2)
    expect(lines.find((l) => l.strokeId === 'h2')!.first).toBe(false)
    // all inside the box frame, roughly level there
    for (const l of lines) { expect(l.y).toBeGreaterThan(0); expect(l.y).toBeLessThan(tilt.h) }
  })
  it('tells where the letters sit in the box frame', () => {
    const brief = tiltWordsBrief([{ shapeMarks: ticketMarks() }])
    expect(brief).toContain('WORDS ON LINES INSIDE A TURNED BOX')
    expect(brief).toContain('"The Night Owls"')
    expect(brief).toContain('set on 2 drawn lines')
    expect(brief).toContain('next line of the words above')
    expect(brief).not.toContain('"dashed"')
  })
  it('no turned box, no brief', () => {
    const marks = [mark('h1', [[288, 352], [583, 352]])]
    markTextPlaces(marks, [{ text: 'Hello', focus: ['h1'] }])
    expect(tiltWordsBrief([{ shapeMarks: marks }])).toBe('')
    expect(verifyTiltWords([{ shapeMarks: marks }], { nodes: [] }).unverifiable).toBe(true)
  })
  it('unturns bounds', () => {
    const w = 300, h = 60, deg = 6
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180)
    const got = unturn(w * c + h * s, w * s + h * c, deg)
    expect(Math.abs(got.w - w)).toBeLessThan(0.01)
    expect(Math.abs(got.h - h)).toBeLessThan(0.01)
  })
  it('checks the built words against the drawn line, in the box frame', () => {
    const marks = ticketMarks()
    const set = tiltWordsOf([{ shapeMarks: marks }])[0]!
    const t = set.tilt
    const h1 = set.lines.find((l) => l.strokeId === 'h1')!
    const one = set.lines.find((l) => l.strokeId === 'one')!
    // build a page: the ticket element turned, and words placed in its frame at a given top
    const toPage = (x: number, y: number) => {
      const c = Math.cos(t.deg * Math.PI / 180), s = Math.sin(t.deg * Math.PI / 180)
      const dx = x - t.w / 2, dy = y - t.h / 2
      return { x: t.cx + dx * c - dy * s, y: t.cy + dx * s + dy * c }
    }
    const textAt = (id: string, text: string, left: number, top: number, w: number, h: number) => {
      const pts = [toPage(left, top), toPage(left + w, top), toPage(left, top + h), toPage(left + w, top + h)]
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
      const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      return { id, tag: 'h1', rect: box, text, textBox: box, style: {} }
    }
    const tc = Math.cos(t.deg * Math.PI / 180), ts = Math.sin(t.deg * Math.PI / 180)
    const W = t.w * Math.abs(tc) + t.h * Math.abs(ts), H = t.w * Math.abs(ts) + t.h * Math.abs(tc)
    const ticket = { id: 'tk', tag: 'div', rect: { x: t.cx - W / 2, y: t.cy - H / 2, w: W, h: H }, text: 'The Night Owls ONE', style: { transform: `matrix(${tc}, ${ts}, ${-ts}, ${tc}, 0, 0)` } }
    // heading: two 52px lines, first baseline on the drawn line (top = y - 0.8*52)
    const good = { nodes: [ticket,
      textAt('h', 'The Night Owls', h1.x0, h1.y - 0.8 * 52, 260, 104),
      textAt('o', 'ONE', one.x0, one.y - 0.8 * 40, 80, 40)] }
    const v = verifyTiltWords([{ shapeMarks: marks }], good)
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeFalsy()
    // 32px low, as built in n59
    const low = { nodes: [ticket,
      textAt('h', 'The Night Owls', h1.x0, h1.y - 0.8 * 52 + 32, 260, 104),
      textAt('o', 'ONE', one.x0, one.y - 0.8 * 40, 80, 40)] }
    const bad = verifyTiltWords([{ shapeMarks: marks }], low)
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toContain('"The Night Owls"')
    expect(bad.reason).toContain('LOWER')
    expect(bad.reason).not.toContain('"ONE"')
  })
  it('copy is the words before the comma', () => {
    expect(copyOf('ONE, big bold white')).toBe('ONE')
    expect(copyOf('ADMIT')).toBe('ADMIT')
  })
  it('binds notes typed on the lines though each is attached to several marks (as in the real flow)', () => {
    // the real reading snaps the nearly level lines level and attaches each note to 2-4 marks
    const lvl = (id: string, x0: number, x1: number, y: number): ShapeMark => ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y } })
    const sl = (id: string, a: [number, number], b: [number, number]): ShapeMark => ({ strokeId: id, shape: 'line', box: { x: a[0], y: Math.min(a[1], b[1]), w: b[0] - a[0], h: Math.abs(a[1] - b[1]) }, from: { x: a[0], y: a[1] }, to: { x: b[0], y: b[1] } })
    const marks: ShapeMark[] = [
      { strokeId: 's1', shape: 'box', box: { x: 234, y: 182, w: 811, h: 436 }, tilt: { deg: -5.5, w: 780, h: 363, cx: 640, cy: 400 } },
      { strokeId: 's2', shape: 'line', box: { x: 811, y: 206, w: 0, h: 354 }, from: { x: 811, y: 206 }, to: { x: 811, y: 560 } },
      lvl('s3', 288, 583, 337), lvl('s4', 295, 448, 408), lvl('s5', 302, 655, 450),
      sl('s6', [828, 257], [878, 251]), sl('s7', [832, 301], [926, 290]), sl('s8', [835, 326], [950, 313]),
    ]
    const all = ['s1', 's3', 's4']
    markTextPlaces(marks, [
      { text: 'The Night Owls, big bold black', at: { x: 300, y: 318 }, focus: all },
      { text: 'Fri 12 Dec · Doors 8pm · The Grain Hall, grey', at: { x: 310, y: 452 }, focus: ['s1', 's5'] },
      { text: 'ADMIT', at: { x: 830, y: 240 }, focus: ['s1', 's2', 's6'] },
      { text: 'dashed', at: { x: 800, y: 400 }, focus: ['s1', 's2'] },
      { text: 'ONE, big bold white', at: { x: 836, y: 282 }, focus: ['s1', 's6', 's7'] },
      { text: 'Row F · Seat 14, white', at: { x: 838, y: 318 }, focus: ['s1', 's6', 's7', 's8'] },
    ])
    const by = (id: string) => marks.find((m) => m.strokeId === id)!
    expect(by('s3').carries).toBe('The Night Owls, big bold black')
    expect(by('s4').carries).toBeUndefined()
    expect(by('s5').carries).toBe('Fri 12 Dec · Doors 8pm · The Grain Hall, grey')
    expect(by('s6').carries).toBe('ADMIT')
    expect(by('s7').carries).toBe('ONE, big bold white')
    expect(by('s8').carries).toBe('Row F · Seat 14, white')
    expect(by('s2').carries).toBeUndefined()
    const brief = tiltWordsBrief([{ shapeMarks: marks, textSize: [{ lines: 2, strokes: ['s3', 's4'] }] }])
    expect(brief).toContain('"ADMIT"')
    expect(brief).toContain('"Row F · Seat 14"')
    expect(brief).toContain('set on 2 drawn lines')
  })
})
