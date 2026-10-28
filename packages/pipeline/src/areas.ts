/**
 * Two readings of plain marks that codegen kept getting wrong (n14).
 *
 * 1. A box drawn round a big word or number marks WHERE that word sits, not a
 *    card. Round 12 c4 (hand, n7 and again n11): a box round "huge outlined
 *    09, white" was built as a black rounded card behind the digits, despite
 *    a rule in the codegen brief. A rule nobody checks is a wish, so the box
 *    is flagged `area` from the words typed on it, codegen is told so on the
 *    mark itself, and the built page is checked: nothing built for that box
 *    may paint a fill, a border or a shadow of its own.
 *
 * 2. A slanted line drawn across most of the page is the edge between two
 *    areas ("lime left, red right"). Round 12 c4 (n11): it came out as a
 *    vertical split with a separate black band crossing it. The line is
 *    flagged `edge`, codegen gets the exact clip-path polygon that puts the
 *    boundary on the drawn line, and the page is checked for a clipped layer
 *    whose slanted side lies on the line.
 *
 * Both are deterministic: zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { parseCssColor, hexOf, deltaE } from './palette.js'

const BIG = /\b(huge|giant|big|bigger|large|massive|oversized|enormous|display|jumbo|outsized)\b/i
const WORDY = /\b(number|numeral|digits?|word|words|headline|heading|title|letters|type|wordmark|logo ?type)\b|\d|\b[A-Z]{2,}\b/
// what a box IS when it is a thing of its own; "outlined 09" is the letters' outline, not a frame
const THING = /\b(card|cards|panel|tile|frame|framed|border|bordered|button|btn|badge|pill|chip|input|field|search|modal|dialog|window|boxed|container|sheet|sticker|banner|filled|fill|background|bg|backdrop|shadow|photos?|pictures?|images?|img|charts?|graphs?|maps?|videos?|table|grid|list|form|block|plate|slab|avatars?|thumbnails?|icons?)\b|\boutlined (box|card|panel|frame|rectangle)\b/i

// n15: "3 rows: Route, Start, Groups" typed on a box over a red page came out a white rounded card
// with a shadow (round 12 c4, n9-n14); the target's rows sit bare on the page. A box whose note
// only lists rows or lines (no card, panel or colour named) marks where they sit.
const ROWS = /\b(\d+|two|three|four|five|six)\s+(rows|lines|items|entries|stats|facts)\b|^\s*(rows|list|lines)\s*:/i
const COLOUR_WORD = /\b(white|black|cream|grey|gray|navy|lime|green|blue|red|pink|orange|yellow|purple|violet|teal|cyan|dark|light|pale)\b/i

/** Does this typed note say its box only holds bare rows? */
export function isRowsNote(text: string): boolean {
  return ROWS.test(text) && !THING.test(text) && !COLOUR_WORD.test(text.replace(/:.*$/, ''))
}

/** Does this typed note say its box only holds a big word or number? */
export function isAreaNote(text: string): boolean {
  return BIG.test(text) && WORDY.test(text) && !THING.test(text)
}

interface NoteLike { text: string; focus?: string[] }

/**
 * Flag the area boxes and edge lines among an action's marks, in place.
 * A box takes the notes focused on it; with no focused note, an action with a
 * single box takes all of its notes.
 */
