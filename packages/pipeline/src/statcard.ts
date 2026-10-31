/**
 * A box with a big number and its label is a stat card (n82).
 *
 * Round 35 e2 (library loans, n77): three boxes drawn in a row, each typed "6 big, on loan grey",
 * "2 big, due this week grey", "1 big, overdue grey". The word "big" plus a number made each box an AREA
 * (n14: a box round a big word only marks where the word sits, no card), so the build dropped the boxes and
 * left three loose numbers; n77 needed a fix note ("each stat a white bordered card, number medium not huge").
 * Round 35 e3 (workout log, n77): two boxes typed "Total lifted, grey" + "12480 kg, huge bold white" and
 * "Streak, grey" + "9 days, huge bold white": same thing, boxes dropped, numbers huge and centred; a fix note
 * again ("two dark grey cards, numbers big but fit inside, left aligned").
 *
 * A person who types a number and a few words for it in a box means a stat card, the most common block on an
 * app dashboard. Here: a box whose notes give a number (with an optional short unit: 12480 kg, 9 days, 62%)
 * AND label words (in the same note, or in another note on the same box) is a stat card, never an area: the box
 * is kept as a card at the drawn edges, the number big and bold at its left, the label smaller under (or over,
 * when typed above) it. A box whose only words are the big number and look words ("huge outlined 09, white")
 * stays an area. Told to the build and checked on the page. Zero tokens.
 */
import { commaItems } from './rowwords.js'
import type { ShapeMark } from './shapemark.js'
import type { BBox } from '@s2c/ink'
import { progressOf } from './progress.js'
import { buttonLabel } from './buttonlabel.js'

/** Words that only say how text looks; they are never copy. */
const LOOK = /^(big|bigger|huge|giant|large|massive|jumbo|display|small|smaller|tiny|little|medium|grey|gray|light|dark|bold|bolder|regular|italic|caps|uppercase|lowercase|spaced|muted|faint|thin|thick|normal|size|text|and|centred|centered|left|right|aligned|underlined|outlined|serif|sans|mono|white|black|red|orange|yellow|lime|green|teal|cyan|blue|navy|indigo|purple|violet|pink|magenta|brown|beige|cream|gold|silver|pale|bright|deep|soft|number|numeral|digits?|label|value|stat|figure|in|on|the|a)$/i
// copy words a label keeps even though LOOK lists them ("on loan", "in stock"): only dropped when alone
const KEEP_SMALL = /^(on|in|the|a|and)$/i
const NUM = /(?<![\w.])[$£€]?\d+(?:[.,:]\d+)*%?(?![\w])/
const UNIT = /^(kg|g|lb|lbs|km|mi|m|min|mins|h|hrs?|hours?|days?|weeks?|months?|years?|steps|kcal|cal|gb|mb|tb|pts|points|items|users|people|%|x)$/i
const ROWS = /\b(\d+|two|three|four|five|six)\s+(rows|lines|items|entries)\b|\brows?\s*:|\brows like this\b|\bx\d+\b|\s\/\s/i

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?\s+$/i

export interface Stat { value: string; label: string; labelAbove?: boolean }

const wordsOf = (s: string) => s.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}$£€%]+|[^\p{L}\p{N}%]+$/gu, '')).filter(Boolean)
/** Copy words of a phrase: look words dropped, but small joining words kept between copy words. */
function copyWords(part: string): string[] {
  const ws = wordsOf(part)
  // n90: left/right are look words only next to 'aligned' ("Budget left" is copy)
  const keep = ws.map((w, i) => !LOOK.test(w) || KEEP_SMALL.test(w) || (/^(left|right)$/i.test(w) && !/^align/i.test(ws[i + 1] ?? '') && !/^align/i.test(ws[i - 1] ?? '')))
  // a joining word counts only when a real copy word follows it in the same phrase
  const out: string[] = []
  ws.forEach((w, i) => {
    if (!keep[i]) return
    if (KEEP_SMALL.test(w) && !ws.slice(i + 1).some((v, j) => keep[i + 1 + j] && !KEEP_SMALL.test(v))) return
    out.push(w)
  })
  return out
}

