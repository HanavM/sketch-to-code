import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { countClaims, countsBrief, verifyCounts } from '../src/counts.js'
import { loadKeptMarks, saveKeptMarks, mergeKeptMarks, marksInPlace, verifyKeptMarks, type ShapeMark } from '../src/shapemark.js'
import type { DomNode, DomSnapshot } from '@s2c/dom'

const style = { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: '', color: '', fontSize: '14px', fontWeight: '400', borderRadius: '0' }
const node = (id: string, tag: string, parent: string | null, rect: DomNode['rect'], text = ''): DomNode =>
  ({ id, tag, srcLoc: null, rect, text, classes: [], style, parent, depth: parent ? 1 : 0 })
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false })

/** A table body of `rows` rows; the first `filled` carry a team name, the rest only their number. */
function grid(rows: number, filled: number, y0 = 130): DomNode[] {
  const out = [node('tb', 'tbody', null, { x: 0, y: y0, w: 1280, h: rows * 29 })]
  for (let i = 0; i < rows; i++) {
    out.push(node(`r${i}`, 'tr', 'tb', { x: 0, y: y0 + i * 29, w: 1280, h: 29 }))
    out.push(node(`r${i}n`, 'td', `r${i}`, { x: 0, y: y0 + i * 29, w: 48, h: 29 }, String(i + 1)))
    out.push(node(`r${i}t`, 'td', `r${i}`, { x: 48, y: y0 + i * 29, w: 200, h: 29 }, i < filled ? `Team ${i}` : ''))
  }
  return out
}

describe('countClaims: numbers typed in notes', () => {
  it('reads the data-grid notes (round 5 e5)', () => {
    const c = countClaims(['spreadsheet grid A-H, 24 numbered rows', '5 teams with budgets', 'sheet tabs Q1-Q4, Summary', 'D4 =SUM(B4:C4)'])
    expect(c.map((x) => [x.n, x.noun, x.slots])).toEqual([[24, 'rows', true], [5, 'teams', false]])
  })
  it('reads number words and skips sizes, money and years', () => {
    const c = countClaims(['three pricing cards', 'title 40 px', 'about 12 pixels', '$5 plans', 'since 2019 years', 'Q1-Q4 tabs'])
    expect(c.map((x) => `${x.n} ${x.noun}`)).toEqual(['3 cards'])
  })
  it('tells codegen to leave the slots past the content empty', () => {
    const b = countsBrief(countClaims(['24 numbered rows', '5 teams']))
    expect(b).toMatch(/exactly 5 teams/)
    expect(b).toMatch(/other 19 rows EMPTY/)
  })
})

describe('verifyCounts', () => {
  const claims = countClaims(['spreadsheet grid, 24 numbered rows', '5 teams with budgets'])
  it('fails a grid padded with invented teams', () => {
    const v = verifyCounts(claims, snap(grid(24, 24)))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/5 teams.*24 filled/)
  })
  it('passes 24 rows with 5 filled', () => {
    expect(verifyCounts(claims, snap(grid(24, 5))).satisfied).toBe(true)
  })
  it('fails a grid with too few rows', () => {
    const v = verifyCounts(countClaims(['24 numbered rows']), snap(grid(30, 5)))
    expect(v.satisfied).toBe(false)
  })
  it('stays out of the way when nothing on the page can be counted', () => {
    expect(verifyCounts(countClaims(['5 teams']), snap([node('a', 'div', null, { x: 0, y: 0, w: 10, h: 10 })])).unverifiable).toBe(true)
  })
})

describe('kept marks: boxes drawn earlier stay where drawn', () => {
  const gridMark: ShapeMark = { strokeId: 's3', shape: 'box', box: { x: 0, y: 86, w: 1278, h: 750 } }
  const wrap = (y: number) => [node('w', 'div', null, { x: 0, y, w: 1280, h: 750 })]

  it('remembers boxes (not lines, not tiny ones) and replaces one drawn over again', () => {
    const line: ShapeMark = { strokeId: 'l', shape: 'line', box: { x: 0, y: 26, w: 340, h: 0 } }
    const tiny: ShapeMark = { strokeId: 't', shape: 'box', box: { x: 0, y: 0, w: 20, h: 12 } }
    const kept = mergeKeptMarks([], [gridMark, line, tiny])
    expect(kept).toHaveLength(1)
    const again = mergeKeptMarks(kept, [{ strokeId: 'x', shape: 'box', box: { x: 0, y: 90, w: 1270, h: 740 } }])
    expect(again).toHaveLength(1)
    expect(again[0]!.box.y).toBe(90)
  })
  it('round-trips through the project folder', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-kept-'))
    expect(loadKeptMarks(root)).toEqual([])
    saveKeptMarks(root, mergeKeptMarks([], [gridMark]))
    expect(loadKeptMarks(root)).toHaveLength(1)
  })
  it('holds only marks that are in place now, and fails an edit that moved one (round 5 e5: grid 48px up)', () => {
    const kept = mergeKeptMarks([], [gridMark])
    expect(marksInPlace(kept, snap(wrap(86)))).toHaveLength(1)
    expect(marksInPlace(kept, snap(wrap(300)))).toHaveLength(0)
    const v = verifyKeptMarks(kept, snap(wrap(38)))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/48px too high/)
    expect(verifyKeptMarks(kept, snap(wrap(90))).satisfied).toBe(true)
  })
})