export function markAreasAndEdges(
  marks: ShapeMark[],
  notes: NoteLike[],
  viewport: { w: number; h: number },
): void {
  const boxes = marks.filter((m) => m.shape === 'box')
  for (const m of boxes) {
    const own = notes.filter((n) => n.focus?.includes(m.strokeId))
    const said = own.length ? own : boxes.length === 1 ? notes.filter((n) => !n.focus?.length || n.focus.includes(m.strokeId)) : []
    if (said.length && said.some((n) => isAreaNote(n.text)) && !said.some((n) => THING.test(n.text))) m.area = true
    else if (said.length && said.some((n) => isRowsNote(n.text)) && !said.some((n) => THING.test(n.text))) { m.area = true; m.areaOf = 'rows' }
  }
  for (const m of marks) {
    if (m.shape !== 'line' || !m.from || !m.to) continue
    const dx = Math.abs(m.to.x - m.from.x), dy = Math.abs(m.to.y - m.from.y)
    if (dx < 12 || dy < 12) continue // level or plumb: a rule, not a slanted edge
    if (dy >= viewport.h * 0.6 || dx >= viewport.w * 0.6) m.edge = true
    if (!m.edge) continue
    // n17: a band noted on the edge line is a stripe of a set width, centred on it
    const own = notes.filter((n) => n.focus?.includes(m.strokeId))
    for (const n of own) {
      const b = bandOf(n.text, viewport)
      if (b) { m.band = b; break }
    }
  }
  for (const m of boxes) {
    if (!m.area || m.areaOf === 'rows') continue
    const own = notes.filter((n) => n.focus?.includes(m.strokeId))
    const said = own.length ? own : boxes.length === 1 ? notes : []
    for (const n of said) {
      const w = bigWordOf(n.text)
      if (w) { m.word = w; break }
    }
  }
}

const BAND = /\b(band|stripe|strip|bar|ribbon)\b/i
const THICK = /\b(thick|wide|broad|fat|heavy)\b/i
const THIN = /\b(thin|hairline|narrow|slim|fine)\b/i
const BAND_COLOUR = /\b(white|black|cream|grey|gray|navy|lime|green|blue|red|pink|orange|yellow|purple|violet|teal|cyan)\s+(?:\w+\s+)?(?:band|stripe|strip|bar|ribbon)\b/i

/**
 * "black diagonal band" typed on a slanted edge line: one line drawn is one
 * stripe, so its width comes from the pen, not from codegen's taste (n16: the
 * band came out about twice as wide as in the picture). A plain band is a
 * stripe about 2% of the page wide; "thin" halves it, "thick" or "wide" makes
 * it about 5%. Null when no band is noted.
 */
export function bandOf(text: string, viewport: { w: number; h: number }): { px: number; colour: string | null } | null {
  if (!BAND.test(text)) return null
  const base = Math.max(14, Math.round(viewport.w * 0.02))
  const px = THICK.test(text) ? Math.round(base * 2.5) : THIN.test(text) ? Math.max(6, Math.round(base / 2)) : base
  const c = text.match(BAND_COLOUR)
  return { px, colour: c ? c[1]!.toLowerCase() : null }
}

/** The big word or number typed in a note: "huge outlined 09, white" -> "09"; "giant SALE" -> "SALE". */
export function bigWordOf(text: string): string | null {
  const q = text.match(/["“']([^"”']{1,24})["”']/)
  if (q) return q[1]!.trim()
  const num = text.match(/(?<![\w.])\d+(?:[.,:]\d+)*%?(?!\w)/)
  if (num) return num[0]
  const caps = text.match(/\b[A-Z][A-Z0-9&]{1,}(?:\s+[A-Z][A-Z0-9&]+)*\b/)
  return caps ? caps[0] : null
}

/**
 * The font size that makes `word` fill a box: the letters of a bold display
 * face run about 0.6 em wide per character and their caps about 0.72 em tall,
 * so the size is the smaller of what the width and the height allow.
 */
export function fillFontPx(word: string, box: { w: number; h: number }): number {
  const chars = Math.max(1, [...word].length)
  return Math.round(Math.min(box.w / (chars * 0.6), box.h / 0.72))
}

/** Where the drawn line (extended) crosses the horizontal at y. */
const xAt = (m: ShapeMark, y: number) => {
  const { from: a, to: b } = m as Required<Pick<ShapeMark, 'from' | 'to'>>
  return a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)
}
const yAt = (m: ShapeMark, x: number) => {
  const { from: a, to: b } = m as Required<Pick<ShapeMark, 'from' | 'to'>>
  return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x)
}
const r = Math.round