/** The number (and short unit) in a phrase, and the copy words left over. */
function valueIn(part: string): { value: string; rest: string[] } | null {
  const m = part.match(NUM)
  if (!m) return null
  const tail = part.slice(m.index! + m[0].length)
  const first = wordsOf(tail)[0]
  const unit = first && UNIT.test(first) ? first : null
  // n90: a day after a month name is a date value ("Biggest day Oct 3" -> "Oct 3"), not a bare 3
  const head = part.slice(0, m.index!)
  const mon = /^\d{1,2}$/.test(m[0]) ? head.match(MONTH) : null
  const lead = mon ? `${mon[1]!} ` : ''
  const value = lead + (unit ? `${m[0]} ${unit}` : m[0])
  const rest = copyWords((mon ? head.slice(0, mon.index!) : head) + ' ' + (unit ? tail.replace(unit, '') : tail))
  return { value, rest }
}

// n100: a time of day (9:00, 2:14 pm, 10 AM) or a range of numbers (9:00 – 9:45, 12–14) is never a stat value
const TIME = /(?<![\w.])\d{1,2}:\d{2}(?!\d)|(?<![\w.])\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)(?![\w])/i
const RANGE = /\d\s*[–—-]\s*\d/
const SENTENCE = /[\p{L}\d][.!?](?:\s+[\p{Lu}\p{N}]|\s*$)/u
const hasLetters = (w: string) => /^\p{L}/u.test(w)

/**
 * n100: a note whose number sits among words is copy, not a stat (round 37: a calendar event "Standup 9:00 – 9:45"
 * was built as a huge "9:00" over "Standup 9:45"; chat bubbles "Mia · 2:14 pm above; Copy is final. Can someone
 * check..." became a big "2:14 pm" with the message dropped, and "Great. Shipping at 5 then." a big "5"). True when
 * the note holds a time of day or a range, a sentence (sentence punctuation or more than six copy words in one
 * phrase), or a number with copy words on both sides in the same phrase ("Shipping at 5 then").
 * A note that says it is a stat ("stat", "big number", "huge 9:00") is kept as one.
 */
export function proseNumber(note: string): boolean {
  if (!NUM.test(note)) return false
  if (/\b(stat|stats|kpi|metric)\b/i.test(note) || /\b(big|huge|giant|large|massive|jumbo|bold)\s+(number|numeral|value|figure|digits?|[$£€]?\d)/i.test(note)) return false
  if (TIME.test(note) || RANGE.test(note)) return true
  const parts = note.split(/[;·•|]|,(?!\d{3}(?!\d))/).map((p) => p.trim()).filter(Boolean)
  for (const p of parts) {
    if (SENTENCE.test(p) && copyWords(p).filter(hasLetters).length >= 3) return true
    if (copyWords(p).filter(hasLetters).length > 6) return true
    const m = p.match(NUM)
    if (!m) continue
    const before = copyWords(p.slice(0, m.index!)).filter(hasLetters)
    const afterWs = copyWords(p.slice(m.index! + m[0].length)).filter(hasLetters)
    const after = afterWs.length && UNIT.test(afterWs[0]!) ? afterWs.slice(1) : afterWs
    if (before.length && after.length) return true
  }
  return false
}

/**
 * The stat a box's notes give: a number and its label. Null unless both are there.
 * `notes` in the order they sit on the box (top first), so a label typed above the number reads as above.
 */
export function statOf(notes: readonly string[]): Stat | null {
  // n92: a box holding a progress bar note is a bar panel, not a stat card ("82%" is how full the bar is)
  if (!notes.length || notes.some((n) => ROWS.test(n) || !!progressOf(n))) return null
  // n100: a box whose notes are copy with a number in it is that copy, never a stat card (see proseNumber)
  if (notes.some(proseNumber)) return null
  // n111: a button label with a number in it ("Reserve · 4 nights") is the button's copy, never a stat
  if (notes.some((n) => !!buttonLabel(n))) return null
  // n130: a comma list of items of one form ("Mon 14, Tue 15, Wed 16") is a row's items, never a value and its label
  if (notes.some((n) => !!commaItems(n))) return null
  let value: string | null = null, label: string[] = [], vi = -1, li = -1
  notes.forEach((n, i) => {
    // n90: a comma inside a number (3,800) is no break
    const parts = n.split(/[;·•|]|,(?!\d{3}(?!\d))/).map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      const v = value === null ? valueIn(p) : null
      if (v) {
        value = v.value; vi = i
        if (v.rest.length && !label.length) { label = v.rest; li = i }
        continue
      }
      const cw = copyWords(p)
      if (cw.length && !label.length && !NUM.test(p)) { label = cw; li = i }
    }
  })
  if (value === null || !label.length) return null
  const text = label.join(' ')
  if (text.length > 40 || label.length > 6) return null
  return { value, label: text, ...(li < vi ? { labelAbove: true } : {}) }
}

