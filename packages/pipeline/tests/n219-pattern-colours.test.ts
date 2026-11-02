import { describe, expect, it } from 'vitest'
import { patternBrief, patternColours, patternStrokes, patternsOf, verifyPatternColours } from '../src/patterncolour.js'
import { strokeDividers, textPlaceBrief, verifyTextPlace } from '../src/textplace.js'

const region = { x: 2, y: 2, w: 518, h: 896 }
const note = 'checkerboard: black and cream squares, 4 across, 7 down'
const action = [{ notes: [note], shapeMarks: [{ shape: 'box', box: region }] }]
let ids = 0
const cell = (x: number, y: number, bg: string, extra: Record<string, string> = {}) =>
  ({ id: `c${String(ids++)}`, parent: 'panel', text: '', rect: { x, y, w: 128, h: 128 }, style: { backgroundColor: bg, ...extra } })
const panel = { id: 'panel', parent: null, text: '', rect: { x: 0, y: 0, w: 520, h: 900 }, style: { backgroundColor: 'rgba(0, 0, 0, 0)' } }
const board = (a: string, b: string, extra: Record<string, string> = {}) => [panel, ...Array.from({ length: 28 }, (_, k) => {
  const x = (k % 4) * 128, y = Math.floor(k / 4) * 128
  return (k % 4 + Math.floor(k / 4)) % 2 ? cell(x, y, b, extra) : cell(x, y, a)
})]

// round 41 c4 chess night: cream squares came out as grey fades in one build of two
describe('a drawn pattern keeps its named colours flat (n219)', () => {
  it('reads the colours of a pattern, and only of a pattern', () => {
    expect(patternColours(note)).toEqual(['black', 'cream'])
    expect(patternColours('black and white stripes')).toEqual(['black', 'white'])
    expect(patternColours('tiles navy/cream')).toEqual(['navy', 'cream'])
    expect(patternColours('black and white card with squares of text')).toBeNull()
    expect(patternColours('Every Thursday, 7pm, bold')).toBeNull()
    expect(patternColours('red squares')).toBeNull()
  })
  it("tells each cell flat, in the sketch's own ink where it matches", () => {
    const b = patternBrief(patternsOf(action), ['#f4f0e8', '#151515'])
    expect(b).toContain('black #151515 or cream #f4f0e8')
    expect(b).toContain('No opacity')
    expect(patternBrief([])).toBe('')
  })
  it('passes flat cells in the named family', () => {
    const v = verifyPatternColours(patternsOf(action), { nodes: board('rgb(21, 21, 21)', 'rgb(244, 240, 232)') })
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeFalsy()
  })
  it('names grey cells, faded cells, see-through cells and a wash', () => {
    const grey = verifyPatternColours(patternsOf(action), { nodes: board('rgb(21, 21, 21)', 'rgb(163, 161, 155)') })
    expect(grey.satisfied).toBe(false)
    expect(grey.reason).toContain('off those colours')
    const fade = verifyPatternColours(patternsOf(action), { nodes: board('rgb(21, 21, 21)', 'rgb(244, 240, 232)', { opacity: '0.6' }) })
    expect(fade.satisfied).toBe(false)
    expect(fade.reason).toContain('faded')
    const thin = verifyPatternColours(patternsOf(action), { nodes: board('rgb(21, 21, 21)', 'rgba(244, 240, 232, 0.5)') })
    expect(thin.satisfied).toBe(false)
    const wash = { id: 'w', parent: null, text: '', rect: { x: 0, y: 0, w: 520, h: 900 }, style: { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0))' } }
    const washed = verifyPatternColours(patternsOf(action), { nodes: [...board('rgb(21, 21, 21)', 'rgb(244, 240, 232)'), wash] })
    expect(washed.satisfied).toBe(false)
    expect(washed.reason).toContain('wash')
  })
  it('lets one colour show from behind the cells, but not go missing', () => {
    const blacks = (k: number) => cell((k % 4) * 128, Math.floor(k / 4) * 128, 'rgb(21, 21, 21)')
    const cells = Array.from({ length: 14 }, (_, k) => blacks(k * 2))
    const page = { id: 'p', parent: null, text: '', rect: { x: 0, y: 0, w: 1280, h: 900 }, style: { backgroundColor: 'rgb(244, 240, 232)' } }
    expect(verifyPatternColours(patternsOf(action), { nodes: [page, panel, ...cells] }).satisfied).toBe(true)
    const none = verifyPatternColours(patternsOf(action), { nodes: [panel, ...cells] })
    expect(none.satisfied).toBe(false)
    expect(none.reason).toContain('cream is not on it')
  })
  it('judges a pattern built as one repeating gradient', () => {
    const one = (img: string) => ({ nodes: [{ id: 'g', parent: null, text: '', rect: { x: 0, y: 0, w: 520, h: 900 }, style: { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: img } }] })
    expect(verifyPatternColours(patternsOf(action), one('repeating-conic-gradient(rgb(21, 21, 21) 0%, rgb(244, 240, 232) 25%)')).satisfied).toBe(true)
    expect(verifyPatternColours(patternsOf(action), one('repeating-conic-gradient(rgb(21, 21, 21) 0%, rgb(150, 150, 150) 25%)')).satisfied).toBe(false)
  })
  it('says nothing when no pattern is typed or its cells cannot be seen', () => {
    expect(verifyPatternColours([], { nodes: [] }).unverifiable).toBe(true)
    expect(verifyPatternColours(patternsOf(action), { nodes: [panel] }).unverifiable).toBe(true)
  })
  it('takes the box under a pattern out of being one fill, and judges cells in an outline read as ink', () => {
    const outline = [{ notes: [note], inkColours: [
      { strokeId: 's1', paint: 'background', color: '#151515', box: { x: 1, y: 1, w: 520, h: 897 } },
      { strokeId: 's9', paint: 'text', color: '#151515', box: { x: 0, y: 0, w: 9, h: 9 } },
    ] }]
    expect([...patternStrokes(outline)]).toEqual(['s1'])
    expect(patternsOf(outline)[0]!.region).toEqual({ x: 1, y: 1, w: 520, h: 897 })
    // a box tapped in a colour the note does not name keeps its fill
    expect([...patternStrokes([{ notes: [note], inkColours: [{ strokeId: 's2', paint: 'background', color: '#e94f3d', box: region }] }])]).toEqual([])
    expect([...patternStrokes([{ notes: ['Save a seat'], inkColours: [{ strokeId: 's3', paint: 'background', color: '#151515', box: region }] }])]).toEqual([])
  })
})

