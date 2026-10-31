import { describe, expect, it } from 'vitest'
import { shapeOf, type ShapeMark } from '../src/shapemark.js'
import { textPlaceBrief } from '../src/textplace.js'
import { failureBrief } from '../src/repair-brief.js'
import { FRESH_REPAIR_MS, freshRepairFits, repairFits, VERIFY_MARGIN_MS } from '../src/repair-time.js'

function walk(way: number[][]): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < way.length - 1; i++) {
    const [a, b] = [way[i]!, way[i + 1]!]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) / 6))
    for (let k = 0; k < n; k++) out.push({ x: a[0]! + ((b[0]! - a[0]!) * k) / n, y: a[1]! + ((b[1]! - a[1]!) * k) / n })
  }
  out.push({ x: way.at(-1)![0]!, y: way.at(-1)![1]! })
  return out
}
const VP = { w: 1280, h: 900 }
const line = (id: string, x0: number, x1: number, y: number, words: string): ShapeMark =>
  ({ ...shapeOf(walk([[x0, y], [x1, y]]))!, strokeId: id, words, wordsAt: { x: x0 + 20, y: y - 30 } })

describe('n170: a heading with a size word on a line 200px or longer is sized by the line up front', () => {
  it('gradebook: "Year 9 Science big bold" on a 210px line is told its font-size', () => {
    const brief = textPlaceBrief([{ shapeMarks: [line('s4', 260, 470, 90, 'Year 9 Science big bold')] }], VP)
    expect(brief).toMatch(/the line sets its SIZE/)
    const fs = Number(/font-size about (\d+)px/.exec(brief)?.[1])
    expect(fs).toBeGreaterThanOrEqual(24); expect(fs).toBeLessThanOrEqual(30)
    expect(brief).toMatch(/, bold, letters/)
  })
  it('a big italic serif heading is not told bold', () => {
    const brief = textPlaceBrief([{ shapeMarks: [line('s1', 300, 952, 200, 'A quiet place to read. big italic serif')] }], VP)
    expect(brief).toMatch(/weight as its note says/)
    expect(brief).not.toMatch(/, bold, letters/)
  })
  it('a short big title (under 200px) is left to the title cap', () => {
    const brief = textPlaceBrief([{ shapeMarks: [line('s1', 260, 420, 90, 'Today huge bold')] }], VP)
    expect(brief).not.toMatch(/the line sets its SIZE/)
  })
})

describe('n170: a stalled repair is retried fresh even when the run is short of time for a full repair', () => {
  it('n165 try 1: 165 s of silence does not make a fresh, short retry look too long', () => {
    const now = 0
    const deadline = now + FRESH_REPAIR_MS + VERIFY_MARGIN_MS + 5_000
    const sends = [{ kind: 'build' as const, ms: 360_000 }, { kind: 'repair' as const, ms: 165_000 }]
    expect(repairFits(deadline, now, sends)).toBe(false)
    expect(freshRepairFits(deadline, now)).toBe(true)
    expect(freshRepairFits(now + 60_000, now)).toBe(false)
    expect(freshRepairFits(undefined, now)).toBe(true)
  })
  it('a fresh retry with few failures is asked for a quick first edit', () => {
    const fs = ['the box drawn at (1060,39) sits 225px too low', 'the ring sits 15px too low']
    expect(failureBrief(fs, { onlyFirst: true })).toMatch(/first Edit within a minute/)
    expect(failureBrief(fs)).not.toMatch(/within a minute/)
  })
})
