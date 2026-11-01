/**
 * A count on a drawn mark repeats that mark beside it (n201).
 *
 * Round 45 e3 audio mixer (n198): the person drew ONE channel strip (a tall box with a ring, a fader line and a
 * knob box inside) and typed on it "6 strips: Drums, Bass, Keys, Guitar, Vocals, FX; knobs at different heights".
 * The build kept the drawn strip as Drums and crammed five tiny strips inside its foot, leaving the open space to
 * its right empty; a fix note ("6 same-size strips side by side from the left edge to here") laid them out but not
 * at the drawn size. A person who draws one thing and types a count of it means: that many of THIS, side by side,
 * where there is room. So here:
 * - a note bound to (or typed inside) a drawn box that asks for N of something ("6 strips: ...", "4 cards like
 *   this", "x5") makes the box the FIRST of N;
 * - the copies go at the drawn size, the drawn gap, into the open space beside it (to the right when it fits up to
 *   the next drawn mark or the page edge, else below), each copy a sibling with the same drawn insides at the same
 *   offsets, the k-th typed name on the k-th copy;
 * - checked on the page: N look-alike boxes of about the drawn size along the row, none shrunk inside the first.
 * A box with a drawn row inside it ("5 rows like this" on a list panel) is the row template's (rowtemplate.ts),
 * not this. Zero tokens.
 */
import type { Stroke } from '@s2c/ink'
import { shapeOf } from './shapemark.js'

interface Box { x: number; y: number; w: number; h: number }
interface NoteLike { text: string; at?: { x: number; y: number }; anchor?: { kind: string; strokeIds?: string[]; focus?: string[] } }
interface NodeLike { id: string; parent?: string | null; rect: Box; text?: string; style?: { backgroundColor?: string; border?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }

export interface RepeatPlan {
  note: string
  n: number
  /** What the copies are called ("strips"), when typed. */
  noun: string | null
  /** One name per copy, in order, when the note lists exactly that many. */
  names: string[]
  /** The drawn first copy. */
  mark: Box
  axis: 'x' | 'y'
  /** Space between copies, px. */
  gap: number
  /** The drawn marks inside the first copy, as offsets from its top-left. */
  insides: Array<{ kind: 'ring' | 'box' | 'line' | 'mark'; dx: number; dy: number; w: number; h: number }>
}

const NUMW = '(\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'
const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const num = (s: string) => (/^\d/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? 0)
// plurals that are not drawn things, or that are parts of one thing (rows of a list are the row template's)
const NOT = /^(px|pixels|pts|points|percent|times|minutes|seconds|hours|days|weeks|months|years|words|letters|strokes|colou?rs|shades|rows|lines|items|entries|columns|cols|stars|dots|bars|seats|digits|numbers|steps|tabs)$/
const COUNT = new RegExp(`(?:^|[^\\w$#.,:/-])${NUMW}\\s+(?:(?:same[- ]size|equal|identical|more)\\s+)?([a-z]{3,}s)\\b(\\s*(?::|like\\s+(?:this|that|it)))?`, 'i')
const LIKE = new RegExp(`(?:^|[^\\w$#.,:/-])${NUMW}\\s+(?:more\\s+)?like\\s+(?:this|that|it)\\b`, 'i')
const TIMES = /(?:^|[\s,;(])(?:x|×)\s?(\d{1,2})\b/i

/** How many of the mark a note asks for, its noun and its names; null when it asks for none. */
export function repeatCount(note: string): { n: number; noun: string | null; names: string[] } | null {
  let n = 0, noun: string | null = null, tail = ''
  const c = note.match(COUNT)
  if (c && !NOT.test(c[2]!.toLowerCase())) {
    // a bare plural count ("3 colours") is not a repeat; it needs a list (colon) or "like this" after it
    if (!c[3]) return null
    n = num(c[1]!); noun = c[2]!.toLowerCase(); tail = note.slice((c.index ?? 0) + c[0].length)
  } else {
    const l = note.match(LIKE) ?? note.match(TIMES)
    if (!l) return null
    n = num(l[1]!); tail = note.slice((l.index ?? 0) + l[0].length)
  }
  if (n < 2 || n > 12) return null
  // the names: the comma list right after a colon, up to a ';' or '.', when it has exactly n entries
  const list = /^\s*:?\s*([^;.]+)/.exec(tail)?.[1] ?? ''
  const names = list.split(/\s*,\s*/).map((s) => s.trim()).filter((s) => s && s.split(/\s+/).length <= 3)
  return { n, noun, names: names.length === n ? names : [] }
}

const bboxOf = (pts: ReadonlyArray<{ x: number; y: number }>): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
const r = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })
const within = (b: Box, c: Box, pad = 6) => b.x >= c.x - pad && b.y >= c.y - pad && b.x + b.w <= c.x + c.w + pad && b.y + b.h <= c.y + c.h + pad
const contains = (c: Box, p: { x: number; y: number }, pad = 10) => p.x >= c.x - pad && p.x <= c.x + c.w + pad && p.y >= c.y - pad && p.y <= c.y + c.h + pad

