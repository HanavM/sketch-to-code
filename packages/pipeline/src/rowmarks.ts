/**
 * A colour note about small marks in rows colours only those marks (n84).
 *
 * Round 35 e3 (workout log, n82/n83): the table card was typed "green dot at row end for 1-3, empty ring for
 * 4-5" and "all cards dark grey on near black page". Both first builds painted the whole table card bright green
 * (the colour word was read as the card's fill, since the note sat on the card) and rows 1-3 got no dots; only the
 * empty rings of rows 4-5 were built.
 *
 * A person who names a small mark (dot, ring, tick, star, icon) with a colour and the rows it belongs to is talking
 * about those marks, not the block they sit in. Here: such a note is read as a list of row marks (which mark, its
 * colour, filled or empty, which rows, which end of the row). The build is told that each named row gets its mark
 * at that end, and that the colour words colour only the marks: the card round them keeps its own colour. Checked
 * on the page: no big block is painted the marks' colour, and the named rows carry small marks in it. Zero tokens.
 */
import { parseCssColor, type Rgb } from './palette.js'

export interface RowMark {
  /** The noun typed: dot, ring, tick, star... */
  mark: string
  /** Colour word typed for it, or null. */
  colour: string | null
  /** An empty ring / outline mark (no fill). */
  empty: boolean
  /** Rows it belongs to (1-based), or 'all'. */
  rows: number[] | 'all'
  /** Which end of the row it sits at. */
  side: 'end' | 'start'
}
export interface RowMarkNote { note: string; marks: RowMark[] }

const COLOURS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'magenta', 'grey', 'gray', 'white', 'black']
const MARK = /\b(dots?|rings?|circles?|ticks?|checks?|checkmarks?|stars?|icons?|badges?|bullets?|pips?|blobs?)\b/i
const EMPTY = /\b(empty|hollow|outlined?|outline|open|unfilled|blank)\b/i
const NUMW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const num = (s: string) => (/^\d/.test(s) ? Number(s) : NUMW[s.toLowerCase()] ?? NaN)
const N = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)'
const RANGE = new RegExp(`\\b(?:for|on|in|rows?|row)\\s+(?:rows?\\s+)?${N}\\s*(?:-|–|to|through)\\s*${N}\\b`, 'i')
const LIST = new RegExp(`\\b(?:for|on|in|rows?|row)\\s+(?:rows?\\s+)?${N}((?:\\s*(?:,|and|&)\\s*${N})*)\\b`, 'i')
const ALL = /\b(every|each|all)\s+rows?\b|\bper row\b|\bon each\b/i
const ROWWORD = /\brows?\b|\brow end\b|\bend of (?:the |each |every )?row/i
const START = /\b(row start|start of (?:the |each |every )?row|left end|at the left|on the left)\b/i

function rowsOf(seg: string): number[] | 'all' | null {
  const r = seg.match(RANGE)
  if (r) {
    const a = num(r[1]!), b = num(r[2]!)
    if (a >= 1 && b >= a && b - a < 30) return Array.from({ length: b - a + 1 }, (_, k) => a + k)
  }
  const l = seg.match(LIST)
  if (l) {
    const first = num(l[1]!)
    const rest = [...(l[2] ?? '').matchAll(new RegExp(N, 'gi'))].map((m) => num(m[1]!))
    const all = [first, ...rest].filter((x) => x >= 1 && x <= 40)
    if (all.length) return all
  }
  if (ALL.test(seg)) return 'all'
  return null
}

/** The row marks a note names, or null when it names none. */
export function rowMarksOf(note: string): RowMarkNote | null {
  if (!MARK.test(note) || !ROWWORD.test(note) && !RANGE.test(note)) return null
  const segs = note.split(/[,;]|\s+\band\b\s+(?=\S*\s*(?:empty|hollow|green|red|grey|gray|blue|orange|yellow|white|black|dot|ring))/i).map((s) => s.trim()).filter(Boolean)
  const marks: RowMark[] = []
  let side: 'end' | 'start' = START.test(note) ? 'start' : 'end'
  for (const seg of segs) {
    const m = seg.match(MARK)
    if (!m) continue
    const rows = rowsOf(seg) ?? (marks.length ? null : ALL.test(note) ? 'all' : null)
    if (!rows) continue
    const colour = COLOURS.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(seg)) ?? null
    const noun = m[1]!.toLowerCase().replace(/s$/, '')
    const empty = EMPTY.test(seg) || (/^(ring|circle)$/.test(noun) && !colour && !/\bfilled|solid\b/i.test(seg))
    if (START.test(seg)) side = 'start'
    marks.push({ mark: noun, colour, empty, rows, side })
  }
  if (!marks.length) return null
  for (const k of marks) k.side = side
  return { note, marks }
}

export function rowMarksAll(notes: readonly string[]): RowMarkNote[] {
  const seen = new Set<string>()
  return notes.map(rowMarksOf).filter((d): d is RowMarkNote => !!d && !seen.has(d.note) && !!seen.add(d.note))
}

const q = (s: string) => `"${s}"`
const rowsText = (r: number[] | 'all') => r === 'all' ? 'every row' : r.length === 1 ? `row ${String(r[0])}` : `rows ${r.join(', ')}`

