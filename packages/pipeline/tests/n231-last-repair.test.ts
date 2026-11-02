import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LAST_REPAIR_PAGE_CHARS, lastRepairBrief, rankFailures } from '../src/repair-brief.js'
import { FRESH_REPAIR_MS, LAST_REPAIR_MS, freshRepairFits, VERIFY_MARGIN_MS } from '../src/repair-time.js'

// the checks that failed on timesheet (n228 try 2), as the record kept them: 14 faults, two repairs stopped with no edit
const RUN = new URL('../../../tests/hand/out-n228/e2try2/runs.json', import.meta.url).pathname
type V = { kind: string; satisfied?: boolean; reason?: string; verdict?: { satisfied: boolean; reason: string } }
const timesheet = (): string[] => {
  const v: V[] = JSON.parse(readFileSync(RUN, 'utf8'))[0].verification
  return v.filter((x) => !(x.satisfied ?? x.verdict?.satisfied)).map((x) => `${x.kind}: ${x.reason ?? x.verdict!.reason}`)
}
const page = { file: 'src/App.tsx', text: 'export default function App() { return <aside className="w-[220px]" /> }' }

describe('n231 a repair stopped twice with no edit gets one small last try', () => {
  it('names one problem, the biggest, and leaves the rest for the next round', () => {
    const fs = timesheet()
    expect(fs.length).toBeGreaterThan(5)
    const brief = lastRepairBrief(fs, [page])
    expect(brief).toContain(`PROBLEM:\n${rankFailures(fs)[0]}`)
    expect(brief).toContain(`(${fs.length - 1} other problems are for the next round`)
    for (const other of rankFailures(fs).slice(1)) expect(brief).not.toContain(other)
  })

  it('hands over the page so there is nothing to read first', () => {
    const brief = lastRepairBrief(['marks: the box sits 80px too low'], [page])
    expect(brief).toContain(page.text)
    expect(brief).toMatch(/do not read anything: the page is below/)
    expect(brief).not.toMatch(/other problems/)
  })

  it('a page too long to send is read from its file instead', () => {
    const big = { file: 'src/App.tsx', text: 'x'.repeat(LAST_REPAIR_PAGE_CHARS + 1) }
    const brief = lastRepairBrief(['marks: the box sits 80px too low'], [big])
    expect(brief).not.toContain(big.text)
    expect(brief).toMatch(/do not read anything but the page file/)
  })

  it('has longer than the fresh repair, and only runs when that time fits', () => {
    expect(LAST_REPAIR_MS).toBeGreaterThan(FRESH_REPAIR_MS)
    const now = 1_000_000
    expect(freshRepairFits(now + FRESH_REPAIR_MS + VERIFY_MARGIN_MS, now)).toBe(true)
    expect(freshRepairFits(now + FRESH_REPAIR_MS + VERIFY_MARGIN_MS, now, LAST_REPAIR_MS)).toBe(false)
    expect(freshRepairFits(undefined, now, LAST_REPAIR_MS)).toBe(true)
  })
})