/** Every note that asks for N of the drawn box it sits on, with room beside the box for the copies. */
export function repeatPlans(notes: readonly NoteLike[], strokes: readonly Stroke[], vp: { w: number; h: number }): RepeatPlan[] {
  const marks = strokes.filter((s) => s.points.length > 1).map((s) => {
    const sh = shapeOf(s.points)
    return { id: s.id, box: sh?.box ? r(sh.box) : r(bboxOf(s.points)), shape: sh?.shape ?? null }
  }).filter((m) => m.box.w + m.box.h > 6)
  const boxes = marks.filter((m) => m.shape === 'box' && m.box.w >= 40 && m.box.h >= 40)
  const out: RepeatPlan[] = []
  const used = new Set<string>()
  for (const note of notes) {
    const want = repeatCount(note.text)
    if (!want) continue
    const ids = note.anchor?.focus ?? note.anchor?.strokeIds ?? []
    // the box the note is bound to, else the smallest box it was typed in
    const bound = boxes.filter((b) => ids.includes(b.id))
    const at = note.at
    const typedIn = at ? boxes.filter((b) => contains(b.box, at)) : []
    const pick = (bound.length ? bound : typedIn).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]
    if (!pick || used.has(pick.id)) continue
    const m = pick.box
    // a wide panel holding a drawn row is a list (rowtemplate.ts), never repeated sideways
    if (m.w >= vp.w * 0.5) continue
    const insideMarks = marks.filter((o) => o.id !== pick.id && within(o.box, m) && o.box.w * o.box.h < m.w * m.h * 0.6)
    // open space to the right: up to the nearest drawn mark overlapping the box's band, else the page edge
    const others = marks.filter((o) => o.id !== pick.id && !insideMarks.includes(o) && !within(m, o.box, 2))
    const overlapY = (o: Box) => Math.min(o.y + o.h, m.y + m.h) - Math.max(o.y, m.y)
    const overlapX = (o: Box) => Math.min(o.x + o.w, m.x + m.w) - Math.max(o.x, m.x)
    const rightLimit = Math.min(vp.w - 8, ...others.filter((o) => o.box.x >= m.x + m.w - 4 && overlapY(o.box) > m.h * 0.3).map((o) => o.box.x - 8))
    const downLimit = Math.min(Math.max(vp.h, m.y + m.h * want.n + 200) - 8, ...others.filter((o) => o.box.y >= m.y + m.h - 4 && overlapX(o.box) > m.w * 0.3).map((o) => o.box.y - 8))
    const fit = (span: number, size: number) => {
      const free = span - want.n * size
      if (free < 0) return null
      return Math.round(Math.max(4, Math.min(Math.max(8, size * 0.12), 32, free / (want.n - 1))))
    }
    let axis: 'x' | 'y' | null = null, gap = 0
    const gx = fit(rightLimit - m.x, m.w)
    if (gx !== null && (want.n - 1) * gx + want.n * m.w <= rightLimit - m.x) { axis = 'x'; gap = gx }
    else {
      const gy = fit(downLimit - m.y, m.h)
      if (gy !== null && m.w >= m.h * 1.5) { axis = 'y'; gap = gy }
    }
    if (!axis) continue
    used.add(pick.id)
    out.push({
      note: note.text, n: want.n, noun: want.noun, names: want.names, mark: m, axis, gap,
      insides: insideMarks.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).slice(0, 8).map((o) => ({
        kind: o.shape === 'ellipse' ? 'ring' : o.shape === 'box' ? 'box' : o.shape === 'line' ? 'line' : 'mark',
        dx: o.box.x - m.x, dy: o.box.y - m.y, w: o.box.w, h: o.box.h,
      })),
    })
  }
  return out
}