// the same page: the panel was read as an outline, so nothing held a box, and the date was measured against the page
describe('a big box among the strokes is a column edge whichever action holds it (n219)', () => {
  const pts = (w: Array<[number, number]>) => w.flatMap(([x, y], i) => { const [a, b] = w[(i + 1) % w.length]!; return i === w.length - 1 ? [{ x, y }] : Array.from({ length: 12 }, (_, k) => ({ x: x + (a - x) * k / 12, y: y + (b - y) * k / 12 })) })
  const box = { id: 's1', points: pts([[2, 2], [520, 2], [520, 898], [2, 898], [2, 2]]) }
  const date = { strokeId: 's4', shape: 'line', box: { x: 606, y: 433, w: 220, h: 0 }, from: { x: 606, y: 433 }, to: { x: 826, y: 433 }, words: 'Every Thursday, 7pm, bold' }
  const viewport = { w: 1280, h: 900 }
  it('finds the box among the strokes', () => {
    expect(strokeDividers([box]).map((m) => m.shape)).toEqual(['box'])
  })
  it('a line at the left of the column beside it is no longer told right-aligned', () => {
    const acts = [{ shapeMarks: [date] }] as never[]
    expect(textPlaceBrief(acts, viewport)).toContain('RIGHT-aligned')
    expect(textPlaceBrief(acts, viewport, strokeDividers([box]))).not.toContain('RIGHT-aligned')
  })
  it('the page check agrees', () => {
    const atLeft = { nodes: [{ id: 'd', tag: 'p', text: 'Every Thursday, 7pm', rect: { x: 606, y: 420, w: 300, h: 30 }, textBox: { x: 606, y: 420, w: 300, h: 30 }, style: { fontSize: '20px' } }], viewport }
    const v = verifyTextPlace([date] as never, atLeft as never, viewport, strokeDividers([box]))
    expect(v.satisfied).toBe(true)
  })
})
