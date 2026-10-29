/**
 * Words keep their look and read on what is behind them (n16).
 *
 * Round 12 c4 (hand, n15): two builds of the same sketch.
 * 1. "huge outlined 09, white" typed on a box round a big number came out solid
 *    white letters with a drop shadow on one try: the word "outlined" was lost.
 *    An area box whose note says outlined / hollow / stroked is flagged
 *    `outlined`, codegen is told the letters are hollow (transparent fill, a
 *    text stroke in the named colour), and the page is checked: the big text
 *    over the box has a text stroke and a see-through fill.
 * 2. The nav links, typed with no colour, came out black on the red half (the
 *    target has white). Text whose colour nobody named must read on what sits
 *    behind it. The page is checked: every piece of visible text has at least a
 *    plain contrast against the topmost fill under its middle, including a
 *    clipped half of a split page. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { hexOf, parseCssColor, type Rgb } from './palette.js'
import { clipPolygon } from './areas.js'
import { wordsOf } from './ownwords.js'

/** The copy part of a line's note: before its first comma ("SLOW, giant outlined letters" -> "SLOW"). */
const lineCopy = (t: string) => (t.includes(',') ? t.slice(0, t.indexOf(',')) : t).trim()

const HOLLOW = /\b(outlined|outline|hollow|stroked|stroke-only|outline-only)\b/i
const COLOUR = /\b(white|black|cream|grey|gray|navy|lime|green|blue|red|pink|orange|yellow|purple|violet|teal|cyan|gold)\b/i

/** "huge outlined 09, white" → {colour: 'white'}; null when the letters are not said to be hollow. */
export function outlinedOf(text: string): { colour: string | null } | null {
  if (!HOLLOW.test(text)) return null
  // "outlined box/card" is a frame, not the letters
  if (/\boutlined?\s+(box|card|panel|frame|rectangle|button|pill)\b/i.test(text)) return null
  const c = COLOUR.exec(text)
  return { colour: c ? c[1]!.toLowerCase() : null }
}

interface NoteLike { text: string; focus?: string[] }

/** Flag area boxes (big word or number) whose own notes say the letters are outlined (in place). */
export function markOutlined(marks: ShapeMark[], notes: NoteLike[]): void {
  const boxes = marks.filter((m) => m.shape === 'box')
  for (const m of boxes) {
    if (!m.area || m.areaOf === 'rows') continue
    const own = notes.filter((n) => n.focus?.includes(m.strokeId))
    const said = own.length ? own : boxes.length === 1 ? notes.filter((n) => !n.focus?.length || n.focus.includes(m.strokeId)) : []
    for (const n of said) {
      const o = outlinedOf(n.text)
      if (o) { m.outlined = o; break }
    }
  }
}

