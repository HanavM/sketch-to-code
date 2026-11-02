/**
 * A count with its items typed after it is those items, one per drawn line (n214).
 *
 * Round 46 e5 loan calculator (n211): four grey lines drawn, the first with a green part and a ring on it, and on
 * the first the note "x4 down: Loan amount $24,000 half; Term 60 months 70%; Interest rate 6.4% 30%; Down payment
 * $4,000 20%; values bold right". The "x4" was read as "this row and three SAMPLE rows", so the build printed
 * "down: Loan amount $24,000 half" as one label, made up Vehicle price, Monthly budget and Trade-in rows with invented
 * figures, ignored the three other lines and stacked the rows 90px apart instead of 120. Likeness 55.9.
 *
 * A person who types a count and then lists that many things has said what the things are:
 * - ITEMS: a lead with a count and a colon ("x4 down:", "4 sliders:"), then exactly that many items split by ';' (or
 *   by ', ' when no ';' is typed). A lower-case segment says how every row looks ("values bold right").
 * - An item is a label, its value ("$24,000", "60 months", "6.4%") and, when a value is there, how far along it is
 *   ("half", "70%"): the share is never printed, and neither are the count or the lead's words.
 * - LINES: when the note sits on or just above a drawn straight line, that line and the like lines under it are the
 *   rows' lines, at their drawn pitch. A shorter line drawn over the first and a small ring at its end are that
 *   row's filled part and knob: every row has them, ending at its own share. One line drawn alone repeats down.
 * Told to the build, and checked on the page: the items at their lines, nothing invented between them. Zero tokens.
 */
import type { Stroke } from '@s2c/ink'
import { shapeOf } from './shapemark.js'

