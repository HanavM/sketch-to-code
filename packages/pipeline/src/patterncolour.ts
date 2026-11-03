/**
 * A drawn pattern's named colours are flat and those colours (n219).
 *
 * Round 41 c4 (chess night, n218 try 2): "checkerboard: black and cream squares, 4 across, 7 down" came back with its
 * cream squares as grey fades, darker at the top, and nothing noticed: layout fell to 59 and likeness to 74.9, against
 * 85.7 for the build that kept them cream. A colour word on one solid box is checked (solids.ts); two colour words on a
 * repeating pattern were not.
 *
 * Here a note that names 2+ colours for a pattern (checkerboard, stripes, squares, tiles, polka dots, a pattern) tells
 * the build each cell is one flat colour with no fading, using the sketch's own ink where a named colour matches it,
 * and the page is checked: cells faded, see-through or off those colours, and a wash laid over them, are faults a
 * repair can act on. Colour words are eyeballed, so the check is a colour family, as in solids.ts. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { deltaE, hexOf, parseCssColor, type Rgb } from './palette.js'
import { COLOURS } from './solids.js'

const PATTERN = /\b(checker(?:board|ed)?|chequer(?:board|ed)?|stripes?|striped|squares|tiles|polka(?:\s*dots?)?|pattern)\b/i
const WORDS = Object.keys(COLOURS).sort((a, b) => b.length - a.length).join('|')
const PAIR = new RegExp(`\\b(${WORDS})\\b((?:\\s*(?:,|/|&|\\band\\b|\\bon\\b)\\s*(?:${WORDS})\\b)+)(?:\\s+(\\w+))?`, 'gi')

export interface PatternColour { note: string; words: string[]; region: BBox | null }
interface NodeLike {
  id: string; tag?: string; text?: string; parent?: string | null; rect: BBox
  style?: { backgroundColor?: string; backgroundImage?: string; opacity?: string; svgFill?: string }
}
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface PatternVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }
type InkLike = { strokeId: string; paint: string; color: string; box: BBox }
type ActionLike = { notes?: string[]; region?: BBox; shapeMarks?: Array<{ shape?: string; box: BBox; words?: string }>; inkColours?: InkLike[] }

/** The colour words a note gives a pattern ("black and cream squares", "checkerboard: black and cream"); null otherwise. */
export function patternColours(note: string): string[] | null {
  for (const clause of note.split(/[;.]/)) {
    if (!PATTERN.test(clause)) continue
    for (const m of clause.matchAll(PAIR)) {
      // the pattern word sits right after the colours, or the colours follow the pattern word; a "black and white card" beside the word "pattern" further on is not it
      const after = m[3] ?? ''
      const before = clause.slice(0, m.index)
      if (!PATTERN.test(after) && !PATTERN.test(before)) continue
      const words = [...`${m[1]!}${m[2]!}`.toLowerCase().matchAll(new RegExp(`\\b(?:${WORDS})\\b`, 'g'))].map((w) => w[0]).filter((w, i, a) => a.indexOf(w) === i)
      if (words.length >= 2) return words
    }
  }
  return null
}

/** Patterns in the sketch; each sits in its action's biggest drawn box when it has one. */
export function patternsOf(actions: readonly ActionLike[], loose: readonly string[] = []): PatternColour[] {
  const out: PatternColour[] = []
  const seen = new Set<string>()
  for (const a of actions) {
    for (const note of [...(a.notes ?? []), ...(a.shapeMarks ?? []).flatMap((m) => (m.words ? [m.words] : []))]) {
      const words = patternColours(note)
      if (!words || seen.has(note)) continue
      seen.add(note)
      // a pattern's box may be read as a plain box or as a drawn outline
      const boxes = [...(a.shapeMarks ?? []).filter((m) => m.shape === 'box').map((m) => m.box), ...(a.inkColours ?? []).filter((c) => c.paint === 'background').map((c) => c.box)].sort((p, q) => q.w * q.h - p.w * p.h)
      out.push({ note, words, region: boxes[0] ?? a.region ?? null })
    }
  }
  for (const note of loose) {
    const words = patternColours(note)
    if (!words || seen.has(note)) continue
    seen.add(note)
    out.push({ note, words, region: null })
  }
  return out
}