const q = (s: string) => `"${s}"`
const at = (p: RepeatPlan, k: number) => p.axis === 'x'
  ? { x: p.mark.x + k * (p.mark.w + p.gap), y: p.mark.y }
  : { x: p.mark.x, y: p.mark.y + k * (p.mark.h + p.gap) }

export function repeatBrief(plans: readonly RepeatPlan[]): string {
  if (!plans.length) return ''
  const lines = plans.map((p) => {
    const thing = p.noun ? p.noun.replace(/s$/, '') : 'copy'
    const last = at(p, p.n - 1)
    const ins = p.insides.length
      ? ` Each holds the drawn insides at the same offsets from its top-left: ${p.insides.map((i) => `${i.kind === 'ring' ? 'a ring (an OUTLINE circle unless tapped)' : i.kind === 'box' ? 'a small box' : i.kind === 'line' ? (i.h > i.w ? 'a vertical line (a track or fader)' : 'a line') : 'a mark'} ${String(i.w)}x${String(i.h)} at +${String(i.dx)},+${String(i.dy)}`).join('; ')}.` +
        (/\bdifferent\b|\bvar(?:y|ied|ying)\b|\brandom\b/i.test(p.note) ? ' Where the note asks for different positions or values, vary them per copy, inside the same drawn track.' : '')
      : ''
    return `- ${q(p.note.slice(0, 120))}: the drawn box at x ${String(p.mark.x)}, y ${String(p.mark.y)}, ${String(p.mark.w)}x${String(p.mark.h)}px is ${thing} 1 of ${String(p.n)}. ` +
      `Build exactly ${String(p.n)} separate ${thing}s ${p.axis === 'x' ? 'side by side in one row' : 'stacked in one column'}, every one ${String(p.mark.w)}x${String(p.mark.h)}px (the drawn size), ${String(p.gap)}px apart: ` +
      `${thing} k's top-left at ${p.axis === 'x' ? `x ${String(p.mark.x)} + (k-1) x ${String(p.mark.w + p.gap)}, y ${String(p.mark.y)}` : `x ${String(p.mark.x)}, y ${String(p.mark.y)} + (k-1) x ${String(p.mark.h + p.gap)}`} ` +
      `(the last at ${String(last.x)},${String(last.y)}). They are SIBLINGS filling the open space ${p.axis === 'x' ? 'to the right of' : 'below'} the drawn one: never put copies inside the drawn box, never shrink them, and leave nothing else in that space.` +
      ins + (p.names.length ? ` Their names, one per ${thing} in order: ${p.names.map(q).join(', ')}.` : '')
  })
  return `REPEATED MARK (a count typed on one drawn box; deterministic; checked on the page):\n${lines.join('\n')}\n` +
    `Never print the count, the noun list's separators or "like this".\n\n`
}

export interface RepeatVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

