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
import { colourName } from './explain.js'
import { deltaE, parseCssColor } from './palette.js'
import { cellRows, countedItems } from './drawnlist.js'

interface Box { x: number; y: number; w: number; h: number }
interface NoteLike { text: string; at?: { x: number; y: number }; anchor?: { kind: string; strokeIds?: string[]; focus?: string[] } }
interface NodeLike { id: string; tag?: string; parent?: string | null; rect: Box; text?: string; textBox?: Box; style?: { backgroundColor?: string; border?: string; fontSize?: string; boxShadow?: string; outline?: string } }
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
  /** n225: the colour tapped inside the drawn box: every copy is painted it, whatever the words say. */
  fill?: string
  /** n225: the note asks for frames: the pen colour the box was drawn in is each copy's border. */
  frame?: string
  /** n225: one per copy: what is pictured in it and its caption. */
  items?: CardItem[]
  /** n225: captions go under the box, outside it. */
  captionsUnder?: boolean
  /** n227: one per copy: the cells typed for that row, in order. */
  rows?: string[][]
  /** n227: how every row looks, the words before the colon ("colour square left"). */
  look?: string
  /** n227: the pen the row's box was drawn in: its thin edge. */
  edge?: string
  /** n227: one colour per row, from the chart the sketch tapped, for a colour mark the look asks for. */
  swatches?: string[]
}

export interface CardItem { picture: string; caption: string; paint?: string }

const FRAME_WORD = /\b(frames?|framed|borders?|bordered|outlined)\b/i
const UNDER_WORD = /\b(?:captions?|names?|labels?|titles?|words?)\s+(?:under|underneath|below)\b|\b(?:under|underneath|below)\s+(?:each|it|them|the\s+(?:box|card|frame)(?:es|s)?)\b/i

/** n225: the cards a note that opens with a count lists, each a picture and a caption; never a table's rows. */
export function cardList(note: string): CardItem[] | null {
  const lead = /^\s*(?:x|×)\s?(\d{1,2})\b/i.exec(note)
  if (!lead) return null
  const c = cardItems(note, Number(lead[1]))
  return c && !/\b(rows?|down|stacked)\b/i.test(c.head.replace(/\bin (?:a |one )?row\b/i, '')) ? c.items : null
}
export const isCardList = (note: string) => !!cardList(note)

/** n225: "white border" on a box drawn in a dark pen: the words name the frame's colour, so the pen is not it. */
function otherColourFrame(head: string, pen: string): boolean {
  const said = /\b(white|black|grey|gray|red|orange|yellow|green|blue|purple|pink|gold|silver)\s+(?:frames?|borders?|outlines?)\b/i.exec(head)?.[1]?.toLowerCase()
  return !!said && said.replace('gray', 'grey') !== colourName(pen)
}

/**
 * n225 (round 47 c5 tattoo parlor, n221): "x4 in a row, dark frames, captions under: black diamond, Diamond $80; red
 * circle, Red sun $60; ..." on one box drawn in a dark pen and tapped white. The first card came out red (its words
 * painted it), the copies frameless, the captions upper-case inside. The words before the colon say how every copy
 * looks; the words after it are, per copy, a picture in lower case and a caption.
 */