/**
 * The box a pattern's note is on takes no one fill of its own: its pen colour says how the ink was drawn, and being told
 * to fill the block with black at full strength fights the note. In the grey build a black panel was the likely reason the
 * cream squares turned to see-through fades over it (told "#151515 ... never fade it" and "black and cream squares").
 */
export function patternStrokes(actions: readonly ActionLike[]): Set<string> {
  const out = new Set<string>()
  for (const a of actions) {
    const typed = [...(a.notes ?? []), ...(a.shapeMarks ?? []).flatMap((m) => (m.words ? [m.words] : []))]
    const words = typed.map(patternColours).find((w) => !!w)
    if (!words) continue
    for (const c of a.inkColours ?? []) {
      const p = parseCssColor(c.color)
      if (c.paint === 'background' && p && words.some((w) => deltaE(p, parseCssColor(COLOURS[w]!.hex)!) <= COLOURS[w]!.tol)) out.add(c.strokeId)
    }
  }
  return out
}

/** A named colour's value: the sketch's own ink when one is that colour (a cream page, a black pen), else its reference. */
function valueOf(word: string, ink: readonly string[]): string {
  const c = COLOURS[word]!
  const ref = parseCssColor(c.hex)!
  const hit = ink.map((h) => ({ h, p: parseCssColor(h) })).filter((x) => x.p && deltaE(x.p, ref) <= c.tol).sort((p, q) => deltaE(p.p!, ref) - deltaE(q.p!, ref))[0]
  return hit ? hexOf(hit.p!) : c.hex
}

export function patternBrief(patterns: readonly PatternColour[], ink: readonly string[] = []): string {
  if (!patterns.length) return ''
  return `PATTERN COLOURS (from the typed colour words; checked on the page):\n${patterns.map((p) =>
    `- "${p.note}": every cell is one flat solid colour, exactly ${p.words.map((w) => `${w} ${valueOf(w, ink)}`).join(' or ')}, the same value in every cell of that colour. ` +
    `No opacity, no gradient, no shading from cell to cell or top to bottom, no overlay or wash over the pattern, and no third colour between them.`).join('\n')}\n\n`
}

const alphaOf = (c: string | undefined) => {
  const m = /^\s*rgba?\(([^)]*)\)/i.exec(c ?? '')
  const parts = m ? m[1]!.trim().split(/[\s,/]+/) : []
  if (parts.length < 4) return 1
  return parts[3]!.endsWith('%') ? parseFloat(parts[3]!) / 100 : Number(parts[3])
}
const paintedBg = (n: NodeLike) => { const b = n.style?.backgroundColor; return b && alphaOf(b) > 0 && b !== 'transparent' ? b : null }
const STOP = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi

/**
 * Each pattern on the page, judged by its cells: at least 4 small painted pieces inside its box (or, with no box, 4+ of
 * one size). A pattern built as one element's repeating gradient is judged by the gradient's colours. Cells named in
 * one colour alone are fine when the other shows from behind them; a colour is missing only when nothing paints it.
 */
