/**
 * A level line drawn in a colour is a bar; the words beside it stay dark (n121).
 *
 * Round 38 e3 (budget, n118-n120): six category bars were drawn as long level lines in orange, teal, red, light
 * grey, indigo and grey, with the category names and amounts typed in one list note on the panel. Since n10 a line
 * drawn in a colour was told and checked as "that text or rule is coloured X", and the ink-colour check looked for
 * TEXT of the pen colour within 40px of the line. So when the build drew bars with dark labels, the check failed and
 * the repair was told "paint its text exactly #f97316": half the budget runs came back with every label and amount
 * in its bar's colour (n120 try 1), and the prompt's own "labels stay dark" rule was overruled by the check.
 *
 * Here a bar is: a level line (not a slanted edge), at least 120px long, drawn in a pen that is not dark, with no
 * words typed on it and not a scribbled text line. It is told as a bar (a thin filled strip about the drawn length
 * in that colour, its label and amount in the block's normal dark text), checked as a bar (a thin block painting
 * that colour on the drawn line), and its labels are checked: words within the band just above and on the bar
 * must not take any bar's colour, unless a note named a colour for those words. Zero tokens.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { deltaE, hexOf, parseCssColor, type Rgb } from './palette.js'

interface MarkLike {
  strokeId?: string; shape: string; box: { x: number; y: number; w: number; h: number }
  from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true
  words?: string; own?: string; listNote?: string; carries?: string; ends?: unknown[]
}
interface InkLike { strokeId: string; mark: string; paint: string; color: string; how: string; box: { x: number; y: number; w: number; h: number } }
interface ActionLike { onScreen?: unknown; kind?: string; shapeMarks?: MarkLike[]; inkColours?: InkLike[]; textMarks?: string[] }

export const BAR_MIN = 120
/** A label this close (ΔE) to a bar's colour has taken the bar's colour. */
export const LABEL_DE = 20

const lum = (p: Rgb) => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b

const chroma = (p: Rgb) => Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b)

/**
 * Is this ink colour on this action a bar (a coloured level line with no words of its own)? A vivid line is a bar
 * on its own; a pale or grey one (a light track, a grey bar) only beside a vivid bar in the same block, so a white
 * line drawn for a heading on a dark page stays text.
 */
export function isBarInk(c: InkLike, a: ActionLike): boolean {
  if (!barShaped(c, a)) return false
  if (chroma(parseCssColor(c.color)!) >= 50) return true
  return (a.inkColours ?? []).some((o) => o !== c && barShaped(o, a) && chroma(parseCssColor(o.color)!) >= 50)
}

function barShaped(c: InkLike, a: ActionLike): boolean {
  if (c.paint !== 'text' || c.how !== 'pen' || c.mark !== 'line') return false
  if ((a.textMarks ?? []).includes(c.strokeId)) return false
  const m = (a.shapeMarks ?? []).find((k) => k.strokeId === c.strokeId)
  if (!m || m.shape !== 'line' || m.edge || !m.from || !m.to) return false
  if (Math.abs(m.from.y - m.to.y) > 4) return false
  if (Math.abs(m.to.x - m.from.x) < BAR_MIN) return false
  if (m.words || m.own || m.listNote || m.carries || (m.ends?.length ?? 0) > 0) return false
  const p = parseCssColor(c.color)
  // a dark pen line is a line of text (or a plain rule), never a coloured bar
  return !!p && lum(p) >= 70
}

export interface Bar { action: number; strokeId: string; color: string; x0: number; x1: number; y: number }

export function barsOf(actions: readonly ActionLike[]): Bar[] {
  const out: Bar[] = []
  actions.forEach((a, i) => {
    if (a.onScreen) return
    for (const c of a.inkColours ?? []) {
      if (!isBarInk(c, a)) continue
      const m = a.shapeMarks!.find((k) => k.strokeId === c.strokeId)!
      out.push({ action: i, strokeId: c.strokeId, color: c.color, x0: Math.min(m.from!.x, m.to!.x), x1: Math.max(m.from!.x, m.to!.x), y: Math.round(m.from!.y) })
    }
  })
  return out
}

const hex = (c: string) => { const p = parseCssColor(c); return p ? hexOf(p) : c }

/** The brief line for one bar (replaces "that text or rule is coloured X"). */
export function barBriefLine(action: number, c: InkLike): string {
  const at = `x ${String(c.box.x)}, y ${String(c.box.y)}, ${String(c.box.w)}x${String(c.box.h)}`
  return `- action ${String(action)}, the level line drawn at ${at} in ${hex(c.color)} with no words on it: a BAR (a progress or ` +
    `amount bar), not text: a thin filled strip about 6-10px tall, about the drawn length, on the drawn line, background ` +
    `${hex(c.color)}; a light track behind it is fine. The words beside, above or at the ends of it (its label, its amount) ` +
    `are the block's normal dark text, NEVER ${hex(c.color)} (checked on the page)`
}