export function cardItems(note: string, n: number): { items: CardItem[]; head: string } | null {
  const c = note.indexOf(':')
  if (c < 0) return null
  const segs = note.slice(c + 1).split(/\s*;\s*/).map((t) => t.trim()).filter(Boolean)
  if (segs.length !== n) return null
  const items: CardItem[] = []
  for (const t of segs) {
    const m = /^([\p{Ll}][^,]*?),\s+([\p{Lu}\p{N}$£€¥#].*)$/u.exec(t)
    if (!m) return null
    items.push({ picture: m[1]!.trim(), caption: m[2]!.trim() })
  }
  return { items, head: note.slice(0, c) }
}

/** n227: the rows a count lists, whole ("x4 down, colour square left: Rent, $960; Food, $600; ..."), with the words before the colon. */
export function listedRows(note: string): { rows: string[][]; look: string } | null {
  if (!/^\s*(?:x|×)\s?\d{1,2}\s+(?:stacked|down|vertically|in a column)\b/i.test(note)) return null
  const rows = cellRows(note) ?? countedItems(note)?.items.map((i) => (i.value ? [i.label, i.value] : [i.label]))
  if (!rows) return null
  const look = /^\s*(?:x|×)\s?\d{1,2}\s+(?:stacked|down|vertically|in a column)\b[,\s]*([^:]*):/i.exec(note)?.[1]?.trim() ?? ''
  return { rows, look }
}
const ROW_MAX_H = 120
const COLOUR_MARK = /\b(colou?r|swatch|square|dot|chip)\b/i

const NUMW = '(\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'
const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const num = (s: string) => (/^\d/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? 0)
// plurals that are not drawn things, or that are parts of one thing (rows of a list are the row template's)
const NOT = /^(px|pixels|pts|points|percent|times|minutes|seconds|hours|days|weeks|months|years|words|letters|strokes|colou?rs|shades|rows|lines|items|entries|columns|cols|stars|dots|bars|seats|digits|numbers|steps|tabs)$/
const COUNT = new RegExp(`(?:^|[^\\w$#.,:/-])${NUMW}\\s+(?:(?:same[- ]size|equal|identical|more)\\s+)?([a-z]{3,}s)\\b(\\s*(?::|like\\s+(?:this|that|it)))?`, 'i')
const LIKE = new RegExp(`(?:^|[^\\w$#.,:/-])${NUMW}\\s+(?:more\\s+)?like\\s+(?:this|that|it)\\b`, 'i')
const TIMES = /(?:^|[\s,;(])(?:x|×)\s?(\d{1,2})\b/i

/** How many of the mark a note asks for, its noun and its names; null when it asks for none. */
export function repeatCount(note: string): { n: number; noun: string | null; names: string[]; axis?: 'x' | 'y' } | null {
  let n = 0, noun: string | null = null, tail = ''
  // n212: a note that opens with the count ("x3 stacked: 6 clay courts / 14 coaches") is that count, whatever numbers its items hold
  const lead = /^\s*(?:x|×)\s?\d{1,2}\b/i.test(note)
  const c = lead ? null : note.match(COUNT)
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
  // n215: "x6 rows: ..." goes down a table; the small ring it was typed on is one row's picture, never copied sideways
  if (noun === 'rows' || noun === 'row' || /^\s*rows?\b/i.test(tail)) return null
  // n212: "x3 stacked: a / b / c": a direction word after the count says the way the copies go, and is never a name or printed
  const way = /^\s*(stacked|down|vertically|across|side by side|in a row|in a column)\b\s*(?=[:,]|\s|$)/i.exec(tail)
  const axis: 'x' | 'y' | undefined = way ? (/^(stacked|down|vertically|in a column)$/i.test(way[1]!) ? 'y' : 'x') : undefined
  if (way) tail = tail.slice(way[0].length)
  // the names: the comma list right after a colon, up to a ';' or '.', when it has exactly n entries; a list split by
  // slashes keeps its commas and may run longer ("$39 a month, all courts")
  const slashed = /\s\/\s/.test(tail)
  const list = /^\s*:?\s*([^;]+)/.exec(tail)?.[1] ?? ''
  const names = slashed
    ? list.split(/\s+\/\s+/).map((s) => s.trim()).filter((s) => s && s.split(/\s+/).length <= 8)
    : (/^\s*:?\s*([^;.]+)/.exec(tail)?.[1] ?? '').split(/\s*,\s*/).map((s) => s.trim()).filter((s) => s && s.split(/\s+/).length <= 3)
  return { n, noun, names: names.length === n ? names : [], ...(axis ? { axis } : {}) }
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
    return { id: s.id, box: sh?.box ? r(sh.box) : r(bboxOf(s.points)), shape: sh?.shape ?? null, color: s.color ?? null }
  }).filter((m) => m.box.w + m.box.h > 6)
  // n225: taps (one spot with a pen colour), and every pen colour used, for naming a picture's paint
  const taps = strokes.filter((s) => s.color && (s.points.length === 1 || (bboxOf(s.points).w + bboxOf(s.points).h) <= 6))
  const inks = [...new Set(strokes.map((s) => s.color).filter((c): c is string => !!c))]
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
    const insideMarks = marks.filter((o) => o.id !== pick.id && within(o.box, m) && o.box.w * o.box.h < m.w * m.h * 0.6)
    // n227: one flat box with its rows typed and a way down IS one row: repeat it, however wide. A taller box is the panel they go in.
    const listed = want.axis === 'y' && m.h <= ROW_MAX_H && m.w >= m.h * 2.5 && !insideMarks.length ? listedRows(note.text) : null
    const rowsHere = listed?.rows.length === want.n ? listed : null
    if (m.w >= vp.w * 0.5 && !rowsHere) continue
    // n227: look-alike boxes already drawn under it are the next rows, at their drawn pitch
    const drawnNext = rowsHere ? boxes.filter((o) => o.id !== pick.id && o.box.y > m.y + m.h * 0.5 && Math.abs(o.box.x - m.x) <= 24 &&
      Math.abs(o.box.w - m.w) <= m.w * 0.15 && Math.abs(o.box.h - m.h) <= m.h * 0.4).sort((a, b) => a.box.y - b.box.y).slice(0, want.n - 1) : []
    // open space to the right: up to the nearest drawn mark overlapping the box's band, else the page edge
    const others = marks.filter((o) => o.id !== pick.id && !insideMarks.includes(o) && !within(m, o.box, 2) && !drawnNext.includes(o))
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
    const gy = fit(downLimit - m.y, m.h)
    const fitsX = gx !== null && (want.n - 1) * gx + want.n * m.w <= rightLimit - m.x
    // n212: a typed direction goes first ("x3 stacked"), and a stack needs no wide box
    if (drawnNext.length) { axis = 'y'; gap = Math.max(0, Math.round((drawnNext[drawnNext.length - 1]!.box.y - m.y) / drawnNext.length - m.h)) }
    else if (want.axis === 'y' && gy !== null) { axis = 'y'; gap = gy }
    else if (fitsX) { axis = 'x'; gap = gx! }
    else if (gy !== null && m.w >= m.h * 1.5) { axis = 'y'; gap = gy }
    if (!axis) continue
    used.add(pick.id)
    const cards = cardItems(note.text, want.n)
    const head = cards?.head ?? note.text
    const fillTap = taps.filter((t) => contains(m, t.points[0]!, 0) && !insideMarks.some((o) => contains(o.box, t.points[0]!, 0))).pop()
    const items = cards?.items.map((it) => {
      const named = /^\S+/.exec(it.picture)?.[0]?.toLowerCase()
      const paint = inks.find((c) => colourName(c) === named)
      return { ...it, ...(paint ? { paint } : {}) }
    })
    // n227: a colour mark in each row takes the colours tapped in a ring, in the order they were tapped, when there is one per row
    const rings = marks.filter((o) => o.shape === 'ellipse')
    const swatches = rowsHere && COLOUR_MARK.test(rowsHere.look)
      ? rings.map((o) => [...new Set(taps.filter((t) => contains(o.box, t.points[0]!, 0)).map((t) => t.color!))].filter((c) => !(fillTap?.color === c))).find((c) => c.length === want.n)
      : undefined
    out.push({
      note: note.text, n: want.n, noun: want.noun, names: items ? [] : want.names, mark: m, axis, gap,
      ...(fillTap?.color ? { fill: fillTap.color } : {}),
      ...(FRAME_WORD.test(head) && pick.color && !otherColourFrame(head, pick.color) ? { frame: pick.color } : {}),
      ...(items ? { items } : {}),
      ...(UNDER_WORD.test(head) ? { captionsUnder: true } : {}),
      ...(rowsHere ? { rows: rowsHere.rows, ...(rowsHere.look ? { look: rowsHere.look } : {}), ...(pick.color ? { edge: pick.color } : {}) } : {}),
      ...(swatches ? { swatches } : {}),
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

/** n225: how every copy looks, and what each one holds. */
function cardBrief(p: RepeatPlan): string {
  const look = [
    p.fill ? `painted ${p.fill} (the tap in the drawn box), the first one too: no word in the note colours a card` : '',
    p.frame ? `with a 2px solid ${p.frame} border, the pen the box was drawn in (box-sizing: border-box, so it stays the drawn size), no shadow; this border is asked for, whatever a line above says about no border` : '',
  ].filter(Boolean).join(', ')
  const items = p.items ?? []
  const said = items.map((it, k) => `${String(k + 1)}: ${it.picture}${it.paint ? ` (${it.paint})` : ''}, ${q(it.caption)}`).join('; ')
  return (look ? ` Every copy is ${look}.` : '') + (items.length
    ? ` In each, in order, one flat shape centred in the box, about half its width, in the colour named, then its caption, printed exactly as typed (same capitals, no text-transform): ${said}. ` +
      `A bar is wider than tall. ` +
      (p.captionsUnder ? `Each caption goes BELOW its box, outside the frame, one line, centred under it, so the box stays its drawn size and holds only the shape.` : `Each caption goes inside its box, under the shape.`)
    : '')
}

/** n227: each row's cells go in its own copy of the drawn box. */
function rowsBrief(p: RepeatPlan): string {
  const rows = p.rows
  if (!rows) return ''
  const said = rows.map((r, k) => `row ${String(k + 1)} (top at y ${String(at(p, k).y)}): ${r.map(q).join(' at the left, then ')}${p.swatches ? `, its colour mark ${p.swatches[k]!}` : ''}`).join('; ')
  return ` Every copy is one row of this list, with its own background${p.fill ? ` ${p.fill}` : ''}${p.edge ? ` and a 1px ${p.edge} border` : ''}, and holds ONE row only, vertically centred in it: ${said}. ` +
    `In a row with two cells the first starts near the box's left and the last ends near its right edge. ` +
    (p.look ? `Every row looks: ${q(p.look)}: those words are never printed. ` : '') +
    `These rows are all there is: never put two rows in one box, never add a row or make up a label or figure.`
}

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
      `Build exactly ${String(p.n)} separate ${p.noun ? `${thing}s` : 'copies'} ${p.axis === 'x' ? 'side by side in one row' : 'stacked in one column'}, every one ${String(p.mark.w)}x${String(p.mark.h)}px (the drawn size), ${String(p.gap)}px apart: ` +
      `${thing} k's top-left at ${p.axis === 'x' ? `x ${String(p.mark.x)} + (k-1) x ${String(p.mark.w + p.gap)}, y ${String(p.mark.y)}` : `x ${String(p.mark.x)}, y ${String(p.mark.y)} + (k-1) x ${String(p.mark.h + p.gap)}`} ` +
      `(the last at ${String(last.x)},${String(last.y)}). They are SIBLINGS filling the open space ${p.axis === 'x' ? 'to the right of' : 'below'} the drawn one: never put copies inside the drawn box, never shrink them, and leave nothing else in that space.` +
      ins + (p.names.length ? ` Their names, one per ${thing} in order: ${p.names.map(q).join(', ')}.` : '') + cardBrief(p) + rowsBrief(p)
  })
  return `REPEATED MARK (a count typed on one drawn box; deterministic; checked on the page):\n${lines.join('\n')}\n` +
    `Never print the count, the noun list's separators, a direction word ("stacked", "down") or "like this".\n\n`
}

const framed = (n: NodeLike) => {
  const st = n.style ?? {}
  const on = (v?: string) => !!v && !/^\s*0px/.test(v) && !/\bnone\b/.test(v)
  return on(st.border) || on(st.outline) || (!!st.boxShadow && /0px 0px 0px [1-3](?:\.\d+)?px/.test(st.boxShadow))
}
/** n225: the fill, frame and captions asked for, copy by copy. */
function cardFaults(p: RepeatPlan, after: Snap): string[] {
  const m = p.mark, out: string[] = []
  const fill = p.fill ? parseCssColor(p.fill) : null
  for (let k = 0; k < p.n; k++) {
    const c = at(p, k)
    const here = after.nodes.filter((n) => Math.abs(n.rect.x - c.x) <= 24 && Math.abs(n.rect.y - c.y) <= 24 && Math.abs(n.rect.w - m.w) <= m.w * 0.2 && Math.abs(n.rect.h - m.h) <= m.h * 0.3)
    if (!here.length) continue // the count check above says what is missing
    if (fill && !here.some((n) => { const b = parseCssColor(n.style?.backgroundColor ?? ''); return !!b && deltaE(b, fill) <= 10 })) {
      out.push(`copy ${String(k + 1)} of ${q(p.note.slice(0, 30))} at x ${String(c.x)} must be painted ${p.fill!} (the tap); no word in the note colours it`)
    }
    if (p.frame && !here.some(framed)) out.push(`copy ${String(k + 1)} of ${q(p.note.slice(0, 30))} at x ${String(c.x)} has no border: give it 2px solid ${p.frame}, box-sizing: border-box`)
    const it = p.items?.[k]
    if (!it) continue
    // n225 (try 4): four empty frames with their captions passed every check; a card holds its picture
    const held = after.nodes.some((n) => {
      const b = n.rect
      if (b.w < m.w * 0.15 || b.h < m.h * 0.08 || b.w > m.w * 0.95 || b.h > m.h * 0.95) return false
      if (b.x < c.x - 4 || b.y < c.y - 4 || b.x + b.w > c.x + m.w + 4 || b.y + b.h > c.y + m.h + 4) return false
      if (n.text?.trim()) return false
      if (/^(svg|polygon|circle|ellipse|path|rect|img)$/i.test(n.tag ?? '')) return true
      const bg = parseCssColor(n.style?.backgroundColor ?? '')
      return !!bg && (!fill || deltaE(bg, fill) > 10)
    })
    if (!held) out.push(`copy ${String(k + 1)} at x ${String(c.x)} is empty: draw ${it.picture}${it.paint ? ` (${it.paint})` : ''} centred in it, about half its width`)
    const want = it.caption.toLowerCase()
    const t = after.nodes.filter((n) => n.text?.trim().toLowerCase() === want)[0]
    if (!t) { out.push(`the caption ${q(it.caption)} is not on the page: print it as typed`); continue }
    const b = t.textBox ?? t.rect, mid = b.x + b.w / 2
    if (p.captionsUnder && p.axis === 'x') {
      if (b.y < c.y + m.h - 4) out.push(`the caption ${q(it.caption)} sits inside its box (top at y ${String(Math.round(b.y))}, the box ends at y ${String(c.y + m.h)}): it goes below the box, outside the frame`)
      else if (mid < c.x - 12 || mid > c.x + m.w + 12) out.push(`the caption ${q(it.caption)} is not under its box (x ${String(c.x)} to ${String(c.x + m.w)})`)
    }
  }
  return out
}

/** n227: each typed row sits in its own copy, never two in one box. */
function rowFaults(p: RepeatPlan, after: Snap): string[] {
  if (!p.rows) return []
  const out: string[] = []
  const low = (s: string) => s.trim().toLowerCase()
  p.rows.forEach((row, k) => {
    const top = at(p, k).y
    for (const cell of row) {
      // n226: the same words can stand elsewhere too (a chart's "$600" and the Food row's): one in this row's box is enough
      const exact = after.nodes.filter((n) => low(n.text ?? '') === low(cell))
      const found = exact.length ? exact : after.nodes.filter((n) => low(n.text ?? '').includes(low(cell)))
      if (!found.length) { out.push(`row ${String(k + 1)}'s ${q(cell)} is not on the page: print it as typed in copy ${String(k + 1)}`); continue }
      const midOf = (n: (typeof found)[number]) => { const b = n.textBox ?? n.rect; return b.y + b.h / 2 }
      const inRow = (y: number) => y >= top - 16 && y <= top + p.mark.h + 16
      if (found.some((n) => inRow(midOf(n)))) continue
      const mid = midOf(found[0]!)
      if (!inRow(mid)) out.push(`${q(cell)} is at y ${String(Math.round(mid))}: it belongs to row ${String(k + 1)}, from y ${String(top)} to ${String(top + p.mark.h)}, one row per box`)
    }
  })
  return out
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
    problems.push(...cardFaults(p, after), ...rowFaults(p, after))
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

/** n203: a note that lists single characters for a row of drawn boxes ("4, 8, 1 big bold in first three boxes"). */
export function isBoxCharsNote(text: string): boolean {
  const cl = CHAR_LIST.exec(text)
  if (!IN_BOXES.test(text) || !cl) return false
  const chars = cl[1]!.split(/\s*[,\s]\s*/).filter(Boolean)
  return chars.length >= 2 && chars.every((c) => c.length === 1)
}

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

/** n203: a character's comfortable size inside its drawn box: about 45% of the box's smaller side, capped at 58%. */
const side = (b: BoxChars) => Math.min(...b.boxes.map((x) => Math.min(x.w, x.h)))
export const charPx = (b: BoxChars) => Math.max(10, Math.round(side(b) * 0.45))
export const charMax = (b: BoxChars) => Math.max(12, Math.round(side(b) * 0.58))
const lum = (c: string) => { const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c); return m ? (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255 : null }
/** A border a person can see: at least 1px and not near-white (or near the page's white). */
export const borderShows = (border: string | undefined) => {
  if (!border) return false
  const w = parseFloat(border); const l = lum(border)
  return w >= 0.9 && (l === null || l < 0.9) && !/rgba\([^)]*,\s*0(?:\.0?\d)?\)/.test(border)
}

export function boxCharsBrief(list: readonly BoxChars[]): string {
  if (!list.length) return ''
  return `CHARACTERS IN DRAWN BOXES (deterministic; checked on the page):\n` + list.map((b) =>
    `- ${q(b.note.slice(0, 100))}: the ${String(b.boxes.length)} drawn boxes in a row (${b.boxes.map((x) => `${String(x.x)},${String(x.y)} ${String(x.w)}x${String(x.h)}`).join('; ')}) ALL stay, each at its drawn size and spot, ` +
    `with the look the other boxes have. Put ${b.chars.map((c, k) => `${q(c)} centred inside box ${String(k + 1)}`).join(', ')}; leave the other ${String(b.boxes.length - b.chars.length)} empty. ` +
    `Size or weight words in the note are the character's look INSIDE its box: "big" means as big as fits COMFORTABLY, a font-size of about ${String(charPx(b))}px (never above ${String(charMax(b))}px), with clear room round it; ` +
    `bold is the weight. Every box shows a visible outline (a 1-2px grey border a person can see on the page, never near-white or only a faint fill), as drawn. ` +
    `Never replace a box with a bare character, and never print the note's words.`).join('\n') + '\n\n'
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
      const glyphs = after.nodes.filter((n) => (n.text ?? '').trim() === c && Math.abs(n.rect.x + n.rect.w / 2 - cx) <= box.w * 0.6 && Math.abs(n.rect.y + n.rect.h / 2 - cy) <= box.h * 0.6)
      const glyph = glyphs.length > 0
      if (!holder || !glyph) { problems.push(`${q(c)} belongs centred inside drawn box ${String(k + 1)} (${String(box.w)}x${String(box.h)} at ${String(box.x)},${String(box.y)})${holder ? '' : ': the box is gone, put it back at its drawn size'}`); return }
      // n203: as big as fits comfortably, never oversized
      const fs = Math.min(...glyphs.map((n) => parseFloat(n.style?.fontSize ?? '') || (n.textBox?.h ?? n.rect.h) / 1.2))
      if (fs > charMax(b) + 0.5) problems.push(`${q(c)} in box ${String(k + 1)} is ${String(Math.round(fs))}px, too big for its ${String(box.w)}x${String(box.h)} box: make every code character about ${String(charPx(b))}px (bold kept)`)
    })
    // n203: the drawn boxes show as outlines a person can see
    const faint = b.boxes.filter((box) => {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2
      const near = after.nodes.filter((n) => n.style && n.rect.w >= box.w * 0.75 && n.rect.w <= box.w * 1.4 && n.rect.h >= box.h * 0.75 && n.rect.h <= box.h * 1.4 &&
        Math.abs(n.rect.x + n.rect.w / 2 - cx) <= box.w * 0.4 && Math.abs(n.rect.y + n.rect.h / 2 - cy) <= box.h * 0.4)
      return near.length > 0 && !near.some((n) => borderShows(n.style?.border))
    })
    if (faint.length) problems.push(`${String(faint.length)} of the ${String(b.boxes.length)} drawn code boxes have no visible outline: give every box a 1-2px grey border (e.g. #d1d5db or darker), as drawn`)
  }
  return problems.length
    ? { satisfied: false, reason: problems.slice(0, 4).join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${list.map((b) => b.chars.join('')).join(', ')} inside the drawn boxes, boxes kept` }
}
