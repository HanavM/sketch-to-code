/**
 * n182 (round 43 e4 pets): "pet cards: tinted picture top (peach, sage, blue, lilac), ..." named four soft tints, and
 * the builder picked its own value for each word every run: one run pastel, the next saturated mint and yellow. A
 * colour WORD goes through the model and comes back as whatever it likes (see palette.ts); so a bracketed list of
 * colour words in a note that asks for tints (tinted, pastel, soft, pale, light, muted) is read here into fixed soft
 * values, in the typed order, cycling over the repeated items, and the page is checked for them after the build.
 *
 * The values are one general table of soft tints by name, the same for every page; nothing here is per page.
 */
import { deltaE, hexOf, parseCssColor, type Rgb } from './palette.js'

/** Soft, slightly muted tints by colour word: light enough for dark text on them, never neon. */
const SOFT: Record<string, string> = {
  peach: '#f3dccd', apricot: '#f5dcc6', coral: '#f4d3cb', salmon: '#f4d5cc', orange: '#f6dcc4', tangerine: '#f6dcc4',
  sage: '#dce6d5', olive: '#e3e5cf', green: '#d8e8d4', mint: '#d6eee2', teal: '#d2e7e5', aqua: '#d3ecee', turquoise: '#d1ebe8',
  blue: '#d7e1ee', sky: '#d6e8f4', navy: '#d5dbe8', denim: '#d6dfeb', periwinkle: '#dcdff3',
  lilac: '#e6dcea', lavender: '#e4def2', purple: '#e2d8ec', violet: '#e3dbf0', plum: '#e8d9e6', mauve: '#ead9e1',
  pink: '#f4dbe2', rose: '#f2d8dc', blush: '#f5dfe0', red: '#f2d6d4', cherry: '#f2d4d6',
  yellow: '#f6ecc8', lemon: '#f6f0c8', butter: '#f6ecca', mustard: '#efe2c0', gold: '#f1e4c2', amber: '#f3e1c3',
  cream: '#f5efe0', sand: '#eee4d2', beige: '#efe6d6', tan: '#ece0cc', stone: '#e8e4dc', taupe: '#e6dfd8',
  grey: '#e6e6e6', gray: '#e6e6e6', slate: '#dfe3e8', brown: '#eadfd4', clay: '#efdcd0', terracotta: '#f1d8cc',
}
const TINT_WORD = /\b(tint(?:ed|s)?|pastel|soft|pale|light|muted|washed)\b/i

export interface TintList { note: string; words: string[]; hexes: string[] }

/** A note asking for tints with a bracketed (or colon) list of 2+ colour words → those words and their soft values. */
export function tintListOf(note: string): TintList | null {
  if (!TINT_WORD.test(note)) return null
  const lists = [...note.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]!)
  const colon = /\btints?\s*:\s*([^;.]+)/i.exec(note)
  if (colon) lists.push(colon[1]!)
  for (const l of lists) {
    const parts = l.split(/,|\band\b|\//).map((p) => p.trim().toLowerCase()).filter(Boolean)
    const words = parts.map((p) => p.replace(/^(soft|pale|light|pastel|muted|dusty)\s+/, ''))
    if (words.length >= 2 && words.every((w) => SOFT[w])) return { note, words, hexes: words.map((w) => SOFT[w]!) }
  }
  return null
}

export function tintBrief(notes: readonly string[]): string {
  const lines: string[] = []
  for (const n of new Set(notes)) {
    const t = tintListOf(n)
    if (!t) continue
    lines.push(`- "${n}": the tints are EXACTLY ${t.words.map((w, i) => `${w} ${t.hexes[i]}`).join(', ')}, in that order, item 1 the first colour, ` +
      `item 2 the second, and so on, starting again from the first after the last (so with ${t.words.length} colours, item ${t.words.length + 1} is ${t.words[0]} again). ` +
      `Use these values as given: soft, slightly muted tints, never a brighter, more saturated or different hue (sage is a grey green, never mint; peach is never yellow). Never print the colour words.`)
  }
  return lines.length ? `NAMED TINTS (deterministic, from the typed colour words; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

interface NodeLike { id: string; text?: string; rect?: { x: number; y: number; w: number; h: number }; style?: { backgroundColor?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface TintVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const chroma = (c: Rgb) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)

/**
 * The tinted blocks on the page: filled boxes at least 60x40 whose fill is a colour (not white, grey or near-black).
 * Each named tint must be on some block; and blocks the size of the tinted ones whose fill is far from every named
 * tint (a saturated mint for sage) are faults, named with the tint they should have been.
 */
export function verifyTints(notes: readonly string[], after: Snap): TintVerdict {
  const lists = [...new Set(notes)].map(tintListOf).filter((t): t is TintList => !!t)
  if (!lists.length) return { satisfied: true, unverifiable: true, reason: 'no named tints typed' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const blocks = after.nodes.flatMap((n) => {
    const c = parseCssColor(n.style?.backgroundColor ?? '')
    if (!c || !n.rect || n.rect.w < 60 || n.rect.h < 40) return []
    if (/rgba\([^)]*,\s*0(?:\.0*)?\s*\)/.test(n.style?.backgroundColor ?? '')) return []
    if (chroma(c) < 10 || (c.r + c.g + c.b) / 3 < 90) return []
    return [{ n, c }]
  })
  if (!blocks.length) return { satisfied: false, reason: `none of the named tints (${lists.flatMap((l) => l.words).join(', ')}) is on the page: fill each item with its tint as given, changing nothing else` }
  const faults: string[] = []
  for (const t of lists) {
    const named = t.hexes.map((h) => parseCssColor(h)!)
    const near = (c: Rgb) => Math.min(...named.map((x) => deltaE(c, x)))
    const missing = t.words.filter((w, i) => !blocks.some((b) => deltaE(b.c, named[i]!) <= 5))
    // blocks shaped like the ones that did land (same size, within 12px): those are the tinted items
    const hits = blocks.filter((b) => near(b.c) <= 5)
    const items = hits.length ? blocks.filter((b) => hits.some((h) => Math.abs(h.n.rect!.w - b.n.rect!.w) <= 12 && Math.abs(h.n.rect!.h - b.n.rect!.h) <= 12)) : blocks
    const off = items.filter((b) => near(b.c) > 5)
    if (missing.length || off.length) {
      const offWords = off.slice(0, 3).map((b) => hexOf(b.c)).join(', ')
      faults.push(`the tints for "${t.note.slice(0, 50)}" drifted${off.length ? ` (${off.length} items filled ${offWords})` : ''}${missing.length ? `; ${missing.join(', ')} not on the page` : ''}: fill the items in order, cycling, with exactly ${t.words.map((w, i) => `${w} ${t.hexes[i]}`).join(', ')}, changing nothing else`)
    }
  }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${lists.flatMap((l) => l.words).length} named tints on the page as given` }
}
