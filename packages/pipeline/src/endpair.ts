/**
 * A name and a value typed with a comma on a wide bar, or just above one, go to its two ends (n228).
 *
 * Round 47 (n222). The poll typed "Lisbon, 52%" just above each of four long bars: "Lisbon, 52%" was printed whole,
 * comma included, with the percent straight after the name, and 19 of its 27 fix words went on saying so. The budget
 * typed "On track to save this month, $600" on a long band: centred, in one piece, the comma left in after a fix. The
 * timesheet typed "Total hours, 40 big" on a long band: read as a stat card (number first, label under), and the 40
 * came out taller than the band, in the middle, clipped; one more fix. The same form on a row with a drawn line was
 * already split right: it only failed on boxes.
 *
 * A person who types a name, a comma and a number on a long thin box has said: the name at one end, the number at the
 * other. So:
 * - THE NOTE: a name of 1 to 8 words, a comma, and a value (a number, price, percent or time, an optional short unit),
 *   then any look words ("big", "bold"). A comma inside a number (3,800) is no break. Lists, counts and notes with
 *   more than one value are other readings and stay theirs.
 * - THE BAR: a drawn box at least 240px wide, four times as wide as tall, at most 120px tall, with the note typed on
 *   it or just above it. The widest one wins, so a track beats the fill drawn inside it.
 * - THE PLACE: on the bar, both inside it, name at the left, value at the right; above it, both above it, name starting
 *   at the bar's left, value ending at its right. One line, no comma printed. A big value stays inside its bar.
 * Told to the build and checked on the page. Zero tokens.
 */
import type { Stroke } from '@s2c/ink'
import { countedRow } from './countrow.js'
import { shapeOf } from './shapemark.js'

interface Box { x: number; y: number; w: number; h: number }
interface NoteLike { text: string; at?: { x: number; y: number } }
interface NodeLike { rect: Box; text?: string; textBox?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }

export interface EndPair { name: string; value: string; looks: string[] }
export interface EndPairPlan extends EndPair { note: string; bar: Box; where: 'on' | 'above' }
export interface EndPairVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const BAR_MIN_W = 240
export const BAR_MIN_RATIO = 4
export const BAR_MAX_H = 120
/** A note this far above a bar's top still belongs to it. */
export const ABOVE_PX = 44
export const END_X_TOL = 48

const VALUE = /^[-−+]?[$£€¥]?\d[\d,.:]*(?:%|k|m|\+|°[cf]?)?(?:\s(?:kg|lb|km|mi|min|mins|h|hrs?|hours?|days?|pts|gb|mb|tb))?$/i
const LOOK = /^(big|bigger|huge|giant|large|medium|small|smaller|tiny|bold|bolder|light|grey|gray|muted|dark|white|black|right|far|size)$/i

/** The name and value of a "Name, value" note, or null when the note is anything else. */
export function endPair(note: string): EndPair | null {
  if (/[;\n·•|/:]/.test(note) && !/\d:\d/.test(note)) return null
  if (countedRow(note)) return null
  const parts = note.split(/,\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 3) return null
  const name = parts[0]!
  const nameWords = name.split(/\s+/)
  if (nameWords.length > 8 || !/^\p{Lu}/u.test(name) || /\d/.test(name)) return null
  const ws = parts[1]!.split(/\s+/)
  // the value, then look words: "40 big", "12 hrs bold"
  let cut = ws.length
  while (cut > 0 && LOOK.test(ws[cut - 1]!)) cut--
  const value = ws.slice(0, cut).join(' ')
  if (!VALUE.test(value)) return null
  const looks = ws.slice(cut)
  if (parts[2]) {
    if (!parts[2].split(/\s+/).every((w) => LOOK.test(w))) return null
    looks.push(parts[2])
  }
  return { name, value, looks }
}

/** Every "Name, value" note typed on, or just above, a wide thin drawn box. */
export function endPairs(notes: readonly NoteLike[], strokes: readonly Stroke[]): EndPairPlan[] {
  const bars: Box[] = []
  for (const s of strokes) {
    if (s.points.length < 2) continue
    const sh = shapeOf(s.points)
    if (sh?.shape !== 'box') continue
    const b = sh.box
    if (b.w >= BAR_MIN_W && b.w >= BAR_MIN_RATIO * b.h && b.h <= BAR_MAX_H) bars.push(b)
  }
  const out: EndPairPlan[] = []
  for (const n of notes) {
    const p = endPair(n.text)
    const at = n.at
    if (!p || !at) continue
    const inX = (b: Box) => at.x >= b.x - 6 && at.x <= b.x + b.w + 6
    const on = bars.filter((b) => inX(b) && at.y >= b.y - 6 && at.y <= b.y + b.h + 6)
    const above = bars.filter((b) => inX(b) && at.y < b.y - 6 && at.y >= b.y - ABOVE_PX)
    const where = on.length ? 'on' : 'above'
    const bar = [...(on.length ? on : above)].sort((a, b) => b.w - a.w)[0]
    if (!bar) continue
    out.push({ ...p, note: n.text, bar, where })
  }
  return out
}

