import { describe, expect, it } from 'vitest'
import { inkFills, tapDots, tapBands, markFill, type Stroke } from '@s2c/ink'
import { tapDotsBrief, verifyTapDots } from '../src/tapdots.js'
import { cellRows, countedItems } from '../src/drawnlist.js'
import { directionStrings, typedCopyBrief } from '../src/typedcopy.js'
import { rowData } from '../src/rowdata.js'
import { repeatCount } from '../src/repeatmark.js'

const pts = (l: number[][]) => l.map(([x, y], i) => ({ x: x!, y: y!, t: i }))
const box = (id: string, x: number, y: number, w: number, h: number, color?: string): Stroke =>
  ({ id, color, points: pts([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]) }) as Stroke
const line = (id: string, x0: number, x1: number, y: number): Stroke => ({ id, points: pts([[x0, y], [x1, y]]) }) as Stroke
const tap = (id: string, x: number, y: number, color: string): Stroke => ({ id, color, points: pts([[x, y]]) }) as Stroke
const vp = { w: 1280, h: 900 }

// the roster's real marks (r46 e2)
const table = box('t', 270, 170, 960, 560, '#e2e8f0')
const roster: Stroke[] = [table, line('a', 270, 1230, 240), line('b', 270, 1230, 320),
  tap('g', 915, 281, '#22c55e'), tap('o', 915, 441, '#f59e0b'), tap('s', 915, 601, '#94a3b8')]

describe('n215 taps lined up inside a mark are small dots', () => {
  it('the roster: three colours down one column are dots, and nothing fills the table', () => {
    expect(tapDots(roster, vp).map((d) => d.color)).toEqual(['#22c55e', '#f59e0b', '#94a3b8'])
    expect(inkFills(roster, vp)).toEqual([])
    expect(markFill(inkFills(roster, vp), 't', roster)).toBeNull()
    expect(tapBands(table, inkFills(roster, vp), roster)).toBeNull()
  })
  it('a row of taps across a mark, same reading', () => {
    const s = [box('c', 100, 100, 600, 200), line('l', 120, 300, 150), tap('1', 200, 250, '#ff0000'), tap('2', 400, 252, '#00ff00'), tap('3', 600, 249, '#0000ff')]
    expect(tapDots(s, vp)).toHaveLength(3)
    expect(inkFills(s, vp)).toEqual([])
  })
  it('a single off-colour tap is still a fill (a pale fill in a darker outline)', () => {
    const s = [box('c', 100, 100, 500, 500, '#2f6b47'), line('l', 120, 300, 150), tap('1', 300, 300, '#dde9d8')]
    expect(tapDots(s, vp)).toEqual([])
    expect(inkFills(s, vp)[0]?.target).toBe('c')
  })
  it('two taps either side of a divider stay two fills (the ticket, n59)', () => {
    const s = [box('c', 100, 100, 800, 400), line('l', 100, 900, 300), tap('1', 500, 200, '#ffffff'), tap('2', 500, 400, '#ec4899')]
    expect(tapDots(s, vp)).toEqual([])
    expect(markFill(inkFills(s, vp), 'c', s)?.split).toBeTruthy()
  })
  it('three colours in a column of a box holding nothing else stay a fade', () => {
    const s = [box('c', 100, 100, 600, 700), tap('1', 400, 150, '#38bdf8'), tap('2', 400, 400, '#1580bd'), tap('3', 400, 700, '#e0f2fe')]
    expect(tapDots(s, vp)).toEqual([])
    expect(markFill(inkFills(s, vp), 'c', s)?.colors).toHaveLength(3)
  })
  it('scattered taps are not a column', () => {
    const s = [box('c', 100, 100, 800, 700), line('l', 120, 300, 150), tap('1', 200, 150, '#111111'), tap('2', 600, 400, '#222222'), tap('3', 300, 700, '#333333')]
    expect(tapDots(s, vp)).toEqual([])
  })
  it('ruled lines giving each tap its own band are painted rows (n91)', () => {
    const s = [box('c', 100, 100, 800, 600), line('a', 100, 900, 250), line('b', 100, 900, 450), line('c2', 100, 900, 600),
      tap('1', 500, 180, '#eeeeee'), tap('2', 500, 350, '#dddddd'), tap('3', 500, 520, '#cccccc')]
    expect(tapDots(s, vp)).toEqual([])
    expect(tapBands(s[0]!, inkFills(s, vp), s)?.bands.filter((b) => b.color)).toHaveLength(3)
  })
  it('same colour three times is left alone', () => {
    const s = [box('c', 100, 100, 800, 600), line('a', 120, 300, 250), tap('1', 500, 180, '#eeeeee'), tap('2', 500, 350, '#eeeeee'), tap('3', 500, 520, '#eeeeee')]
    expect(tapDots(s, vp)).toEqual([])
  })
  it('told to the build', () => {
    const b = tapDotsBrief(tapDots(roster, vp))
    expect(b).toContain('#22c55e at (915,281)')
    expect(tapDotsBrief([])).toBe('')
  })
  it('checked on the page: dots at their spots, nothing painted round them', () => {
    const dots = tapDots(roster, vp)
    const dot = (x: number, y: number, c: string) => ({ rect: { x: x - 5, y: y - 5, w: 10, h: 10 }, style: { backgroundColor: c } })
    const good = [dot(915, 281, 'rgb(34, 197, 94)'), dot(915, 441, 'rgb(245, 158, 11)'), dot(915, 601, 'rgb(148, 163, 184)')]
    expect(verifyTapDots(dots, { nodes: good }).satisfied).toBe(true)
    const missing = verifyTapDots(dots, { nodes: good.slice(0, 2) })
    expect(missing.satisfied).toBe(false)
    expect(missing.reason).toContain('(915,601)')
    const paintedRow = verifyTapDots(dots, { nodes: [...good, { rect: { x: 270, y: 240, w: 960, h: 80 }, style: { backgroundColor: 'rgb(34, 197, 94)' } }] })
    expect(paintedRow.reason).toContain('painted #22c55e')
    expect(verifyTapDots([], { nodes: [] }).unverifiable).toBe(true)
  })
})

describe('n215 rows with cells listed after a count', () => {
  const NOTE = 'x6 rows: Ana Ruiz, Design lead, Active; Ben Cole, Engineer, Active; Chi Ng, Engineer, Away; Dev Patel, Product, Active; Eva Moss, Support, Off; Finn Lee, Engineer, Active'
  it('are six rows of three cells, not six long labels', () => {
    expect(countedItems(NOTE)).toBeNull()
    expect(cellRows(NOTE)?.[4]).toEqual(['Eva Moss', 'Support', 'Off'])
    expect(rowData(NOTE)?.rows).toHaveLength(6)
    expect(rowData(NOTE)?.rows[0]).toEqual(['Ana Ruiz', 'Design lead', 'Active'])
  })
  it('Active and Off are copy there, never directions', () => {
    expect(directionStrings([NOTE])).toEqual([])
    expect(typedCopyBrief([NOTE])).not.toContain('direction')
  })
  it('never repeat the ring they were typed on sideways', () => {
    expect(repeatCount(NOTE)).toBeNull()
    expect(repeatCount('6 strips: Drums, Bass, Keys, Guitar, Vocals, FX')?.n).toBe(6)
  })
  it('the loan rows (no cells) still go on their drawn lines', () => {
    const loan = 'x4 down: Loan amount $24,000 half; Term 60 months 70%; Interest rate 6.4% 30%; Down payment $4,000 20%; values bold right'
    expect(cellRows(loan)).toBeNull()
    expect(countedItems(loan)?.items).toHaveLength(4)
  })
})
