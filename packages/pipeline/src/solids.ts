/**
 * A ring or box with a colour and a thing word is that plain thing, in that colour (n15).
 *
 * Round 12 c4 (hand, n14 twice): a ring with the note "lime badge NEW" was read
 * as a depiction of a badge; its outline became a path and the page got a
 * faint brown disc. A box round detail rows with "white rows panel" became a
 * default white rounded card with a shadow, or a pale wash. A person who draws
 * a ring and types "lime badge" means one thing: a solid lime circle exactly
 * there, its words inside. So the mark is flagged `solid` from the words typed
 * on it, it stays a clean shape (never an ink path), codegen is told the plain
 * element, its shape and its colour family on the mark, and the built page is
 * checked: some element over the mark paints that colour, opaque, at about
 * the drawn size. Colour words are eyeballed, so the check is a colour family
 * (a generous distance from a reference), not a hex. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { deltaE, hexOf, parseCssColor, type Rgb } from './palette.js'

/** Eyeball colour words → a reference and how far a built colour may sit from it. */
const COLOURS: Record<string, { hex: string; tol: number }> = {
  white: { hex: '#ffffff', tol: 8 }, 'off-white': { hex: '#f6f4ee', tol: 10 }, cream: { hex: '#f3ead8', tol: 14 },
  ivory: { hex: '#f8f5e9', tol: 12 }, beige: { hex: '#e8dcc4', tol: 16 },
  black: { hex: '#111111', tol: 14 }, charcoal: { hex: '#2b2b2b', tol: 16 }, navy: { hex: '#1b2a4e', tol: 22 },
  grey: { hex: '#9ca3af', tol: 28 }, gray: { hex: '#9ca3af', tol: 28 },
  lime: { hex: '#c3f53c', tol: 30 }, green: { hex: '#22a55a', tol: 34 }, mint: { hex: '#a7f3d0', tol: 24 },
  teal: { hex: '#14b8a6', tol: 28 }, cyan: { hex: '#22d3ee', tol: 28 }, blue: { hex: '#2563eb', tol: 34 },
  sky: { hex: '#7dd3fc', tol: 26 }, indigo: { hex: '#4f46e5', tol: 28 }, violet: { hex: '#8b5cf6', tol: 30 },
  purple: { hex: '#9333ea', tol: 32 }, pink: { hex: '#ec4899', tol: 32 }, magenta: { hex: '#d946ef', tol: 30 },
  red: { hex: '#e53935', tol: 32 }, coral: { hex: '#ff6f61', tol: 26 }, orange: { hex: '#f97316', tol: 30 },
  amber: { hex: '#f59e0b', tol: 26 }, yellow: { hex: '#facc15', tol: 30 }, gold: { hex: '#d4a72c', tol: 26 },
  brown: { hex: '#7c4a2a', tol: 28 },
}
// a plain thing a person draws as a ring or a box
const THING = /\b(badge|pill|chip|tag|sticker|dot|disc|disk|circle|button|btn|panel|card|tile|plate|block|bar|label|stamp|seal|token|avatar)\b/i
// words that mean the colour is the ink of letters, a border, a glow, or the page: not this shape's fill
const NOT_FILL = /\b(text|letters|words|type|font|outline|outlined|border|stroke|ring of|glow|halo|shadow|page|background|bg)\b/i

export interface Solid { word: string; hex: string; noun: string; tol: number; tapped?: boolean }

/** "lime badge NEW" → {word: lime, noun: badge}; null when the note gives no fill colour for a plain thing. */
export function solidOf(text: string): Solid | null {
  const t = ` ${text.toLowerCase()} `
  // a glass card or a glow is see-through on purpose: not a solid fill
  if (/\b(glass|frosted|translucent|transparent|see-through|blurred|blurry|glow|glowing|ghost)\b/.test(t)) return null
  const noun = THING.exec(t)
  if (!noun) return null
  // the colour word nearest before the noun (within a few words), else anywhere after "in"
  const before = t.slice(0, noun.index)
  let best: { word: string; at: number } | null = null
  for (const w of Object.keys(COLOURS)) {
    const re = new RegExp(`\\b${w}\\b`, 'g')
    for (const m of before.matchAll(re)) if (!best || m.index! > best.at) best = { word: w, at: m.index! }
  }
  if (best) {
    const gap = before.slice(best.at + best.word.length)
    if (gap.split(/\s+/).filter(Boolean).length > 3 || /[,;.]/.test(gap)) best = null
    else if (NOT_FILL.test(gap)) best = null
  }
  if (!best) {
    const after = t.slice(noun.index + noun[0].length, noun.index + noun[0].length + 30)
    const m = /^\s*(?:in|filled|of)\s+(?:\w+\s+)?([a-z-]+)\b/.exec(after)
    if (m && COLOURS[m[1]!]) best = { word: m[1]!, at: -1 }
  }
  if (!best) return null
  // "white text on a dark pill": the colour words are about the letters
  if (/\b(text|letters|type|font)\b/.test(t.slice(best.at + best.word.length, noun.index))) return null
  const c = COLOURS[best.word]!
  return { word: best.word, hex: c.hex, noun: noun[1]!, tol: c.tol }
}