/** clip-path for a stripe `px` wide (across the line) centred on a drawn edge line, full page height or width. */
export function bandPoly(m: ShapeMark, H: number, px: number, W = 1280): string {
  const { from: a, to: b } = m as Required<Pick<ShapeMark, 'from' | 'to'>>
  const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  if (vertical) {
    // horizontal half-width that gives px across a line at this slant
    const hw = (px / 2) * (len / Math.abs(b.y - a.y))
    const x0 = xAt(m, 0), x1 = xAt(m, H)
    return `polygon(${r(x0 - hw)}px 0, ${r(x0 + hw)}px 0, ${r(x1 + hw)}px ${H}px, ${r(x1 - hw)}px ${H}px)`
  }
  const hh = (px / 2) * (len / Math.abs(b.x - a.x))
  const y0 = yAt(m, 0), y1 = yAt(m, W)
  return `polygon(0 ${r(y0 - hh)}px, ${W}px ${r(y1 - hh)}px, ${W}px ${r(y1 + hh)}px, 0 ${r(y0 + hh)}px)`
}

/** Brief lines for the flagged marks; '' when there are none. */
export function areasBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>, viewport: { w: number; h: number }): string {
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (m.area && m.areaOf === 'rows') {
        const b = m.box
        lines.push(
          `- action ${i}: the box at (${b.x},${b.y}) ${b.w}x${b.h} only marks where the rows typed on it sit, spread over its height. ` +
          `It is NOT a card: no background, no rounded panel, no shadow, no outer border; the rows sit straight on the page ` +
          `(thin dividers between rows are fine), text in a colour that reads on the page behind.`,
        )
      } else if (m.area) {
        const b = m.box
        lines.push(
          `- action ${i}: the box at (${b.x},${b.y}) ${b.w}x${b.h} only marks where the big word or number typed on it sits ` +
          `(size it to fill that box). Nothing built for it may paint its own fill, border, shadow or rounded card: ` +
          `background transparent, the page or split shows straight through behind the letters.` +
          (m.word
            ? ` The letters "${m.word}" FILL that box: put them in an absolutely positioned element at left ${b.x}px, top ${b.y}px, ` +
              `width ${b.w}px, height ${b.h}px (display flex, centred both ways, line-height 1, letter-spacing about -0.02em, white-space nowrap), ` +
              `font-size about ${fillFontPx(m.word, b)}px, so the letters run nearly edge to edge of the box; checked on the page.`
            : ''),
        )
      }
      if (m.edge && m.from && m.to) {
        const vertical = Math.abs(m.to.y - m.from.y) >= Math.abs(m.to.x - m.from.x)
        const H = Math.max(viewport.h, m.box.y + m.box.h)
        const poly = vertical
          ? `polygon(0 0, ${r(xAt(m, 0))}px 0, ${r(xAt(m, H))}px ${H}px, 0 ${H}px)`
          : `polygon(0 0, 100% 0, 100% ${r(yAt(m, viewport.w))}px, 0 ${r(yAt(m, 0))}px)`
        lines.push(
          `- action ${i}: the slanted line from (${m.from.x},${m.from.y}) to (${m.to.x},${m.to.y}) IS the edge between the two ` +
          `colour areas of the page (the ${vertical ? 'left' : 'top'} colour on one side, the ${vertical ? 'right' : 'bottom'} on the other), ` +
          `never a vertical or level split. Build the ${vertical ? 'left' : 'top'} area as a full-page absolutely positioned layer ` +
          `(top 0, left 0, width 100%, height ${H}px) with clip-path: ${poly} over the other colour. ` +
          (m.band
            ? `A ${m.band.colour ?? ''} band noted on this line is a stripe EXACTLY ${m.band.px}px wide measured across it, centred on the line, ` +
              `the same slant: a full-page layer clipped to ${bandPoly(m, H, m.band.px, viewport.w)}${m.band.colour ? `, filled ${m.band.colour}` : ''}. ` +
              `Not wider: one drawn line is one thin stripe. Checked on the page.`
            : `A band or stripe noted on this line runs along it, centred on it, the same slant.`),
        )
      }
    }
  })
  return lines.length
    ? `AREAS AND EDGES (deterministic, from the drawn marks and the words typed on them; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

interface NodeLike {
  id: string
  tag: string
  parent: string | null
  rect: BBox
  text?: string
  textBox?: BBox
  style: { backgroundColor: string; backgroundImage?: string; clipPath?: string; border?: string; boxShadow?: string; fontSize?: string }
}
interface Snap { nodes: NodeLike[]; viewport: { w: number; h: number }; truncated?: boolean }

export interface AreaVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const overlap = (a: BBox, b: BBox) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** The fill showing under an element: the nearest painted ancestor's, or a gradient, or white. */
function under(n: NodeLike | undefined, byId: Map<string, NodeLike>): string {
  for (let d = 0; n && d < 12; d++) {
    if (n.style.backgroundImage) return 'gradient'
    const c = parseCssColor(n.style.backgroundColor)
    if (c && (c as { a?: number }).a !== 0) return hexOf(c)
    n = n.parent ? byId.get(n.parent) : undefined
  }
  return '#ffffff'
}

/** Nothing built over an area box paints a card of its own. */
export function verifyAreaMarks(marks: ShapeMark[], after: Snap): AreaVerdict {
  const areas = marks.filter((m) => m.area)
  if (!areas.length) return { satisfied: true, unverifiable: true, reason: 'no area boxes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const faults: string[] = []
  for (const m of areas) {
    const b = m.box, area = b.w * b.h
    for (const n of after.nodes) {
      const a = n.rect.w * n.rect.h
      if (!a || a > area * 1.8 || a < area * 0.35) continue // a page wrapper or a single letter, not this box's block
      if (overlap(n.rect, b) < area * 0.35 || overlap(n.rect, b) < a * 0.6) continue
      const own = n.style.backgroundImage ? 'gradient' : (() => {
        const c = parseCssColor(n.style.backgroundColor)
        return c && (c as { a?: number }).a !== 0 ? hexOf(c) : null
      })()
      const behind = under(n.parent ? byId.get(n.parent) : undefined, byId)
      const painted = own && own !== behind && !(own !== 'gradient' && behind !== 'gradient' &&
        deltaE(parseCssColor(own)!, parseCssColor(behind)!) < 6)
      const what = [
        painted ? `a ${own === 'gradient' ? 'gradient' : own} fill` : '',
        n.style.border ? `a ${n.style.border} border` : '',
        n.style.boxShadow ? 'a shadow' : '',
      ].filter(Boolean)
      if (what.length) {
        faults.push(
          `the box drawn at (${b.x},${b.y}) ${b.w}x${b.h} only marks where ${m.areaOf === 'rows' ? 'bare rows sit' : 'a big word or number sits'}, but the <${n.tag}> ` +
          `built over it paints ${what.join(' and ')}, a card the user never asked for: make it transparent with no border ` +
          `or shadow, so the page shows behind ${m.areaOf === 'rows' ? 'the rows' : 'the letters'}`,
        )
        break
      }
    }
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${areas.length} area box${areas.length > 1 ? 'es' : ''} built with no card` }
}