const inside = (o: BBox, b: BBox) => o.x >= b.x - 4 && o.y >= b.y - 4 && o.x + o.w <= b.x + b.w + 4 && o.y + o.h <= b.y + b.h + 4 &&
  !(Math.abs(o.x - b.x) <= 4 && Math.abs(o.y - b.y) <= 4 && Math.abs(o.w - b.w) <= 8 && Math.abs(o.h - b.h) <= 8)

interface NoteLike { text: string; focus?: string[]; at?: { x: number; y: number } }

/** A small box at most this big can be a stat card (a big box round a page is a container, n54). */
export const STAT_MAX = { w: 640, h: 320 }

/**
 * n90: a look note on the cards says where the label goes ("small grey label, big number under", "label on top",
 * "number below the label"): true = label above, false = label under, null = not said. Round 36 transactions typed
 * "Income 3,800" per card plus that look note; the build put every number above its label.
 */
export function statOrder(notes: readonly string[]): boolean | null {
  const NUMW = '(?:big\\s+|large\\s+|huge\\s+|bold\\s+)*(?:numbers?|values?|figures?|amounts?|digits?|stats?)'
  const LAB = '(?:small\\s+|grey\\s+|gray\\s+|muted\\s+)*labels?'
  for (const n of notes) {
    const t = n.toLowerCase()
    if (new RegExp(`\\b${NUMW}\\s+(?:under|below|beneath|underneath)\\b`).test(t) || new RegExp(`\\b${LAB}\\s+(?:above|over|on\\s+top|first)\\b`).test(t) ||
      new RegExp(`\\b${LAB}\\s*,\\s*${NUMW}\\s+(?:under|below)\\b`).test(t)) return true
    if (new RegExp(`\\b${LAB}\\s+(?:under|below|beneath|underneath)\\b`).test(t) || new RegExp(`\\b${NUMW}\\s+(?:above|over|on\\s+top|first)\\b`).test(t)) return false
  }
  return null
}

/** Flag the stat-card boxes among an action's marks, in place: `stat` set and `card` kept. */
export function markStats(marks: ShapeMark[], notes: NoteLike[], inner: BBox[] = [], pageNotes: readonly string[] = []): void {
  // n90: a look note on the cards binds to one or two of them; where the label goes is said once for all of them
  const said0 = statOrder(notes.map((n) => n.text))
  const order = said0 ?? statOrder(pageNotes)
  const boxes = marks.filter((m) => m.shape === 'box' && !m.tilt && !m.glyph)
  for (const m of boxes) {
    if (m.box.w > STAT_MAX.w || m.box.h > STAT_MAX.h || m.box.w < 80 || m.box.h < 40) continue
    if (inner.filter((o) => inside(o, m.box)).length >= 2) continue // drawn parts inside: their own notes say what they are
    const own = notes.filter((n) => n.focus?.includes(m.strokeId))
    const said = own.length ? own : boxes.length === 1 ? notes.filter((n) => !n.focus?.length) : []
    const s = statOf([...said].sort((a, b) => (a.at?.y ?? 0) - (b.at?.y ?? 0)).map((n) => n.text))
    if (!s) continue
    m.stat = order === null ? s : order ? { ...s, labelAbove: true } : { value: s.value, label: s.label }
    delete m.area; delete m.areaOf; delete m.word; delete m.outlined
    if (!m.card) m.card = { fill: null }
  }
}

const q = (s: string) => `"${s}"`