const alpha = (css: string) => { const m = /rgba?\([^)]*?[,/]\s*([\d.]+%?)\s*\)/.exec(css); return m ? (m[1]!.endsWith('%') ? parseFloat(m[1]!) / 100 : parseFloat(m[1]!)) : 1 }

/** A thin block painting the bar's colour, its centre within `reach` px of y; returns its ΔE and its centre's offset. */
function thinBlock(bar: Bar, nodes: readonly DomNode[], reach: number): { de: number; off: number } | null {
  const want = parseCssColor(bar.color)!
  const len = bar.x1 - bar.x0
  let best: { de: number; off: number } | null = null
  for (const n of nodes) {
    const r = n.rect
    if (r.h <= 0 || r.h > 28 || r.w < 8) continue
    const cy = r.y + r.h / 2
    if (Math.abs(cy - bar.y) > reach) continue
    if (r.x > bar.x1 + 24 || r.x + r.w < bar.x0 - 24 || r.w > len * 1.6 + 40) continue
    const bg = parseCssColor(n.style.backgroundColor)
    if (!bg || alpha(n.style.backgroundColor) < 0.5) continue
    const de = deltaE(bg, want)
    const off = Math.round(cy - bar.y)
    if (!best || de < best.de - 0.5 || (Math.abs(de - best.de) <= 0.5 && Math.abs(off) < Math.abs(best.off))) best = { de, off }
  }
  return best
}

/** How far a bar may sit from its drawn line and still be on it. */
export const BAR_ON_PX = 18
/** How far away a bar of the right colour is still read as that bar, built off its line (n122). */
export const BAR_REACH_PX = 70

/**
 * A thin block on the drawn line painting the bar's colour (its fill may be shorter than the drawn line: a part-full
 * bar). n122: when none is on the line but one of that colour sits within 70px, `offBy` says how far it was built
 * off (positive: below), so the repair is told to move the row, not to build a second bar.
 */
export function barBuilt(bar: Bar, nodes: readonly DomNode[]): { ok: boolean; de: number | null; offBy?: number } {
  const on = thinBlock(bar, nodes, BAR_ON_PX)
  if (on && on.de <= 12) return { ok: true, de: on.de }
  const off = thinBlock(bar, nodes, BAR_REACH_PX)
  if (off && off.de <= 12 && Math.abs(off.off) > BAR_ON_PX) return { ok: false, de: on?.de ?? null, offBy: off.off }
  return { ok: false, de: on?.de ?? null }
}

/** Bars drawn in one column (same start within 30px), three or more, top to bottom. */
export function barColumns(bars: readonly Bar[]): Bar[][] {
  const cols: Bar[][] = []
  for (const b of [...bars].sort((p, q) => p.y - q.y)) {
    const c = cols.find((k) => k[0]!.action === b.action && Math.abs(k[0]!.x0 - b.x0) <= 30)
    if (c) c.push(b); else cols.push([b])
  }
  return cols.filter((c) => c.length >= 3)
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0 }
export const pitchOf = (col: readonly Bar[]) => median(col.slice(1).map((b, k) => b.y - col[k]!.y))

/**
 * n122: bars stacked in a column are rows of a list at the drawn pitch. Round 38 e3 (budget, n121 try 2): the six
 * category rows were built 20-30px below their drawn lines and two repairs told "build a bar there" did not move
 * them. Told up front: where each bar's line is, the pitch, and that the space above the first row is what was drawn.
 */
export function barPitchBrief(actions: readonly ActionLike[]): string[] {
  return barColumns(barsOf(actions)).map((col) => {
    const p = pitchOf(col)
    return `- the ${String(col.length)} bars drawn from x ${String(col[0]!.x0)} are ROWS OF ONE LIST at the drawn pitch of about ${String(p)}px: ` +
      `bar centres at y ${col.map((b) => String(b.y)).join(', ')}. Build each row ${String(p)}px tall (its label and amount above the bar, the bar at the row's foot) ` +
      `so every bar lands on its drawn y; the first row starts where drawn (no extra heading margin or panel padding above it). Checked on the page`
  })
}

/**
 * n122: why a column of bars is off, said so a repair can act on it: all rows off by the same amount (the space above
 * the first row), or the rows built at another pitch (row height or gap). Null when the bars are not a column or the
 * offsets cannot be read.
 */