export function textLookBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>): string {
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (!m.outlined) continue
      const b = m.box
      const c = m.outlined.colour ?? 'the colour that reads on what is behind'
      if (m.shape === 'line') {
        lines.push(
          `- action ${i}: the words "${lineCopy(m.words ?? '')}" typed on the line from x ${b.x} to ${b.x + b.w} at y ${b.y} are OUTLINED (hollow letters): ` +
          `color: transparent and -webkit-text-stroke: 2px ${c} (3px when the letters are taller than 120px); no solid fill, no text-shadow. ` +
          `One word stays one word: never split it or spread its letters apart (no letter-spacing wider than 0.02em).`,
        )
        continue
      }
      lines.push(
        `- action ${i}: the big word or number in the box at (${b.x},${b.y}) ${b.w}x${b.h} is OUTLINED (hollow letters): ` +
        `color: transparent and -webkit-text-stroke: 2px ${c} (3px when the letters are taller than 200px); ` +
        `no solid fill, no text-shadow, no drop shadow.`,
      )
    }
  })
  return lines.length
    ? `HOLLOW LETTERS (deterministic, from the words typed on the box; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

interface NodeLike {
  id: string; tag: string; parent: string | null; rect: BBox; text?: string
  style: {
    backgroundColor: string; backgroundImage?: string; clipPath?: string; color?: string
    position?: string; zIndex?: string; opacity?: string; textStroke?: string; fontSize?: string
  }
}
interface Snap { nodes: NodeLike[]; viewport: { w: number; h: number }; truncated?: boolean }
export interface LookVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const alpha = (css: string | undefined): number => {
  if (!css) return 0
  if (css === 'transparent') return 0
  const m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(css) ?? /\/\s*([\d.]+%?)\s*\)/.exec(css)
  if (!m) return parseCssColor(css) ? 1 : 0
  return m[1]!.endsWith('%') ? Number(m[1]!.slice(0, -1)) / 100 : Number(m[1])
}
const strokePx = (n: NodeLike) => parseFloat(n.style.textStroke ?? '0') || 0

/** Big text over each outlined box has a text stroke and a see-through fill. */
export function verifyOutlined(marks: ShapeMark[], after: Snap): LookVerdict {
  const boxes = marks.filter((m) => m.outlined)
  if (!boxes.length) return { satisfied: true, unverifiable: true, reason: 'no outlined words' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const m of boxes) {
    const b = m.box
    if (m.shape === 'line') {
      // n57: a line's hollow words: the text built on it (its typed copy words), letters sitting above the line
      const copy = wordsOf(lineCopy(m.words ?? ''))
      const what = `the words "${lineCopy(m.words ?? '')}" on the line at y ${b.y} typed "outlined"`
      const t = after.nodes.filter((n) => n.text && copy.length && copy.every((w) => wordsOf(n.text!).includes(w)) &&
        n.rect.y < b.y + 40 && n.rect.y + n.rect.h > b.y - 320 && n.rect.x < b.x + b.w + 40 && n.rect.x + n.rect.w > b.x - 40)
        .sort((p, q) => (parseFloat(q.style.fontSize ?? '0') || 0) - (parseFloat(p.style.fontSize ?? '0') || 0) || p.rect.w * p.rect.h - q.rect.w * q.rect.h)[0]
      if (!t) continue // its words not found: the place checks name that
      if (!(strokePx(t) > 0 && alpha(t.style.color) < 0.35)) {
        faults.push(`${what} is built as ${strokePx(t) > 0 ? 'stroked but filled' : 'solid'} letters ("${(t.text ?? '').slice(0, 12)}"): ` +
          `make them hollow, color: transparent with -webkit-text-stroke: 2px ${m.outlined!.colour ?? 'white'}; no text-shadow; change nothing else`)
      }
      continue
    }
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    // the biggest-type text whose box covers the middle of the drawn box
    const texts = after.nodes.filter((n) => n.text && inside(n.rect, cx, cy, 0.25 * Math.max(b.w, b.h)))
      .sort((p, q) => (parseFloat(q.style.fontSize ?? '0') || 0) - (parseFloat(p.style.fontSize ?? '0') || 0))
    const t = texts[0]
    const what = `the big word or number in the box at (${b.x},${b.y}) ${b.w}x${b.h} typed "outlined"`
    if (!t) { faults.push(`${what} has no text built over it`); continue }
    const hollow = strokePx(t) > 0 && alpha(t.style.color) < 0.35
    if (!hollow) {
      faults.push(`${what} is built as ${strokePx(t) > 0 ? 'stroked but filled' : 'solid'} letters ("${(t.text ?? '').slice(0, 12)}"): ` +
        `make them hollow, color: transparent with -webkit-text-stroke: 2px ${m.outlined!.colour ?? 'white'}; no text-shadow; change nothing else`)
    }
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${boxes.length} outlined word${boxes.length > 1 ? 's' : ''} built hollow` }
}

const inside = (r: BBox, x: number, y: number, slack = 0) =>
  x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack

function inPoly(pts: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) ins = !ins
  }
  return ins
}

const lum = ({ r, g, b }: Rgb) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** WCAG contrast ratio, 1..21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }, BLACK: Rgb = { r: 0, g: 0, b: 0 }
/**
 * A saturated fill where white reads at least about as well as black (a red, a
 * royal blue, a purple): a person puts white letters on it. Round 12 c4: nav
 * links came out black on the red half; black on red passes a contrast count,
 * but nobody draws it that way and the target is white.
 */
export function lightReads(fill: Rgb): boolean {
  const sat = Math.max(fill.r, fill.g, fill.b) - Math.min(fill.r, fill.g, fill.b)
  return sat > 100 && contrast(WHITE, fill) >= 0.85 * contrast(BLACK, fill)
}

/** Least contrast a piece of text may have on what is behind it. Generous: a person squinting, not WCAG AA. */
export const MIN_CONTRAST = 2