/** Points of a polygon() clip-path in page px, or null when it can't be read. */
export function clipPolygon(clip: string, rect: BBox): Array<{ x: number; y: number }> | null {
  const m = clip.match(/polygon\(([^)]*)\)/i)
  if (!m) return null
  const pts: Array<{ x: number; y: number }> = []
  for (const pair of m[1]!.split(',')) {
    const [xs, ys] = pair.trim().split(/\s+/)
    const v = (s: string | undefined, span: number) => {
      if (!s) return NaN
      if (s.endsWith('%')) return (parseFloat(s) / 100) * span
      return parseFloat(s) // px (computed style resolves calc to px or %)
    }
    const x = v(xs, rect.w), y = v(ys, rect.h)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    pts.push({ x: rect.x + x, y: rect.y + y })
  }
  return pts.length >= 3 ? pts : null
}

/** Some clipped layer has a side lying on each drawn edge line. */
export function verifyEdges(marks: ShapeMark[], after: Snap): AreaVerdict {
  const edges = marks.filter((m) => m.edge && m.from && m.to)
  if (!edges.length) return { satisfied: true, unverifiable: true, reason: 'no slanted edges' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const m of edges) {
    const vertical = Math.abs(m.to!.y - m.from!.y) >= Math.abs(m.to!.x - m.from!.x)
    // distance from the drawn line, measured across it, at a point
    const off = (p: { x: number; y: number }) => vertical ? Math.abs(p.x - xAt(m, p.y)) : Math.abs(p.y - yAt(m, p.x))
    const tol = Math.max(40, (vertical ? after.viewport.w : after.viewport.h) * 0.04)
    let found = false
    let gradient = false
    for (const n of after.nodes) {
      if (n.style.backgroundImage && /linear-gradient\(\s*-?\d+(\.\d+)?deg/i.test(n.style.backgroundImage) &&
        n.rect.w >= after.viewport.w * 0.5) gradient = true
      if (!n.style.clipPath) continue
      const poly = clipPolygon(n.style.clipPath, n.rect)
      if (!poly) continue
      for (let i = 0; i < poly.length && !found; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!
        const span = vertical ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x)
        const slant = vertical ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)
        if (span < (vertical ? m.box.h : m.box.w) * 0.4 || slant < 12) continue
        if (off(a) <= tol && off(b) <= tol && off({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) <= tol) found = true
      }
      if (found) break
    }
    if (found) continue
    // an angled hard-stop gradient can draw the same edge; it can't be measured from the DOM, so it isn't failed
    if (gradient) continue
    faults.push(
      `the slanted line drawn from (${m.from!.x},${m.from!.y}) to (${m.to!.x},${m.to!.y}) is the edge between the page's two ` +
      `colour areas, but no layer's edge lies on it (a vertical or level split, or a band crossing it, is not that edge): ` +
      `clip the ${vertical ? 'left' : 'top'} colour layer with a polygon whose slanted side runs along that line`,
    )
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${edges.length} slanted edge${edges.length > 1 ? 's' : ''} built on the drawn line` }
}

const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase()

/**
 * n17: the big word typed on an area box fills that box. Round 12 c4 (n16): the
 * outlined 09 was drawn 400-910 px across and came out smaller and to the right
 * (590-1110 on one try); the area check only looked for a card. The letters'
 * own box (not their block's) must sit centred in the drawn box and run most of
 * its width or height, without spilling far past it.
 */
export function verifyAreaWords(marks: ShapeMark[], after: Snap): AreaVerdict {
  const boxes = marks.filter((m) => m.area && m.areaOf !== 'rows' && m.word)
  if (!boxes.length) return { satisfied: true, unverifiable: true, reason: 'no big words in area boxes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const m of boxes) {
    const b = m.box, want = norm(m.word!)
    const cands = after.nodes.filter((n) => n.text && norm(n.text).includes(want))
    // the biggest type wins (a nav link can carry the same word)
    cands.sort((p, q) => (parseFloat(q.style.fontSize ?? '0') || 0) - (parseFloat(p.style.fontSize ?? '0') || 0))
    let t = cands[0]
    if (!t) {
      // split across spans ("0" + "9"): the biggest type over the box's middle
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      t = after.nodes.filter((n) => n.text && (n.textBox ?? n.rect).x <= cx + b.w / 2 && (n.textBox ?? n.rect).x + (n.textBox ?? n.rect).w >= cx - b.w / 2 &&
        (n.textBox ?? n.rect).y <= cy && (n.textBox ?? n.rect).y + (n.textBox ?? n.rect).h >= cy)
        .sort((p, q) => (parseFloat(q.style.fontSize ?? '0') || 0) - (parseFloat(p.style.fontSize ?? '0') || 0))[0]
    }
    const what = `the big "${m.word}" typed on the box drawn at (${b.x},${b.y}) ${b.w}x${b.h}`
    if (!t) { faults.push(`${what} is not on the page`); continue }
    const g = t.textBox ?? t.rect
    const fs = parseFloat(t.style.fontSize ?? '0') || 0
    const dx = (g.x + g.w / 2) - (b.x + b.w / 2), dy = (g.y + g.h / 2) - (b.y + b.h / 2)
    const fillW = g.w / b.w, fillH = g.h / b.h
    const off = Math.abs(dx) > b.w * 0.15 || Math.abs(dy) > b.h * 0.2
    const small = fillW < 0.72 && fillH < 0.72
    const spill = fillW > 1.3 || fillH > 1.45
    if (!off && !small && !spill) continue
    const scale = Math.min(b.w / g.w, (b.h * 1.1) / g.h)
    const fix = fs ? ` (font-size about ${Math.round(fs * scale)}px instead of ${Math.round(fs)}px)` : ''
    faults.push(
      `${what} must fill that box, but its letters sit at (${Math.round(g.x)},${Math.round(g.y)}) ${Math.round(g.w)}x${Math.round(g.h)}` +
      `${off ? `, ${Math.round(Math.abs(dx))}px ${dx > 0 ? 'right' : 'left'} and ${Math.round(Math.abs(dy))}px ${dy > 0 ? 'below' : 'above'} its middle` : ''}` +
      `${small ? ', too small' : spill ? ', spilling past it' : ''}: position the element absolutely at left ${b.x}px, top ${b.y}px, ` +
      `width ${b.w}px, height ${b.h}px, letters centred in it${fix}; change nothing else`,
    )
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${boxes.length} big word${boxes.length > 1 ? 's' : ''} filling ${boxes.length > 1 ? 'their' : 'its'} box` }
}

