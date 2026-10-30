/**
 * A note that says what a block is gives its copy and look (n113).
 *
 * Round 38 e1 (hotel booking, n108/n111): a tall box at the right was typed "November 2026 calendar, 12 and 16
 * magenta circles, 13–15 pale pink". Every build printed the whole note as the box's heading, then guessed the
 * grid: weeks starting on Sunday, the marks on the wrong days (15 pale, 16 plain).
 *
 * A person who types "<month> <year> calendar" names the block; the rest of the note says how days look. Here:
 * - the heading is the month and year only ("November 2026"); the words "calendar", the day numbers and the
 *   colour words are never printed;
 * - the grid is that real month: the right number of days, day 1 under its true weekday, weeks starting on
 *   Monday (ISO) unless the note says Sunday ("Sunday first", "weeks start Sunday", "S M T W T F S");
 * - "12 and 16 magenta circles" puts a filled magenta circle behind days 12 and 16 (white numbers);
 *   "13–15 pale pink" a pale pink fill behind 13, 14, 15.
 * The build is told all of this with the computed weekday of day 1; the page is checked: the heading, no note
 * text printed, and each day number in its weekday column. Zero tokens.
 */

interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { id: string; text?: string; textBox?: Box; rect?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface CalendarVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface DayMark { days: number[]; look: string; shape: 'circle' | 'fill' }
export interface CalendarNote {
  note: string
  month: number          // 0-11
  year: number
  title: string          // "November 2026"
  days: number           // days in the month
  weekStart: 'monday' | 'sunday'
  firstCol: number       // column (0-6) of day 1, counted from weekStart
  marks: DayMark[]
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{4})\b/i
const CAL_WORD = /\b(calendar|cal|month view|date picker|datepicker)\b/i
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Day numbers a part names: "12 and 16", "13–15", "3, 4 & 9", "20-22". */
function daysIn(part: string, max: number): number[] {
  const out: number[] = []
  const s = part.replace(/[–—]/g, '-')
  for (const m of s.matchAll(/\b(\d{1,2})\s*-\s*(\d{1,2})\b|\b(\d{1,2})\b/g)) {
    if (m[1] && m[2]) { const a = Number(m[1]), b = Number(m[2]); if (a >= 1 && b <= max && a < b && b - a < 31) for (let d = a; d <= b; d++) out.push(d) }
    else if (m[3]) { const d = Number(m[3]); if (d >= 1 && d <= max) out.push(d) }
  }
  return [...new Set(out)]
}

/** The calendar a note describes, or null. */
export function calendarOf(note: string): CalendarNote | null {
  const text = note.replace(/\s+/g, ' ').trim()
  if (!CAL_WORD.test(text)) return null
  const m = MONTH_RE.exec(text)
  if (!m) return null
  const key = m[1]!.toLowerCase().slice(0, 3)
  const month = MONTHS.findIndex((n) => n.startsWith(key))
  const year = Number(m[2])
  if (month < 0 || year < 1900 || year > 2200) return null
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const sunday = /\bsun(?:day)?s?\s+(?:first|start)|\bstarts?\s+(?:on\s+)?sun(?:day)?\b|\bweeks?\s+(?:start|begin)s?\s+(?:on\s+)?sun|\bS\s+M\s+T\s+W\s+T\s+F\s+S\b|\bsu\s+mo\s+tu\b/i.test(text)
  const weekStart: 'monday' | 'sunday' = sunday ? 'sunday' : 'monday'
  const dow = new Date(Date.UTC(year, month, 1)).getUTCDay() // 0 = Sunday
  const firstCol = weekStart === 'sunday' ? dow : (dow + 6) % 7
  // the parts after the "<month> <year> calendar" head: day marks
  const marks: DayMark[] = []
  for (const raw of text.split(/[,;](?![^()]*\))/).map((p) => p.trim()).filter(Boolean)) {
    if (MONTH_RE.test(raw) && CAL_WORD.test(raw)) continue
    if (/\b(sun|mon)(day)?\s+(first|start)|weeks?\s+(start|begin)/i.test(raw)) continue
    // a part like "12 and 16 magenta circles": strip the day numbers, what is left is the look
    const ds = daysIn(raw, days)
    if (!ds.length) continue
    const look = raw.replace(/[–—]/g, '-').replace(/\b\d{1,2}\s*-\s*\d{1,2}\b|\b\d{1,2}\b/g, ' ').replace(/\b(and|&|days?|on|the)\b/gi, ' ').replace(/[,&]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!look) continue
    const shape: 'circle' | 'fill' = /\b(circles?|rings?|dots?|discs?|round)\b/i.test(look) ? 'circle' : 'fill'
    const colour = look.replace(/\b(circles?|rings?|dots?|discs?|round|filled|fill|highlight(ed)?|background|bg|band|range)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    marks.push({ days: ds, look: colour || look, shape })
  }
  return { note: text, month, year, title: `${cap(MONTHS[month]!)} ${String(year)}`, days, weekStart, firstCol, marks }
}

const q = (s: string) => `"${s}"`

/** Column (0-6 from the week start) and row of a day. */
export function cellOf(c: Pick<CalendarNote, 'firstCol'>, day: number): { col: number; row: number } {
  const i = c.firstCol + day - 1
  return { col: i % 7, row: Math.floor(i / 7) }
}

export function calendarBrief(notes: readonly string[]): string {
  const cals = notes.map(calendarOf).filter((c): c is CalendarNote => !!c)
  if (!cals.length) return ''
  const seen = new Set<string>()
  const lines = cals.filter((c) => { const k = c.note; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 3).map((c) => {
    const order = c.weekStart === 'monday' ? DAY_NAMES : ['Sunday', ...DAY_NAMES.slice(0, 6)]
    const letters = order.map((d) => d[0]).join(' ')
    const first = order[c.firstCol]!
    const rows = cellOf(c, c.days).row + 1
    const marks = c.marks.map((mk) => mk.shape === 'circle'
      ? `days ${mk.days.join(', ')}: a filled ${mk.look} circle behind the number (number white, bold)`
      : `days ${mk.days.join(', ')}: a ${mk.look} fill behind each number (a soft rounded square or a band joining them; number dark)`).join('; ')
    return `- The note ${q(c.note)} DESCRIBES a block; it is not copy. Build a month calendar of ${c.title}: ` +
      `heading ${q(c.title)} (just that, small bold, at the box's top left), then a row of weekday letters ${q(letters)} (week starts ${c.weekStart === 'monday' ? 'Monday' : 'Sunday'}), ` +
      `then the days 1 to ${String(c.days)} in a 7-column grid, ${String(rows)} rows: day 1 is a ${first}, so it sits in column ${String(c.firstCol + 1)} of the first row (columns before it empty), ` +
      `every later day in its true weekday column. Even columns, centred numbers, the grid as wide as the box.` +
      (marks ? ` Day marks: ${marks}; every other day plain.` : '') +
      ` Never print the note itself, the word "calendar", or the colour words.`
  })
  return `CALENDARS (deterministic; checked on the page). A note naming a month and "calendar" describes the block, not its words:\n${lines.join('\n')}\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
const box = (n: NodeLike) => n.textBox ?? n.rect

/** The heading is the month and year, the note is never printed, and each day sits in its weekday column. */
export function verifyCalendars(notes: readonly string[], after: Snap): CalendarVerdict {
  const cals = [...new Map(notes.map(calendarOf).filter((c): c is CalendarNote => !!c).map((c) => [c.note, c])).values()]
  if (!cals.length) return { satisfied: true, unverifiable: true, reason: 'no calendar notes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const texts = after.nodes.filter((n) => (n.text ?? '').trim())
  if (!texts.length) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const problems: string[] = []
  for (const c of cals) {
    const printed = texts.find((n) => { const t = norm(n.text!); return /\bcalendar\b/.test(t) && t.includes(norm(c.title)) })
    if (printed) problems.push(`the note was printed as text (${q(printed.text!.trim().slice(0, 60))}): the heading is just ${q(c.title)}; the rest of the note says how days look`)
    else if (!texts.some((n) => norm(n.text!) === norm(c.title))) problems.push(`no heading ${q(c.title)} on the calendar`)
    // day numbers: leaves whose whole text is one number 1..days
    const byDay = new Map<number, Box[]>()
    for (const n of texts) {
      const t = n.text!.trim(); const b = box(n)
      if (!b || !/^\d{1,2}$/.test(t)) continue
      const d = Number(t); if (d < 1 || d > c.days) continue
      byDay.set(d, [...(byDay.get(d) ?? []), b])
    }
    // the grid: day 2..days must all be there once-ish; take for each day the box nearest the others
    if (byDay.size < c.days) { problems.push(`the ${c.title} grid is not on the page as day numbers (found ${String(byDay.size)} of ${String(c.days)})`); continue }
    const pick = new Map<number, Box>()
    const cx = (b: Box) => b.x + b.w / 2, cy = (b: Box) => b.y + b.h / 2
    // anchor: median centre of days with a single box
    const singles = [...byDay.values()].filter((bs) => bs.length === 1).map((bs) => bs[0]!)
    const mx = singles.map(cx).sort((a, b) => a - b)[Math.floor(singles.length / 2)] ?? 0
    const my = singles.map(cy).sort((a, b) => a - b)[Math.floor(singles.length / 2)] ?? 0
    for (const [d, bs] of byDay) pick.set(d, bs.slice().sort((a, b) => Math.hypot(cx(a) - mx, cy(a) - my) - Math.hypot(cx(b) - mx, cy(b) - my))[0]!)
    // the grid's columns: x centres of the days clustered left to right (a whole month fills all 7)
    const xs = [...pick.values()].map(cx).sort((p, r) => p - r)
    const cols: number[][] = []
    for (const x of xs) { const last = cols[cols.length - 1]; if (last && x - last[last.length - 1]! < 10) last.push(x); else cols.push([x]) }
    if (cols.length !== 7) { problems.push(`the ${c.title} days are not in 7 weekday columns (found ${String(cols.length)}); week starting ${c.weekStart === 'monday' ? 'Monday' : 'Sunday'}`); continue }
    const colOf = (x: number) => cols.findIndex((g) => x >= g[0]! - 0.5 && x <= g[g.length - 1]! + 0.5)
    const off = [...pick].filter(([d, b]) => colOf(cx(b)) !== cellOf(c, d).col).map(([d]) => d).sort((p, r) => p - r)
    if (off.length) {
      const order = c.weekStart === 'monday' ? DAY_NAMES : ['Sunday', ...DAY_NAMES.slice(0, 6)]
      problems.push(`${String(off.length)} day${off.length > 1 ? 's' : ''} of ${c.title} out of their weekday column (e.g. ${off.slice(0, 4).join(', ')}): day 1 is a ${order[c.firstCol]!}, column ${String(c.firstCol + 1)} of a week starting ${c.weekStart === 'monday' ? 'Monday' : 'Sunday'}`)
    }
  }
  return problems.length
    ? { satisfied: false, reason: `${problems.join('; ')}; change nothing else` }
    : { satisfied: true, reason: `${String(cals.length)} calendar${cals.length > 1 ? 's' : ''} built as the month typed, days in their weekday columns` }
}
