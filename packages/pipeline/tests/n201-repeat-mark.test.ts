import { describe, expect, it } from 'vitest'
import { boxCharsBrief, boxCharsOf, repeatBrief, repeatCount, repeatPlans, verifyBoxChars, verifyRepeats } from '../src/repeatmark.js'

const vp = { w: 1280, h: 900 }
// a hand box: corners with a little wobble, closed
const box = (id: string, x: number, y: number, w: number, h: number) => ({ id, points: [
  { x, y }, { x: x + w / 2, y: y + 1 }, { x: x + w, y }, { x: x + w + 1, y: y + h / 2 }, { x: x + w, y: y + h },
  { x: x + w / 2, y: y + h - 1 }, { x, y: y + h }, { x: x - 1, y: y + h / 2 }, { x, y: y + 2 },
] })
const line = (id: string, x0: number, y0: number, x1: number, y1: number) => ({ id, points: [{ x: x0, y: y0 }, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x: x1, y: y1 }] })

describe('n201: a count typed on one drawn box repeats it beside it', () => {
  // round 45 e3 audio mixer: one strip (ring, fader line, knob box inside), a Master strip far right
  const strokes = [box('strip', 30, 270, 130, 600), box('knob', 65, 450, 60, 30), line('fader', 95, 380, 95, 760), box('master', 1080, 270, 170, 600)]
  const note = { text: '6 strips: Drums, Bass, Keys, Guitar, Vocals, FX; knobs at different heights', at: { x: 95, y: 828 } }
  it('reads the count, noun and names', () => {
    expect(repeatCount(note.text)).toEqual({ n: 6, noun: 'strips', names: ['Drums', 'Bass', 'Keys', 'Guitar', 'Vocals', 'FX'] })
    expect(repeatCount('4 cards like this')?.n).toBe(4)
    expect(repeatCount('x5')?.n).toBe(5)
  })
  it('plain counts and rows are not repeats', () => {
    expect(repeatCount('3 colours, warm')).toBeNull()
    expect(repeatCount('5 rows like this')).toBeNull()
    expect(repeatCount('about 29 thin blue bars like this, random heights')).toBeNull()
  })
  it('six strips at the drawn size side by side, up to the Master strip', () => {
    const [p] = repeatPlans([note], strokes, vp)
    expect(p).toBeDefined()
    expect(p!.axis).toBe('x')
    expect(p!.n).toBe(6)
    expect(p!.mark.w).toBeGreaterThan(120)
    expect(p!.mark.x + 6 * p!.mark.w + 5 * p!.gap).toBeLessThanOrEqual(1080)
    expect(p!.insides.length).toBe(2)
    const b = repeatBrief([p!])
    expect(b).toMatch(/exactly 6 separate strips side by side/)
    expect(b).toMatch(/never put copies inside the drawn box/)
  })
  it('no room beside it: no plan', () => {
    expect(repeatPlans([note], [box('strip', 30, 270, 130, 600), box('wall', 200, 270, 100, 600)], vp)).toEqual([])
  })
  it('checked: five small strips crammed in the first fail, six side by side pass', () => {
    const [p] = repeatPlans([note], strokes, vp)
    const crammed = { nodes: [{ id: 'a', rect: { x: 30, y: 270, w: 130, h: 600 } }, ...[0, 1, 2, 3, 4].map((k) => ({ id: 'c' + k, rect: { x: 35 + k * 25, y: 760, w: 20, h: 100 } }))] }
    expect(verifyRepeats([p!], crammed).satisfied).toBe(false)
    const row = { nodes: [0, 1, 2, 3, 4, 5].map((k) => ({ id: 's' + k, rect: { x: 30 + k * 146, y: 272, w: 130, h: 598 } })) }
    expect(verifyRepeats([p!], row).satisfied).toBe(true)
  })
})

describe('n201: characters typed for a row of drawn boxes go inside them', () => {
  // round 45 e2 two-factor: six 74x72 boxes in a row, the note typed in the first
  const xs = [640, 726, 812, 898, 984, 1070]
  const strokes = xs.map((x, k) => box('b' + k, x, 390, 74, 72))
  const note = { text: '4, 8, 1 big bold in first three boxes', at: { x: 677, y: 426 } }
  it('the first three characters go in the first three boxes, all six kept', () => {
    const [b] = boxCharsOf([note], strokes)
    expect(b!.chars).toEqual(['4', '8', '1'])
    expect(b!.boxes.length).toBe(6)
    expect(boxCharsBrief([b!])).toMatch(/"4" centred inside box 1/)
  })
  it('a plain sentence with "boxes" is not characters', () => {
    expect(boxCharsOf([{ text: 'We sent it to the boxes', at: { x: 677, y: 426 } }], strokes)).toEqual([])
  })
  it('checked: bare digits with the boxes gone fail; digits inside kept boxes pass', () => {
    const [b] = boxCharsOf([note], strokes)
    const bare = { nodes: [0, 1, 2].map((k) => ({ id: 'd' + k, rect: { x: xs[k]! + 2, y: 380, w: 70, h: 90 }, text: '481'[k], style: { backgroundColor: 'rgba(0, 0, 0, 0)' } })) }
    expect(verifyBoxChars([b!], bare).satisfied).toBe(false)
    const kept = { nodes: [
      ...xs.map((x, k) => ({ id: 'b' + k, rect: { x, y: 390, w: 74, h: 72 }, style: { backgroundColor: 'rgba(0, 0, 0, 0)', border: '2px rgb(200, 200, 200)' } })),
      ...[0, 1, 2].map((k) => ({ id: 'd' + k, rect: { x: xs[k]! + 25, y: 400, w: 24, h: 50 }, text: '481'[k], style: { backgroundColor: 'rgba(0, 0, 0, 0)' } })),
    ] }
    expect(verifyBoxChars([b!], kept).satisfied).toBe(true)
  })
})