export function barRowsHint(bars: readonly Bar[], nodes: readonly DomNode[]): string | null {
  for (const col of barColumns(bars)) {
    const offs = col.map((b) => { const t = thinBlock(b, nodes, BAR_REACH_PX); return t && t.de <= 12 ? t.off : null })
    const got = offs.map((o, k) => (o === null ? null : { y: col[k]!.y, o })).filter((x): x is { y: number; o: number } => x !== null)
    if (got.length < 2 || !got.some((g) => Math.abs(g.o) > BAR_ON_PX)) continue
    const os = got.map((g) => g.o)
    const spread = Math.max(...os) - Math.min(...os)
    const p = pitchOf(col)
    if (spread <= 10) {
      const m = Math.round(median(os))
      return `all ${String(col.length)} bar rows are about ${String(Math.abs(m))}px ${m > 0 ? 'low' : 'high'} by the same amount, so the list starts ${m > 0 ? 'too low' : 'too high'}: ${m > 0 ? `take ${String(m)}px out of the space above the first row (the panel's top padding, the heading's bottom margin or a gap under it)` : `add ${String(-m)}px above the first row`}; keep the row spacing (${String(p)}px) and never use negative margins`
    }
    const builtPitch = Math.round((got.at(-1)!.y + got.at(-1)!.o - (got[0]!.y + got[0]!.o)) / Math.max(1, (got.at(-1)!.y - got[0]!.y) / (p || 1)))
    return `the bar rows are built at a pitch of about ${String(builtPitch)}px, drawn ${String(p)}px (first row ${String(Math.abs(got[0]!.o))}px ${got[0]!.o > 0 ? 'low' : 'high'}): make every row exactly ${String(p)}px tall including its gap (label, amount and bar inside), so the bars land at y ${col.map((b) => String(b.y)).join(', ')}`
  }
  return null
}

export interface BarLabelVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const hollow = (n: DomNode) => n.style.color === 'transparent' || alpha(n.style.color) < 0.35

/**
 * Words just above, on or at the ends of a drawn bar keep dark text: none of them takes a bar's colour.
 * `named` skips words a note gave their own colour.
 */
export function verifyBarLabels(actions: readonly ActionLike[], after: DomSnapshot, named: (n: { text?: string }) => boolean = () => false): BarLabelVerdict {
  const bars = barsOf(actions)
  if (!bars.length) return { satisfied: true, unverifiable: true, reason: 'no coloured bars drawn' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const cols = bars.map((b) => ({ b, p: parseCssColor(b.color)! }))
  const seen = new Set<string>()
  const near: DomNode[] = []
  for (const bar of bars) {
    for (const n of after.nodes) {
      if (seen.has(n.id) || !n.text.trim() || !/[\p{L}\p{N}]/u.test(n.text) || n.rect.w <= 0 || n.rect.h <= 0) continue
      if (['script', 'style', 'title', 'option'].includes(n.tag) || hollow(n)) continue
      if ((parseFloat(n.style.fontSize) || 16) > 30) continue
      const r = n.rect, cy = r.y + r.h / 2
      if (cy < bar.y - 40 || cy > bar.y + 10) continue
      if (r.x > bar.x1 + 40 || r.x + r.w < bar.x0 - 40) continue
      // words on a coloured chip of their own (a badge, a button) are not a bar's label
      if (alpha(n.style.backgroundColor) >= 0.5 && n.style.backgroundColor !== 'transparent') continue
      seen.add(n.id); near.push(n)
    }
  }
  const judged = near.filter((n) => !named(n))
  if (!judged.length) return { satisfied: true, unverifiable: true, reason: 'no words built beside the bars' }
  const off = judged.flatMap((n) => {
    const t = parseCssColor(n.style.color)
    if (!t) return []
    const hit = cols.find(({ p }) => deltaE(t, p) <= LABEL_DE)
    return hit ? [{ n, bar: hit.b }] : []
  })
  if (!off.length) return { satisfied: true, reason: `${String(judged.length)} label${judged.length > 1 ? 's' : ''} beside ${String(bars.length)} drawn bar${bars.length > 1 ? 's' : ''} kept dark` }
  const shown = off.slice(0, 6).map(({ n, bar }) => `"${n.text.slice(0, 24)}" is ${hex(bar.color)}`).join(', ')
  return {
    satisfied: false,
    reason: `${String(off.length)} of ${String(judged.length)} words beside the bars drawn in colour took their bar's colour (${shown}${off.length > 6 ? ', …' : ''}); ` +
      `the user drew the bars in colour, not the words: set those labels and amounts to the block's normal dark text (the colour the other body text uses), keep the bars' colours, change nothing else`,
  }
}
