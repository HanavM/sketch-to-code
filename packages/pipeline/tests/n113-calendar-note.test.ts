import { describe, expect, it } from 'vitest'
import { calendarBrief, calendarOf, cellOf, verifyCalendars } from '../src/calendar.js'
import { typedCopyBrief } from '../src/typedcopy.js'

const HOTEL = 'November 2026 calendar, 12 and 16 magenta circles, 13–15 pale pink'
const leaf = (id: string, text: string, x: number, y: number) => ({ id, text, rect: { x, y, w: 14, h: 14 }, textBox: { x, y, w: 14, h: 14 } })

/** A month grid as a page would lay it out, given the column of day 1. */
function grid(days: number, firstCol: number, heading: string) {
  const nodes = [leaf('h', heading, 0, 0)]
  for (let d = 1; d <= days; d++) { const i = firstCol + d - 1; nodes.push(leaf(`d${String(d)}`, String(d), 20 + (i % 7) * 40, 60 + Math.floor(i / 7) * 30)) }
  return { nodes }
}

describe('n113: a note naming a month calendar describes the block', () => {
  it('round 38 hotel: November 2026, day 1 a Sunday in a Monday-first week, marks parsed', () => {
    const c = calendarOf(HOTEL)!
    expect(c.title).toBe('November 2026')
    expect(c.days).toBe(30)
    expect(c.weekStart).toBe('monday')
    expect(c.firstCol).toBe(6)
    expect(cellOf(c, 2)).toEqual({ col: 0, row: 1 })
    expect(c.marks).toEqual([{ days: [12, 16], look: 'magenta', shape: 'circle' }, { days: [13, 14, 15], look: 'pale pink', shape: 'fill' }])
  })
  it('Sunday-first when the note says so; other months right', () => {
    const c = calendarOf('Feb 2028 calendar, weeks start Sunday, 14 red dot')!
    expect(c.weekStart).toBe('sunday')
    expect(c.days).toBe(29)
    expect(c.firstCol).toBe(2) // 1 Feb 2028 is a Tuesday
    expect(c.marks).toEqual([{ days: [14], look: 'red', shape: 'circle' }])
  })
  it('notes that only mention a month or a calendar are left alone', () => {
    expect(calendarOf('Dates Nov 12 – 16')).toBeNull()
    expect(calendarOf('Add to calendar')).toBeNull()
    expect(calendarOf('November 2026, bold')).toBeNull()
  })
  it('the brief names the heading and day 1 column; typed copy no longer prints the note', () => {
    const b = calendarBrief([HOTEL])
    expect(b).toContain('heading "November 2026"')
    expect(b).toContain('day 1 is a Sunday, so it sits in column 7')
    expect(b).toContain('M T W T F S S')
    expect(typedCopyBrief([HOTEL])).not.toContain('November 2026 calendar')
  })
  it('the page check: heading only, days in their weekday columns', () => {
    expect(verifyCalendars([HOTEL], grid(30, 6, 'November 2026')).satisfied).toBe(true)
    // the n111 build: Sunday-first grid (day 1 in column 1) and the note as heading
    const bad = verifyCalendars([HOTEL], grid(30, 0, 'November 2026 calendar, 12 and 16 magenta circles'))
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toContain('printed')
    expect(bad.reason).toContain('out of their weekday column')
    expect(verifyCalendars(['Search'], grid(30, 6, 'x')).unverifiable).toBe(true)
  })
})

describe('n113: day numbers in a calendar note are not counts', () => {
  it('"12 and 16 magenta circles" and "Reserve · 4 nights" claim no count; real counts stay', async () => {
    const { countClaims } = await import('../src/counts.js')
    expect(countClaims([HOTEL, 'Reserve · 4 nights'])).toEqual([])
    expect(countClaims(['5 teams with budgets']).map((c) => c.n)).toEqual([5])
  })
})