/** N look-alike boxes of about the drawn size along the drawn row (or column), none shrunk inside the first. */
export function verifyRepeats(plans: readonly RepeatPlan[] | undefined, after: Snap): RepeatVerdict {
  if (!plans?.length) return { satisfied: true, unverifiable: true, reason: 'no repeated mark' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const problems: string[] = []
  for (const p of plans) {
    const m = p.mark
    const like = after.nodes.filter((n) => {
      const b = n.rect
      if (b.w < m.w * 0.55 || b.w > m.w * 1.6 || b.h < m.h * 0.6 || b.h > m.h * 1.5) return false
      return p.axis === 'x' ? Math.abs(b.y - m.y) <= Math.max(40, m.h * 0.15) : Math.abs(b.x - m.x) <= Math.max(40, m.w * 0.15)
    })
    // one per spot along the axis (a wrapper and its strip share a spot)
    const spots: number[] = []
    for (const v of like.map((n) => (p.axis === 'x' ? n.rect.x : n.rect.y)).sort((a, b) => a - b)) {
      if (!spots.length || v - spots[spots.length - 1]! > (p.axis === 'x' ? m.w : m.h) * 0.5) spots.push(v)
    }
    const thing = p.noun ?? 'copies'
    if (spots.length < p.n) {
      problems.push(`${q(p.note.slice(0, 40))} asks for ${String(p.n)} ${thing} at the drawn size (${String(m.w)}x${String(m.h)}px) ${p.axis === 'x' ? 'side by side from' : 'stacked down from'} x ${String(m.x)}, y ${String(m.y)}; the page has ${String(spots.length)}: ` +
        `build them as siblings ${String(p.gap)}px apart in the open space ${p.axis === 'x' ? 'to the right' : 'below'}, never small copies inside the first`)
    }
  }
  return problems.length
    ? { satisfied: false, reason: problems.join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${plans.map((p) => `${String(p.n)} ${p.noun ?? 'copies'}`).join(', ')} at the drawn size, side by side` }
}

/**
 * n201, part two: characters typed for a row of drawn boxes go INSIDE the boxes.
 *
 * Round 45 e2 two-factor code (n198): six small look-alike boxes drawn in a row (a code input) and the note
 * "4, 8, 1 big bold in first three boxes" typed in the first. The build made three huge bare digits and dropped
 * the three boxes they were for; a fix note put them back. "Big bold" is the digit's look, inside its box; the
 * boxes are the drawing and stay. So: a note listing single characters and naming boxes ("in first three boxes",
 * "in the boxes") is read against the row of look-alike boxes it sits in: the k-th character centred in the k-th
 * box, every drawn box kept at its drawn size, the rest empty.
 */
export interface BoxChars { note: string; chars: string[]; boxes: Box[] }

const CHAR_LIST = /^\s*([A-Za-z0-9](?:\s*[,\s]\s*[A-Za-z0-9]){1,11})\b/
const IN_BOXES = /\bin(?:to)?\s+(?:the\s+)?(?:(?:first|1st)\s+(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+|(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+|these\s+|each\s+of\s+the\s+)?(?:boxes|squares|cells|slots|fields)\b/i

export function boxCharsOf(notes: readonly NoteLike[], strokes: readonly Stroke[]): BoxChars[] {
  const boxes = strokes.filter((s) => s.points.length > 1).map((s) => { const sh = shapeOf(s.points); return sh?.shape === 'box' ? r(sh.box) : null })
    .filter((b): b is Box => !!b && b.w >= 20 && b.h >= 20 && b.w <= 200 && b.h <= 200)
  const out: BoxChars[] = []
  for (const note of notes) {
    const inb = IN_BOXES.exec(note.text)
    const cl = CHAR_LIST.exec(note.text)
    if (!inb || !cl || !note.at) continue
    const chars = cl[1]!.split(/\s*[,\s]\s*/).filter(Boolean)
    if (chars.length < 2 || chars.some((c) => c.length !== 1)) continue
    const at = note.at
    // the box it was typed in (or nearest on its level), then its row of look-alikes on that level
    const home = boxes.filter((b) => contains(b, at, 14))[0] ??
      boxes.filter((b) => Math.abs(b.y + b.h / 2 - at.y) <= b.h).sort((a, b) => Math.abs(a.x + a.w / 2 - at.x) - Math.abs(b.x + b.w / 2 - at.x))[0]
    if (!home) continue
    const row = boxes.filter((b) => Math.abs(b.y + b.h / 2 - (home.y + home.h / 2)) <= home.h * 0.3 && b.w >= home.w * 0.7 && b.w <= home.w * 1.4 && b.h >= home.h * 0.7 && b.h <= home.h * 1.4)
      .sort((a, b) => a.x - b.x)
    // the row starts at the first box; one box redrawn on the same spot counts once
    const uniq: Box[] = []
    for (const b of row) if (!uniq.length || b.x - uniq[uniq.length - 1]!.x > home.w * 0.5) uniq.push(b)
    if (uniq.length < chars.length) continue
    out.push({ note: note.text, chars, boxes: uniq })
  }
  return out
}

export function boxCharsBrief(list: readonly BoxChars[]): string {
  if (!list.length) return ''
  return `CHARACTERS IN DRAWN BOXES (deterministic; checked on the page):\n` + list.map((b) =>
    `- ${q(b.note.slice(0, 100))}: the ${String(b.boxes.length)} drawn boxes in a row (${b.boxes.map((x) => `${String(x.x)},${String(x.y)} ${String(x.w)}x${String(x.h)}`).join('; ')}) ALL stay, each at its drawn size and spot, ` +
    `with the look the other boxes have. Put ${b.chars.map((c, k) => `${q(c)} centred inside box ${String(k + 1)}`).join(', ')}; leave the other ${String(b.boxes.length - b.chars.length)} empty. ` +
    `Size or weight words in the note are the character's look INSIDE its box (as big as fits); never replace a box with a bare character, and never print the note's words.`).join('\n') + '\n\n'
}

export function verifyBoxChars(list: readonly BoxChars[] | undefined, after: Snap): RepeatVerdict {
  if (!list?.length) return { satisfied: true, unverifiable: true, reason: 'no characters for drawn boxes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const problems: string[] = []
  for (const b of list) {
    b.chars.forEach((c, k) => {
      const box = b.boxes[k]!
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2
      // an element about the drawn box's size around the spot
      // it must show as a box: a border or a fill (a bare big digit is no box)
      const paints = (n: NodeLike) => !n.style || !!n.style.border || (!!n.style.backgroundColor && !/rgba\([^)]*,\s*0\)|transparent/.test(n.style.backgroundColor))
      const holder = after.nodes.some((n) => paints(n) && n.rect.w >= box.w * 0.75 && n.rect.w <= box.w * 1.4 && n.rect.h >= box.h * 0.75 && n.rect.h <= box.h * 1.4 &&
        Math.abs(n.rect.x + n.rect.w / 2 - cx) <= box.w * 0.4 && Math.abs(n.rect.y + n.rect.h / 2 - cy) <= box.h * 0.4)
      const glyph = after.nodes.some((n) => (n.text ?? '').trim() === c && Math.abs(n.rect.x + n.rect.w / 2 - cx) <= box.w * 0.6 && Math.abs(n.rect.y + n.rect.h / 2 - cy) <= box.h * 0.6)
      if (!holder || !glyph) problems.push(`${q(c)} belongs centred inside drawn box ${String(k + 1)} (${String(box.w)}x${String(box.h)} at ${String(box.x)},${String(box.y)})${holder ? '' : ': the box is gone, put it back at its drawn size'}`)
    })
  }
  return problems.length
    ? { satisfied: false, reason: problems.slice(0, 4).join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${list.map((b) => b.chars.join('')).join(', ')} inside the drawn boxes, boxes kept` }
}