export function rowMarksBrief(notes: readonly string[]): string {
  const found = rowMarksAll(notes)
  if (!found.length) return ''
  const lines = found.slice(0, 8).map((d) => {
    const each = d.marks.map((k) => `${rowsText(k.rows)}: ${k.empty ? `an EMPTY ${k.mark} (about 16px, a 2px ${k.colour ?? 'muted grey'} border, no fill)` : `a FILLED ${k.colour ?? ''} ${k.mark} (about 14-16px, solid ${k.colour ?? 'colour'})`.replace(/\s+/g, ' ')}`).join('; ')
    const cols = [...new Set(d.marks.map((k) => k.colour).filter((c): c is string => !!c))]
    return `- ${q(d.note)}: small marks at the ${d.marks[0]!.side === 'start' ? 'START (left end)' : 'END (right end, past the last value)'} of each named row, vertically centred on that row: ${each}. ` +
      `Rows count from the first data row under any header row.` +
      (cols.length ? ` The colour word${cols.length > 1 ? 's' : ''} ${cols.map(q).join(', ')} colour ONLY these small marks: the card, table, rows and text round them keep their own colour (as typed for them, else a step off the page) and are never ${cols.join(' or ')}.` : '')
  })
  return `SMALL MARKS IN ROWS (deterministic; checked on the page). A note naming a small mark (dot, ring, tick) for some rows is about those marks, not the block it sits in:\n${lines.join('\n')}\nEach mark is its own element (a span or div with its own background or border, not an SVG, not a text glyph like ● or ○).\n\n`
}

// ---- check -------------------------------------------------------------------------------------------------

interface NodeLike { id: string; tag?: string; rect: { x: number; y: number; w: number; h: number }; text?: string; style?: { backgroundColor?: string; border?: string; color?: string }; parent?: string | null }
interface Snap { nodes: NodeLike[]; truncated?: boolean; viewport?: { w: number; h: number } }
export interface RowMarkVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

function hsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) * 60 : max === G ? ((B - R) / d + 2) * 60 : ((R - G) / d + 4) * 60
  return { h, s, l }
}
const HUES: Record<string, [number, number]> = {
  red: [345, 15], orange: [15, 40], amber: [35, 50], yellow: [45, 65], lime: [65, 100], green: [85, 165], emerald: [130, 170],
  teal: [160, 195], cyan: [175, 200], sky: [190, 215], blue: [200, 250], indigo: [225, 265], violet: [250, 290], purple: [260, 300],
  pink: [300, 350], magenta: [290, 330],
}
/** Is a CSS colour of the named hue family (chromatic names only)? */
export function isColourOf(css: string | undefined, name: string): boolean {
  const range = HUES[name]
  if (!css || !range) return false
  const c = parseCssColor(css)
  if (!c || /rgba\([^)]*,\s*0\)$/.test(css.replace(/\s+/g, ' '))) return false
  const { h, s, l } = hsl(c)
  if (s < 0.3 || l < 0.15 || l > 0.9) return false
  const [a, b] = range
  return a <= b ? h >= a && h <= b : h >= a || h <= b
}
const borderColour = (b?: string) => b?.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0]

/** The marks' colour reached small marks only, never a big block, and the named rows carry their marks. */
export function verifyRowMarks(notes: readonly string[], after: Snap): RowMarkVerdict {
  const found = rowMarksAll(notes)
  if (!found.length) return { satisfied: true, unverifiable: true, reason: 'no row marks' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const d of found) {
    for (const k of d.marks) {
      if (!k.colour || !HUES[k.colour]) continue
      judged++
      const said = notes.some((n) => n !== d.note && !rowMarksOf(n) && new RegExp(`\\b${k.colour}\\b`, 'i').test(n))
      const big = said ? [] : after.nodes.filter((n) => n.rect.w >= 160 && n.rect.h >= 80 && isColourOf(n.style?.backgroundColor, k.colour!))
      if (big.length) {
        const b = big.sort((x, y) => y.rect.w * y.rect.h - x.rect.w * x.rect.h)[0]!.rect
        faults.push(`a block at (${Math.round(b.x)},${Math.round(b.y)}) ${Math.round(b.w)}x${Math.round(b.h)} is painted ${k.colour}: ${q(d.note)} colours only the small ${k.mark}s in the rows; give that block its own colour (as typed for it, else a step off the page behind it) and keep ${k.colour} for the ${k.mark}s`)
      }
      const small = after.nodes.filter((n) => n.rect.w >= 6 && n.rect.w <= 32 && n.rect.h >= 6 && n.rect.h <= 32 && Math.abs(n.rect.w - n.rect.h) <= 8 &&
        (k.empty ? isColourOf(borderColour(n.style?.border), k.colour!) : isColourOf(n.style?.backgroundColor, k.colour!)))
      const want = k.rows === 'all' ? 2 : k.rows.length
      // rows with their own mark: marks at distinct heights
      const ys = [...new Set(small.map((n) => Math.round((n.rect.y + n.rect.h / 2) / 12)))]
      if (ys.length < want) faults.push(`${rowsText(k.rows)} should each carry a ${k.empty ? 'hollow' : 'filled'} ${k.colour} ${k.mark} (about 14-16px, its own element) at the row's ${k.side === 'start' ? 'left' : 'right'} end; found ${String(ys.length)}`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no coloured row marks' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '; change nothing else' }
    : { satisfied: true, reason: 'row marks in their colour, the block round them not' }
}