export interface ListedItem { label: string; value?: string; share?: number }
export interface CountedItems { n: number; items: ListedItem[]; looks: string[] }
interface Box { x: number; y: number; w: number; h: number }
interface NoteLike { text: string; at?: { x: number; y: number } }
interface NodeLike { id?: string; tag?: string; rect: Box; text?: string; textBox?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface DrawnListVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface DrawnList extends CountedItems {
  note: string
  x: number
  w: number
  /** One y per item: the drawn lines, then more at the drawn pitch. */
  ys: number[]
  drawn: number
  /** Where the words sit relative to their line (negative: above). */
  textDy: number
  valueRight: boolean
  track?: string
  fill?: { colour?: string; share: number }
  knob?: { d: number; colour?: string }
}

const WORDN: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const LEAD_X = /^\s*(?:x|×)\s?(\d{1,2})\b[^:;]{0,28}:\s*(.+)$/is
const LEAD_N = /^\s*(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+[a-z][a-z -]{0,28}:\s*(.+)$/is
const SHARE_WORDS: Record<string, number> = { half: 0.5, third: 1 / 3, 'a third': 1 / 3, 'two thirds': 2 / 3, quarter: 0.25, 'a quarter': 0.25, 'three quarters': 0.75, full: 1, empty: 0 }
const SHARE = /\s+(half|a third|third|two thirds|a quarter|quarter|three quarters|full|empty|\d{1,3}%)$/i
// the value at an item's end: "$24,000", "6.4%", "60 months", "4 nights"
const VALUE = /^(.*?\p{L}[^\d$£€¥]*?)\s+([$£€¥]?\d[\d.,]*(?:%|\s?[a-z]{1,10})?)$/iu

/** One typed item: its label, value and share. The share comes off only when a value is left to show. */
function parseItem(raw: string): ListedItem {
  let s = raw.trim()
  let share: number | undefined
  const m = SHARE.exec(s)
  if (m && /\d/.test(s.slice(0, m.index))) {
    const w = m[1]!.toLowerCase()
    share = w.endsWith('%') ? Number(w.slice(0, -1)) / 100 : SHARE_WORDS[w]
    s = s.slice(0, m.index).trim()
  }
  const v = VALUE.exec(s)
  return { label: (v ? v[1]! : s).trim(), ...(v ? { value: v[2]!.trim() } : {}), ...(share != null && share <= 1 ? { share } : {}) }
}

/** The items a count lists, or null when the note does not list exactly that many. */
export function countedItems(note: string): CountedItems | null {
  const m = LEAD_X.exec(note) ?? LEAD_N.exec(note)
  if (!m) return null
  const n = /^\d/.test(m[1]!) ? Number(m[1]) : WORDN[m[1]!.toLowerCase()] ?? 0
  if (n < 2 || n > 12) return null
  const body = m[2]!.trim()
  let segs = body.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean)
  if (segs.length < n) {
    // no semicolons: a comma list, with any look after a further ';' kept apart
    const [first, ...rest] = segs
    segs = [...(first ?? '').split(/\s*,\s+/).map((s) => s.trim()).filter(Boolean), ...rest]
  }
  const isItem = (s: string) => /^[\p{Lu}\p{N}$£€¥#"'“]/u.test(s)
  const items = segs.filter(isItem)
  if (items.length !== n) return null
  return { n, items: items.map(parseItem), looks: segs.filter((s) => !isItem(s)) }
}

const r = Math.round
const q = (s: string) => `"${s}"`
const pretty = (c?: string) => (c ? ` in ${c}` : '')

/** Every counted note that sits on or just above a drawn line, with the lines its items go on. */
export function drawnLists(notes: readonly NoteLike[], strokes: readonly Stroke[], vp: { w: number; h: number }): DrawnList[] {
  const marks = strokes.filter((s) => s.points.length > 1).map((s) => {
    const sh = shapeOf(s.points)
    const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y)
    const box = sh?.box ?? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    return { shape: sh?.shape ?? null, box, color: s.color }
  })
  const flat = marks.filter((m) => m.box.w >= 60 && m.box.h <= 10)
  const out: DrawnList[] = []
  for (const note of notes) {
    const c = countedItems(note.text)
    const at = note.at
    if (!c || !at) continue
    // the longest flat line on each level (a shorter one over it is its filled part)
    const levels: typeof flat = []
    for (const m of [...flat].sort((a, b) => a.box.y - b.box.y || b.box.w - a.box.w)) {
      const same = levels.find((l) => Math.abs(l.box.y - m.box.y) <= 6)
      if (!same) levels.push(m)
      else if (m.box.w > same.box.w) levels[levels.indexOf(same)] = m
    }
    const home = levels.filter((l) => at.x >= l.box.x - 24 && at.x <= l.box.x + l.box.w && at.y <= l.box.y + 12 && at.y >= l.box.y - 80)
      .sort((a, b) => a.box.y - b.box.y)[0]
    if (!home || home.box.w >= vp.w * 0.9) continue
    const H = home.box
    const like = levels.filter((l) => l.box.y >= H.y - 1 && Math.abs(l.box.x - H.x) <= 24 && Math.abs(l.box.w - H.w) <= H.w * 0.2).slice(0, c.n)
    const ysDrawn = like.map((l) => r(l.box.y))
    // the first row's filled part and knob, when drawn
    const over = marks.find((m) => m !== home && m.box.h <= 10 && Math.abs(m.box.y - H.y) <= 6 && Math.abs(m.box.x - H.x) <= 12 && m.box.w < H.w * 0.95 && m.box.w >= 8 && m.color !== home.color)
    const knob = marks.find((m) => (m.shape === 'ellipse' || m.shape === 'box') && m.box.w >= 8 && m.box.w <= 44 && Math.abs(m.box.h - m.box.w) <= m.box.w * 0.4 &&
      Math.abs(m.box.y + m.box.h / 2 - H.y) <= 10 && m.box.x + m.box.w / 2 >= H.x && m.box.x + m.box.w / 2 <= H.x + H.w)
    // a lone plain line may just be a word's line in a drawn row: that is the row template's
    if (ysDrawn.length < 2 && !over && !knob) continue
    // copies past the last drawn line: the drawn pitch, else what fits above the next mark below
    let pitch = ysDrawn.length >= 2 ? (ysDrawn[ysDrawn.length - 1]! - ysDrawn[0]!) / (ysDrawn.length - 1) : 0
    if (!pitch) {
      const below = marks.filter((m) => m.box.y > H.y + 14 && Math.min(m.box.x + m.box.w, H.x + H.w) - Math.max(m.box.x, H.x) > 0).map((m) => m.box.y).sort((a, b) => a - b)[0]
      pitch = Math.max(40, Math.min(96, ((below ?? vp.h) - H.y) / c.n))
    }
    const ys = Array.from({ length: c.n }, (_, k) => ysDrawn[k] ?? r(ysDrawn[ysDrawn.length - 1]! + (k - ysDrawn.length + 1) * pitch))
    const looks = c.looks.join('; ')
    const dy = at.y < H.y - 8 ? Math.max(-60, r(at.y - H.y)) : -22
    const share0 = over ? over.box.w / H.w : knob ? (knob.box.x + knob.box.w / 2 - H.x) / H.w : null
    out.push({
      ...c, note: note.text, x: r(H.x), w: r(H.w), ys, drawn: ysDrawn.length, textDy: dy,
      valueRight: /\bright\b/i.test(looks) || (!!(over ?? knob) && c.items.some((i) => i.value)),
      ...(home.color ? { track: home.color } : {}),
      ...(share0 != null ? { fill: { ...(over?.color ?? knob?.color ? { colour: (over?.color ?? knob?.color)! } : {}), share: Math.round(share0 * 100) / 100 } } : {}),
      ...(knob ? { knob: { d: r(knob.box.w), ...(knob.color ? { colour: knob.color } : {}) } } : {}),
    })
  }
  return out
}

const shareOf = (l: DrawnList, k: number) => l.items[k]!.share ?? l.fill?.share ?? 0

export function drawnListBrief(lists: readonly DrawnList[]): string {
  if (!lists.length) return ''
  const lines = lists.map((l) => {
    const rows = l.items.map((it, k) => {
      const end = l.fill ? `; filled part x ${String(l.x)} to ${String(r(l.x + shareOf(l, k) * l.w))}` : ''
      return `row ${String(k + 1)}: line at y ${String(l.ys[k])}, words ${q(it.label)}${it.value ? ` and ${q(it.value)}` : ''} at about y ${String(l.ys[k]! + l.textDy)}${end}`
    }).join('; ')
    const parts = (l.fill ? `Each line is a thin track${pretty(l.track)} from x ${String(l.x)} to ${String(l.x + l.w)}, with a filled part${pretty(l.fill.colour)} over it from its left` +
      `${l.knob ? ` and a ${String(l.knob.d)}px ring knob${pretty(l.knob.colour)} centred at the filled part's end` : ''}: all plain elements with these exact spans, never a native range input. `
      : `Each line stays where it was drawn, from x ${String(l.x)} to ${String(l.x + l.w)}${pretty(l.track)}. `)
    return `- ${q(l.note.slice(0, 120))} lists its ${String(l.n)} rows, typed by the person: ${rows}. ` + parts +
      `Each label starts at x ${String(l.x)}` + (l.valueRight ? `; each value ENDS at x ${String(l.x + l.w)} (right aligned, on the label's level)` : '') + '. ' +
      (l.looks.length ? `Every row looks: ${l.looks.map(q).join(', ')}. ` : '') +
      (l.drawn < l.n ? `${String(l.n - l.drawn)} of these rows have no line drawn: add them at the pitch given. ` : '')
  })
  return `LISTED ROWS ON DRAWN LINES (a count with its items typed after it; deterministic; checked on the page):\n${lines.join('\n')}\n` +
    `These rows are exactly what was typed: never add a row or make up a label or figure, and never print the count, the words before the colon, or a share such as "half" or "70%". ` +
    `This overrides any other reading of the note.\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export const DRAWN_LIST_TOL_PX = 26

export function verifyDrawnLists(lists: readonly DrawnList[] | undefined, after: Snap): DrawnListVerdict {
  if (!lists?.length) return { satisfied: true, unverifiable: true, reason: 'no listed rows on drawn lines' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  const texts = after.nodes.filter((n) => (n.text ?? '').trim() && n.textBox && n.textBox.w > 0)
  for (const l of lists) {
    const known = new Set(l.items.flatMap((i) => [norm(i.label), ...(i.value ? [norm(i.value)] : [])]))
    l.items.forEach((it, k) => {
      const wantY = l.ys[k]! + l.textDy
      const lab = texts.filter((n) => norm(n.text!).includes(norm(it.label)))
        .sort((a, b) => Math.abs(a.textBox!.y + a.textBox!.h / 2 - wantY) - Math.abs(b.textBox!.y + b.textBox!.h / 2 - wantY))[0]
      if (!lab) { faults.push(`row ${String(k + 1)}'s words ${q(it.label)} are not on the page`); return }
      const b = lab.textBox!
      const cy = b.y + b.h / 2
      if (Math.abs(cy - wantY) > DRAWN_LIST_TOL_PX) faults.push(`${q(it.label)} sits at y ${String(r(cy))}; its line is at y ${String(l.ys[k])}, so its words go at about y ${String(wantY)}`)
      if (it.value) {
        const val = texts.filter((n) => norm(n.text!).includes(norm(it.value!)) && Math.abs(n.textBox!.y + n.textBox!.h / 2 - wantY) <= 40 && n.textBox!.x + n.textBox!.w <= l.x + l.w + 60)[0]
        if (!val) faults.push(`row ${String(k + 1)}'s value ${q(it.value)} is not beside ${q(it.label)}`)
        else if (l.valueRight && Math.abs(val.textBox!.x + val.textBox!.w - (l.x + l.w)) > 30) faults.push(`${q(it.value)} ends at x ${String(r(val.textBox!.x + val.textBox!.w))}; it ends at x ${String(l.x + l.w)}, the line's right end`)
      }
      if (l.fill) {
        const y = l.ys[k]!
        const near = after.nodes.filter((n) => n.rect.h > 0 && n.rect.h <= 16 && Math.abs(n.rect.y + n.rect.h / 2 - y) <= 14 && Math.abs(n.rect.x - l.x) <= 16)
        if (near.some((n) => n.tag === 'input')) return
        if (!near.some((n) => Math.abs(n.rect.w - l.w) <= l.w * 0.12)) faults.push(`line ${String(k + 1)} is missing at y ${String(y)}: a thin track from x ${String(l.x)} to ${String(l.x + l.w)}`)
        const wantW = shareOf(l, k) * l.w
        if (wantW > 12 && !near.some((n) => Math.abs(n.rect.w - wantW) <= l.w * 0.08)) faults.push(`line ${String(k + 1)}'s filled part should run x ${String(l.x)} to ${String(r(l.x + wantW))}`)
      }
    })
    // nothing invented in the band the rows take, and no count words printed
    const top = l.ys[0]! + l.textDy - 16, bot = l.ys[l.ys.length - 1]! + 16
    for (const n of texts) {
      const b = n.textBox!
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      if (cy < top || cy > bot || cx < l.x - 10 || cx > l.x + l.w + 10) continue
      const t = norm(n.text!)
      if ([...known].some((w) => w && (t === w || t.includes(w) && t.length <= w.length + 20))) {
        if (/^(x|×)\d|^down\b|:\s/.test(t) && !known.has(t)) faults.push(`${q(n.text!.trim())} prints the count's words: print ${q(l.items[0]!.label)} only`)
        continue
      }
      faults.push(`${q(n.text!.trim().slice(0, 40))} is not one of the typed rows: take it out`)
    }
  }
  return faults.length
    ? { satisfied: false, reason: `${faults.slice(0, 8).join('; ')}; change nothing else` }
    : { satisfied: true, reason: `${lists.map((l) => `${String(l.n)} typed rows`).join(', ')} on their drawn lines, nothing invented` }
}