/** A gradient's mean stop colour (red gradient right: judge on red); 'mixed' for a picture or an unreadable one. */
function gradientMean(img: string): Rgb | 'mixed' {
  if (/url\(/i.test(img) || !/gradient\(/i.test(img)) return 'mixed'
  const stops = (img.match(/(?:rgba?|hsla?|oklch|oklab)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? [])
    .filter((c) => alpha(c) >= 0.6).map((c) => parseCssColor(c)).filter((c): c is Rgb => !!c)
  if (!stops.length) return 'mixed'
  const mean = (k: keyof Rgb) => Math.round(stops.reduce((t, c) => t + c[k], 0) / stops.length)
  const m = { r: mean('r'), g: mean('g'), b: mean('b') }
  // stops far apart (black to white) have no one colour behind the text
  if (stops.some((c) => contrast(c, m) > 2.5)) return 'mixed'
  return m
}

/**
 * The fill under a point, as painted: of the elements under it that paint an
 * opaque flat fill (a clipped one only inside its clip), the one painted last:
 * positioned before static, then higher z-index, then later in the document.
 * 'mixed' when a gradient or picture is on top (can't judge); white when bare.
 */
function fillAt(nodes: NodeLike[], upTo: number, x: number, y: number): Rgb | 'mixed' {
  let best: { key: [number, number, number]; c: Rgb | 'mixed'; id: string } | null = null
  // n21 (bento): a static white button inside a positioned gradient card was ranked under the
  // card, so its own text read as "on the card colour" and a repair made it white on white.
  // A box paints over its ancestors' backgrounds, whatever their position.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const within = (id: string, anc: string): boolean => {
    for (let p = byId.get(id)?.parent, d = 0; p && d < 60; d++, p = byId.get(p)?.parent) if (p === anc) return true
    return false
  }
  for (let i = 0; i <= upTo; i++) {
    const n = nodes[i]!
    if (!inside(n.rect, x, y)) continue
    if (n.style.opacity && Number(n.style.opacity) < 0.5) continue
    let c: Rgb | 'mixed' | null = null
    if (n.style.backgroundImage) c = gradientMean(n.style.backgroundImage)
    else if (alpha(n.style.backgroundColor) >= 0.6) c = parseCssColor(n.style.backgroundColor)
    if (n.tag === 'img' || n.tag === 'video' || n.tag === 'canvas' || n.tag === 'svg') c = 'mixed'
    if (!c) continue
    if (n.style.clipPath) {
      const poly = clipPolygon(n.style.clipPath, n.rect)
      if (!poly) continue
      if (!inPoly(poly, x, y)) continue
    }
    const positioned = n.style.position && n.style.position !== 'static' ? 1 : 0
    const z = positioned ? parseInt(n.style.zIndex ?? '0', 10) || 0 : 0
    const key: [number, number, number] = [z, positioned, i]
    const over = !best ? true
      : within(n.id, best.id) && key[0] >= 0 ? true
        : within(best.id, n.id) && best.key[0] >= 0 ? false
          : key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])))
    if (over) best = { key, c, id: n.id }
  }
  return best ? best.c : { r: 255, g: 255, b: 255 }
}

/** Every visible piece of text reads on the fill under its middle. */
export function verifyReadable(after: Snap, opts: { skip?: (n: NodeLike) => boolean } = {}): LookVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const faults: string[] = []
  let judged = 0
  after.nodes.forEach((n, i) => {
    const words = (n.text ?? '').trim()
    if (!words || !/[\p{L}\p{N}]/u.test(words)) return
    if (n.rect.w < 4 || n.rect.h < 4) return
    if (n.rect.y > after.viewport.h * 1.5) return
    if (opts.skip?.(n)) return
    // hollow letters are judged by their stroke, not their (see-through) fill
    if (strokePx(n) > 0) return
    if (alpha(n.style.color) < 0.5) return
    const ink = parseCssColor(n.style.color ?? '')
    if (!ink) return
    for (let p = n.parent ? byId.get(n.parent) : undefined, d = 0; p && d < 30; d++, p = p.parent ? byId.get(p.parent) : undefined) {
      if (p.style.opacity && Number(p.style.opacity) < 0.5) return // a faded element is faded on purpose
    }
    const under = fillAt(after.nodes, i, n.rect.x + n.rect.w / 2, n.rect.y + n.rect.h / 2)
    if (under === 'mixed') return
    judged++
    const cr = contrast(ink, under)
    if (cr < MIN_CONTRAST || (lum(ink) < 0.1 && lightReads(under))) {
      faults.push(`"${words.slice(0, 24)}" is ${hexOf(ink)} on ${hexOf(under)} behind it (hard to read): ` +
        `give it a colour that reads on ${hexOf(under)} (${lum(under) > 0.35 ? 'dark' : 'white or light'}); change nothing else`)
    }
  })
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no text on a flat fill' }
  return faults.length
    ? { satisfied: false, reason: faults.slice(0, 5).join('; ') + (faults.length > 5 ? `; and ${faults.length - 5} more like it` : '') }
    : { satisfied: true, reason: `${judged} pieces of text read on what is behind them` }
}