/**
 * n17: a band noted on a slanted edge is as wide as told. Looks for a clipped
 * layer with two long sides running along the drawn line and measures the gap
 * between them across the line. A band built some other way (a rotated div, a
 * gradient) can't be measured from the DOM and is not failed.
 */
export function verifyBands(marks: ShapeMark[], after: Snap): AreaVerdict {
  const lines = marks.filter((m) => m.edge && m.band && m.from && m.to)
  if (!lines.length) return { satisfied: true, unverifiable: true, reason: 'no bands' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let measured = 0
  for (const m of lines) {
    const a = m.from!, b = m.to!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
    // signed distance across the drawn line
    const across = (p: { x: number; y: number }) => (p.x - a.x) * -uy + (p.y - a.y) * ux
    let best: number | null = null
    for (const n of after.nodes) {
      if (!n.style.clipPath) continue
      const poly = clipPolygon(n.style.clipPath, n.rect)
      if (!poly || poly.length < 4) continue
      // long sides parallel to the line (within ~6 degrees), near it
      const sides: number[] = []
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!
        const sl = Math.hypot(q.x - p.x, q.y - p.y)
        if (sl < len * 0.4) continue
        const cos = Math.abs(((q.x - p.x) * ux + (q.y - p.y) * uy) / sl)
        if (cos < 0.994) continue
        const d = (across(p) + across(q)) / 2
        if (Math.abs(d) > Math.max(80, m.band!.px * 3)) continue
        sides.push(d)
      }
      if (sides.length < 2) continue
      const w = Math.max(...sides) - Math.min(...sides)
      if (w < 2) continue
      if (best === null || Math.abs(w - m.band!.px) < Math.abs(best - m.band!.px)) best = w
    }
    if (best === null) continue
    measured++
    if (best > m.band!.px * 1.6 || best < m.band!.px * 0.5) {
      faults.push(
        `the band noted on the slanted line from (${a.x},${a.y}) to (${b.x},${b.y}) is ${Math.round(best)}px wide across the line, ` +
        `it should be about ${m.band!.px}px: clip it to ${bandPoly(m, Math.max(after.viewport.h, m.box.y + m.box.h), m.band!.px, after.viewport.w)}; change nothing else`,
      )
    }
  }
  if (!measured) return { satisfied: true, unverifiable: true, reason: 'band not built as a clipped layer' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${measured} band${measured > 1 ? 's' : ''} as wide as told` }
}