export function verifyPatternColours(patterns: readonly PatternColour[], after: Snap): PatternVerdict {
  if (!patterns.length) return { satisfied: true, unverifiable: true, reason: 'no pattern colours typed' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const opacityOf = (n: NodeLike) => { let o = 1; for (let c: NodeLike | undefined = n, g = 0; c && g < 40; c = c.parent ? byId.get(c.parent) : undefined, g++) { const v = Number(c.style?.opacity ?? 1); if (Number.isFinite(v)) o *= v } return o }
  const faults: string[] = []
  let judged = 0
  for (const p of patterns) {
    const named = p.words.map((w) => ({ w, c: parseCssColor(COLOURS[w]!.hex)!, tol: COLOURS[w]!.tol }))
    const near = (c: Rgb) => named.find((x) => deltaE(c, x.c) <= x.tol)
    const inside = (n: NodeLike, r: BBox) => n.rect.x >= r.x - 8 && n.rect.y >= r.y - 8 && n.rect.x + n.rect.w <= r.x + r.w + 8 && n.rect.y + n.rect.h <= r.y + r.h + 8
    const r = p.region
    const area = r ? r.w * r.h : Infinity
    const small = after.nodes.filter((n) => {
      const s = n.rect.w * n.rect.h
      return s >= 36 && !(n.text ?? '').trim() && (!r || (inside(n, r) && s < area * 0.5)) && (n.style?.svgFill || paintedBg(n))
    })
    let cells = small
    if (!r) {
      const sizes = new Map<string, NodeLike[]>()
      for (const n of small) { const k = `${String(Math.round(n.rect.w / 4))}x${String(Math.round(n.rect.h / 4))}`; sizes.set(k, [...(sizes.get(k) ?? []), n]) }
      cells = [...sizes.values()].sort((a, b) => b.length - a.length)[0] ?? []
    }
    const bad: string[] = []
    const seen = new Set<string>()
    if (cells.length >= 4) {
      judged++
      let faded = 0, gradient = 0
      const off = new Map<string, number>()
      for (const n of cells) {
        const paint = n.style?.svgFill ?? paintedBg(n)!
        const c = parseCssColor(paint)
        if (opacityOf(n) < 0.95 || alphaOf(paint) < 0.95) { faded++; continue }
        if (/gradient\(/i.test(n.style?.backgroundImage ?? '')) { gradient++; continue }
        if (!c) continue
        const hit = near(c)
        if (hit) seen.add(hit.w)
        else off.set(hexOf(c), (off.get(hexOf(c)) ?? 0) + 1)
      }
      if (faded) bad.push(`${String(faded)} cells are see-through or faded`)
      if (gradient) bad.push(`${String(gradient)} cells paint a gradient`)
      const offN = [...off.values()].reduce((a, b) => a + b, 0)
      // a stray piece or two in the box may be something else; the pattern's own cells are many
      if (offN >= Math.max(2, cells.length * 0.15)) bad.push(`${String(offN)} cells are off those colours (${[...off.keys()].slice(0, 3).join(', ')})`)
      // a colour shown from behind the cells (the panel or the page) still counts as there
      for (const x of named) {
        if (seen.has(x.w) || faded) continue
        const behind = after.nodes.some((n) => { const b = parseCssColor(paintedBg(n) ?? ''); return !!b && deltaE(b, x.c) <= x.tol && alphaOf(n.style?.backgroundColor) >= 0.95 && !cells.includes(n) })
        if (!behind) bad.push(`${x.w} is not on it`)
      }
    } else {
      const flat = after.nodes.filter((n) => /repeating-|conic-gradient|linear-gradient/i.test(n.style?.backgroundImage ?? '') && (!r || (n.rect.w * n.rect.h >= area * 0.5 && inside(n, { x: r.x - 20, y: r.y - 20, w: r.w + 40, h: r.h + 40 }))))
      if (!flat.length) continue
      judged++
      const stops = flat.flatMap((n) => [...(n.style!.backgroundImage!.matchAll(STOP))].map((m) => m[0]))
      const off = stops.filter((s) => { const c = parseCssColor(s); return !c || alphaOf(s) < 0.95 || !near(c) })
      for (const s of stops) { const c = parseCssColor(s); const h = c && near(c); if (h) seen.add(h.w) }
      if (off.length) bad.push(`the gradient holds ${[...new Set(off)].slice(0, 3).join(', ')}`)
    }
    // a wash over the cells: a big piece over the box that lets them show through, or a fading gradient
    if (r) {
      const wash = after.nodes.filter((n) => n.rect.w * n.rect.h >= area * 0.5 && inside(n, { x: r.x - 20, y: r.y - 20, w: r.w + 40, h: r.h + 40 }) && !(n.text ?? '').trim() &&
        ((paintedBg(n) && alphaOf(n.style!.backgroundColor) < 0.95) || [...(n.style?.backgroundImage ?? '').matchAll(STOP)].some((m) => alphaOf(m[0]) < 0.95)))
      if (wash.length) bad.push('a see-through wash is laid over it')
    }
    if (bad.length) faults.push(`the pattern "${p.note.slice(0, 50)}" should be flat ${p.words.join(' and ')}: ${bad.join('; ')}. Give every cell exactly one of those colours, solid, with no opacity, gradient or overlay, changing nothing else`)
  }
  if (faults.length) return { satisfied: false, reason: faults.join('; ') }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'pattern cells not found as pieces of the page' }
  return { satisfied: true, reason: `${String(judged)} pattern${judged > 1 ? 's' : ''} flat in the named colours` }
}