/** True when this note is on or just above a wide thin box as a name and value: no stat card, then. */
export const isEndPairNote = (note: string, plans: readonly EndPairPlan[]) => plans.some((p) => p.note === note)

const q = (s: string) => `"${s}"`
const r = Math.round

export function endPairBrief(plans: readonly EndPairPlan[]): string {
  if (!plans.length) return ''
  const lines = plans.slice(0, 10).map((p) => {
    const b = p.bar
    const right = r(b.x + b.w)
    const place = p.where === 'on'
      ? `Both go INSIDE the bar drawn at x ${String(r(b.x))}, y ${String(r(b.y))}, ${String(r(b.w))}x${String(r(b.h))}, vertically centred in it: the name's words start near its left edge, the value's words end near its right edge (padding at most 24px). The value's font-size is at most ${String(Math.max(14, r(b.h * 0.6)))}px, however big it is said to be, so it stays inside the bar.`
      : `Both go on one line just ABOVE the bar drawn at x ${String(r(b.x))}, y ${String(r(b.y))}, ${String(r(b.w))}x${String(r(b.h))}: the name's words start at x ${String(r(b.x))}, the value's words end at x ${String(right)}, and neither overlaps the bar.`
    return `- ${q(p.note)} = name ${q(p.name)} and value ${q(p.value)}. ${place}${p.looks.length ? ` How the value looks: ${p.looks.map(q).join(', ')}.` : ''}`
  })
  return `A NAME AND A VALUE AT THE TWO ENDS OF A BAR (deterministic; checked on the page):\n${lines.join('\n')}\n` +
    `Each is two separate text items in a flex row with justify-content: space-between that is as wide as the bar. Never print the comma or the look words, never centre them together, never run them together, and this is never a stat card: the value is not above or under the name. This overrides any other reading of the note.\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const cy = (b: Box) => b.y + b.h / 2

export function verifyEndPairs(plans: readonly EndPairPlan[] | undefined, after: Snap): EndPairVerdict {
  if (!plans?.length) return { satisfied: true, unverifiable: true, reason: 'no name and value on a bar' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const texts = after.nodes.filter((n) => (n.text ?? '').trim() && n.textBox && n.textBox.w > 0)
  const faults: string[] = []
  for (const p of plans) {
    const b = p.bar
    const dist = (x: Box) => Math.abs(cy(x) - cy(b))
    const nearest = (want: string) => texts.filter((n) => norm(n.text!) === norm(want)).sort((u, v) => dist(u.textBox!) - dist(v.textBox!))[0]?.textBox
    const name = nearest(p.name) ?? nearest(`${p.name},`), value = nearest(p.value)
    const whole = texts.filter((n) => norm(n.text!).includes(norm(p.name)) && norm(n.text!).includes(norm(p.value)) && norm(n.text!).length <= p.note.length + 12).sort((u, v) => dist(u.textBox!) - dist(v.textBox!))[0]
    if (!name || !value) {
      if (whole) faults.push(`${q(whole.text!.trim().slice(0, 50))} runs the name and value together: ${q(p.name)} at the left end of the bar at y ${String(r(b.y))}, ${q(p.value)} at its right end, two text items, no comma`)
      else faults.push(`${q(p.note)}: ${!name ? q(p.name) : q(p.value)} is not on the page as its own text item, at the ${!name ? 'left' : 'right'} end of the bar at y ${String(r(b.y))}`)
      continue
    }
    if (texts.some((n) => norm(n.text!) === `${norm(p.name)},`)) faults.push(`${q(p.name)} prints a comma: the comma is not printed`)
    if (Math.abs(name.x - b.x) > END_X_TOL) faults.push(`${q(p.name)} starts at x ${String(r(name.x))}: it starts at the bar's left end, x ${String(r(b.x))}`)
    const end = value.x + value.w
    if (Math.abs(end - (b.x + b.w)) > END_X_TOL) faults.push(`${q(p.value)} ends at x ${String(r(end))}: it ends at the bar's right end, x ${String(r(b.x + b.w))}`)
    if (Math.abs(cy(name) - cy(value)) > Math.max(10, 0.6 * Math.max(name.h, value.h))) faults.push(`${q(p.name)} and ${q(p.value)} are not on one line`)
    if (p.where === 'on') {
      for (const [t, x] of [[p.name, name], [p.value, value]] as const) {
        if (x.y < b.y - 3 || x.y + x.h > b.y + b.h + 3) faults.push(`${q(t)} spills out of its bar (y ${String(r(b.y))} to ${String(r(b.y + b.h))}): smaller, inside it`)
      }
    } else if (name.y + name.h > b.y + 6 || value.y + value.h > b.y + 6 || name.y < b.y - 72) {
      faults.push(`${q(p.name)} and ${q(p.value)} go on one line just above the bar at y ${String(r(b.y))}`)
    }
  }
  return faults.length
    ? { satisfied: false, reason: `${faults.slice(0, 8).join('; ')}; change nothing else` }
    : { satisfied: true, reason: `${String(plans.length)} name and value pair${plans.length > 1 ? 's' : ''} at the two ends of their bars` }
}