interface NoteLike { text: string; focus?: string[] }

/** Flag rings and boxes whose own notes name a coloured plain thing (in place). Area boxes stay areas. */
export function markSolids(marks: ShapeMark[], notes: NoteLike[]): void {
  const closed = marks.filter((m) => m.shape === 'box' || m.shape === 'ellipse')
  for (const m of closed) {
    if (m.area || m.solid || m.glyph) continue
    const own = notes.filter((n) => n.focus?.includes(m.strokeId))
    const said = own.length ? own : closed.length === 1 ? notes.filter((n) => !n.focus?.length || n.focus.includes(m.strokeId)) : []
    for (const n of said) {
      const s = solidOf(n.text)
      if (s) { m.solid = s; break }
    }
  }
}

/** n30: no note anywhere asks for a glow, blur or see-through shape, so a tapped ring may be a solid disc. */
export function tapSolidsAllowed(texts: string[]): boolean {
  return !texts.some((t) => /\b(glass|frosted|translucent|transparent|see-through|blur|blurred|blurry|glow|glows|glowing|haze|hazy|soft light)\b/i.test(t))
}

/**
 * n30: a ring coloured in with a tap is a plain disc in exactly that colour (in place). Round 31 e4: a
 * sun drawn as two rings, a yellow tap inside and a grey-blue tap on the halo, came out a grey lopsided
 * blob. The tap states the colour exactly, so the check is tight; a ring inside another ring is told it
 * sits on top, centred where drawn.
 */
export function markTappedSolids(
  marks: ShapeMark[],
  inkColours: Array<{ strokeId: string; color: string; how: 'tap' | 'pen'; paint: 'background' | 'text' }>,
): void {
  for (const m of marks) {
    if (m.shape !== 'ellipse' || m.area || m.solid || m.glyph) continue
    const tap = inkColours.filter((c) => c.strokeId === m.strokeId && c.how === 'tap' && c.paint === 'background').pop()
    if (!tap) continue
    const p = parseCssColor(tap.color)
    if (!p) continue
    const hex = hexOf(p)
    m.solid = { word: hex, hex, noun: 'disc', tol: 6, tapped: true }
  }
}