/** The stat-card clause for a card box's brief line ('' when it is no stat). */
export function statClause(m: ShapeMark): string {
  if (!m.stat) return ''
  const b = m.box, s = m.stat
  const px = Math.max(28, Math.min(56, Math.round(b.h * 0.36)))
  return ` It is a STAT CARD: the value ${q(s.value)} big and bold (about ${px}px, it must fit inside the card, never overflow), LEFT-aligned ` +
    `with its first character near x ${b.x + 24}, and the label ${q(s.label)} smaller (14-16px, a muted grey that reads on the card) ` +
    `${s.labelAbove ? 'just ABOVE the value' : 'just UNDER the value'}, also left-aligned at the same x; padding about 20-24px; nothing else in it ` +
    `(no icon, no caption, no trend, no centring). Look words typed in its notes (big, grey, bold) only style these two; never print them. ` +
    `With no colour tapped or typed for it, the card is a step off the page behind it: white with a light border on a light page, ` +
    `a dark grey (a few shades lighter than the page) on a dark page.`
}

interface NodeLike { id: string; tag?: string; rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface StatVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’!?:;]/g, '').replace(/\s+/g, ' ').trim()

/** The smallest text leaf holding `t`, near the box. */
function leaf(t: string, b: BBox, after: Snap): NodeLike | null {
  const want = norm(t)
  const near = after.nodes.filter((n) => n.textBox && n.textBox.w > 0 && norm(n.text ?? '').includes(want) &&
    n.textBox.x + n.textBox.w > b.x - 60 && n.textBox.x < b.x + b.w + 60 && n.textBox.y + n.textBox.h > b.y - 60 && n.textBox.y < b.y + b.h + 60)
  return near.sort((a, c) => (a.text ?? '').length - (c.text ?? '').length || a.textBox!.w - c.textBox!.w)[0] ?? null
}

/** The value sits inside the card at its left, the label inside it on the side it was typed. */
export function verifyStats(marks: readonly ShapeMark[], after: Snap): StatVerdict {
  const stats = marks.filter((m) => m.stat)
  if (!stats.length) return { satisfied: true, unverifiable: true, reason: 'no stat cards' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const m of stats) {
    const b = m.box, s = m.stat!
    const where = `the stat card drawn at (${b.x},${b.y}) ${b.w}x${b.h}`
    const v = leaf(s.value, b, after)
    if (!v) { faults.push(`${where}: its value ${q(s.value)} is not on the page near it; put it inside the card, big, bold, at its left`); judged++; continue }
    judged++
    const tb = v.textBox!
    const out = tb.x < b.x - 6 || tb.y < b.y - 6 || tb.x + tb.w > b.x + b.w + 6 || tb.y + tb.h > b.y + b.h + 6
    if (out) faults.push(`${where}: its value ${q(s.value)} spans (${Math.round(tb.x)},${Math.round(tb.y)}) ${Math.round(tb.w)}x${Math.round(tb.h)}, outside the card: make it fit inside (smaller font, padding 20-24px)`)
    else if (tb.x > b.x + b.w * 0.4) faults.push(`${where}: its value ${q(s.value)} starts at x ${Math.round(tb.x)}, not at the card's left: left-align it, first character near x ${b.x + 24} (no centring)`)
    const l = leaf(s.label, b, after)
    if (!l) continue
    const lb = l.textBox!
    const lout = lb.x < b.x - 6 || lb.y < b.y - 6 || lb.x + lb.w > b.x + b.w + 6 || lb.y + lb.h > b.y + b.h + 6
    if (lout) faults.push(`${where}: its label ${q(s.label)} sits outside the card: put it inside, ${s.labelAbove ? 'above' : 'under'} the value, left-aligned`)
    else if (!s.labelAbove && lb.y + lb.h / 2 < tb.y + tb.h / 2) faults.push(`${where}: its label ${q(s.label)} is above the value: put it under the value, left-aligned`)
    else if (s.labelAbove && lb.y + lb.h / 2 > tb.y + tb.h / 2) faults.push(`${where}: its label ${q(s.label)} is under the value: put it above the value (it was typed above), left-aligned`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no stat value found' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${String(judged)} stat card${judged > 1 ? 's' : ''} with the value at the left and the label in place` }
}