export function solidsBrief(actions: Array<{ shapeMarks?: ShapeMark[]; inkColours?: Array<{ box: BBox }> }>): string {
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (!m.solid) continue
      const b = m.box
      const ring = m.shape === 'ellipse'
      if (m.solid.tapped) {
        const inside = (a.shapeMarks ?? []).find((o) => o !== m && o.solid?.tapped && o.box.w > b.w && o.box.x <= b.x + 4 && o.box.y <= b.y + 4 &&
          o.box.x + o.box.w >= b.x + b.w - 4 && o.box.y + o.box.h >= b.y + b.h - 4)
        lines.push(
          `- action ${i}: the ring drawn at (${b.x},${b.y}) ${b.w}x${b.h} was coloured in with a tap: ONE plain disc exactly that size at exactly that place ` +
          `(a div with border-radius 50%, width ${b.w}px, height ${b.h}px), background ${m.solid.hex} exactly, fully opaque; no svg, no path, no blob, no blur, ` +
          `no opacity, no gradient${inside ? `; it sits on top of the bigger disc drawn at (${inside.box.x},${inside.box.y}) ${inside.box.w}x${inside.box.h}, centred where drawn, so that disc shows round it as a ring` : ''}.`,
        )
        continue
      }
      lines.push(
        `- action ${i}: the ${ring ? 'ring' : 'box'} drawn at (${b.x},${b.y}) ${b.w}x${b.h} is a plain ${m.solid.word} ${m.solid.noun}: ` +
        `ONE element exactly that size at exactly that place, ${ring ? 'a circle (border-radius 50%)' : 'a rectangle with at most slightly rounded corners'}, ` +
        `background a clear, fully opaque ${m.solid.word} (about ${m.solid.hex}), no opacity, blur, gradient, svg path or wash; ` +
        `${/panel|card|tile|plate|block/.test(m.solid.noun) ? 'no shadow unless asked; its rows and words sit inside it' : 'its words sit centred inside it in a colour that reads on it'}.`,
      )
    }
  })
  return lines.length
    ? `PLAIN SHAPES IN A COLOUR (deterministic, from the drawn ring or box and the colour and thing typed on it; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

interface NodeLike {
  id: string; tag: string; parent: string | null; rect: BBox
  style: { backgroundColor: string; backgroundImage?: string; opacity?: string; filter?: string }
}
interface Snap { nodes: NodeLike[]; viewport: { w: number; h: number }; truncated?: boolean }
export interface SolidVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

function alphaOf(css: string): number {
  const m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(css) ?? /\/\s*([\d.]+%?)\s*\)/.exec(css)
  if (!m) return 1
  return m[1]!.endsWith('%') ? Number(m[1]!.slice(0, -1)) / 100 : Number(m[1])
}
const overlap = (a: BBox, b: BBox) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Each solid mark has an element over it painting its colour family, opaque, at about the drawn size. */
export function verifySolids(marks: ShapeMark[], after: Snap): SolidVerdict {
  const solids = marks.filter((m) => m.solid)
  if (!solids.length) return { satisfied: true, unverifiable: true, reason: 'no coloured plain shapes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  // an element's effective opacity: its own times its ancestors'
  const opacity = (n: NodeLike | undefined) => {
    let o = 1
    for (let d = 0; n && d < 20; d++) { o *= n.style.opacity ? Number(n.style.opacity) : 1; n = n.parent ? byId.get(n.parent) : undefined }
    return o
  }
  const faults: string[] = []
  let ok = 0
  for (const m of solids) {
    const s = m.solid!, b = m.box, area = b.w * b.h
    const want = parseCssColor(s.hex)!
    let best: { de: number; n: NodeLike; faint: boolean } | null = null
    for (const n of after.nodes) {
      const a = n.rect.w * n.rect.h
      if (!a || a > area * 2.6 || a < area * 0.3) continue
      const ov = overlap(n.rect, b)
      if (ov < area * 0.4 || ov < a * 0.5) continue
      const css = [n.style.backgroundColor, ...(n.style.backgroundImage?.match(/(?:rgba?|oklch|oklab|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? [])]
      for (const c of css) {
        const g = parseCssColor(c)
        if (!g) continue
        const faint = alphaOf(c) * opacity(n) < 0.7 || /blur\(\s*[1-9]/.test(n.style.filter ?? '')
        const de = deltaE(want, g as Rgb)
        if (!best || (best.faint && !faint) || (best.faint === faint && de < best.de)) best = { de, n, faint }
      }
    }
    const what = s.tapped
      ? `the ring drawn at (${b.x},${b.y}) ${b.w}x${b.h}, tapped ${s.hex}`
      : `the ${m.shape === 'ellipse' ? 'ring' : 'box'} drawn at (${b.x},${b.y}) ${b.w}x${b.h} with "${s.word} ${s.noun}"`
    if (!best) {
      faults.push(`${what} has no element of about that size painting a fill there: build it as one ${s.word} element exactly at that box` +
        `${m.shape === 'ellipse' ? ', border-radius 50%' : ''}, opaque`)
    } else if (best.de > s.tol) {
      faults.push(`${what} is built as a ${hexOf(parseCssColor(best.n.style.backgroundColor) ?? want)} <${best.n.tag}>, not ${s.word}: ` +
        `give it a clear opaque ${s.word} background (about ${s.hex}); change nothing else`)
    } else if (best.faint) {
      faults.push(`${what} is ${s.word} but faint (low opacity or blur): make it fully opaque and sharp; change nothing else`)
    } else ok++
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${ok} coloured plain shape${ok > 1 ? 's' : ''} built solid in their colour` }
}
