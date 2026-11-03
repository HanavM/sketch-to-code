/**
 * A tall panel with a button drawn at its bottom keeps its contents at their natural size (n117).
 *
 * Round 38 e1 (hotel booking, n116 try 2): a tall box at the right holds a calendar note near its top and a smaller
 * box (the "Reserve · 4 nights" button) drawn at its bottom. The build read "a calendar drawn that tall fills it" and
 * stretched the month's rows to fill the panel (about 58px a row against the target's ~49), which pushed the button
 * 30px below where it was drawn. In the target the calendar keeps natural rows and the space under it is empty.
 *
 * A person who draws a smaller box at the very bottom of a tall box has drawn that panel's foot: a button or footer
 * pinned to the bottom. The empty space above it is drawn on purpose. Here, from the drawing alone:
 * - PANEL: a box at least 200px tall; FOOT: a box inside it, at least half its width and at most 90px tall, whose top
 *   is in the panel's lower 40%, with no other drawn box or line reaching into the panel's lower 40%.
 * The build is told the foot's top and height in px (pinned there: the panel a flex column, the foot margin-top:auto),
 * and that what sits above it in the panel (a calendar, a list, a grid) keeps natural rows and never stretches.
 * The page is checked: the foot's built element within 12px of its drawn top, and a grid of short numbers inside the
 * panel above the foot (a month, a keypad) with rows no taller than 54px. Zero tokens.
 */
import type { ShapeMark } from './shapemark.js'

interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { rect: Box; text?: string; textBox?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }

export interface PanelFoot { panel: Box; foot: Box }
export interface PanelFootVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const FOOT_TOL_PX = 12
export const GRID_ROW_MAX_PX = 54
const r = Math.round
type MarkLike = Pick<ShapeMark, 'shape' | 'box'> & Partial<Pick<ShapeMark, 'area' | 'tilt' | 'edge'>>

const inside = (a: Box, b: Box, tol = 8) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol

/** Tall drawn panels with a foot box drawn at their bottom. */
export function panelFeet(marks: readonly MarkLike[]): PanelFoot[] {
  const boxes = marks.filter((m) => m.shape === 'box' && !m.area && !m.tilt)
  const out: PanelFoot[] = []
  for (const p of boxes) {
    const P = p.box
    if (P.h < 200) continue
    const low = P.y + 0.6 * P.h
    const feet = boxes.filter((f) => f !== p && inside(f.box, P) && f.box.h <= 90 && f.box.w >= 0.5 * P.w && f.box.y >= low && f.box.h < 0.4 * P.h)
    if (feet.length !== 1) continue
    const foot = feet[0]!
    // anything else drawn reaching into the lower part means the panel's layout is drawn there: leave it alone
    const others = marks.filter((m) => m !== p && m !== foot && !m.edge && inside(m.box, P) && m.box.y + m.box.h > low && m.box.w * m.box.h > 0)
    if (others.length) continue
    out.push({ panel: { x: r(P.x), y: r(P.y), w: r(P.w), h: r(P.h) }, foot: { x: r(foot.box.x), y: r(foot.box.y), w: r(foot.box.w), h: r(foot.box.h) } })
  }
  return out
}

export function panelFootBrief(marks: readonly MarkLike[]): string {
  const ps = panelFeet(marks)
  if (!ps.length) return ''
  const each = ps.map(({ panel: P, foot: F }) =>
    `the tall box at x=${P.x}, y=${P.y} (${P.w}x${P.h}px) has a smaller box drawn at its bottom (x=${F.x}, y=${F.y}, ${F.w}x${F.h}px): ` +
    `that is the panel's foot (its button or footer). Build the foot at exactly y=${F.y}px and ${F.h}px tall (the panel a flex column ${P.h}px tall, the foot margin-top:auto, ` +
    `or the foot at its drawn offset), and keep everything above it in the panel at its NATURAL size from the panel's top: ` +
    `a calendar, list or grid there keeps natural rows (about 36-48px each) and does NOT stretch to fill the panel; the empty space between is drawn on purpose`).join('; ')
  return `\n\nPANEL FEET (this overrides "a grid, calendar or table drawn that tall fills it" for these boxes): ${each}. ` +
    `Checked on the page: the foot within ${FOOT_TOL_PX}px of its drawn top, and a grid of numbers above it with rows no taller than ${GRID_ROW_MAX_PX}px.`
}

const tb = (n: NodeLike) => n.textBox ?? n.rect

export function verifyPanelFeet(marks: readonly MarkLike[], after: Snap): PanelFootVerdict {
  const ps = panelFeet(marks)
  if (!ps.length) return { satisfied: true, unverifiable: true, reason: 'no panel with a foot drawn' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const seen = (after.nodes ?? []).filter((n) => n.rect.w > 0 && n.rect.h > 0)
  const faults: string[] = []
  for (const { panel: P, foot: F } of ps) {
    // the foot: an element about its width and place
    const own = seen.filter((n) => Math.abs(n.rect.w - F.w) <= Math.max(30, 0.15 * F.w) && Math.abs(n.rect.x - F.x) <= Math.max(30, 0.1 * F.w) &&
      Math.abs(n.rect.y - F.y) <= 0.5 * P.h && n.rect.h <= 2 * F.h + 20)
    const best = own.sort((a, b) => Math.abs(a.rect.y - F.y) - Math.abs(b.rect.y - F.y))[0]
    if (!best) faults.push(`no element about ${F.w}px wide near y=${F.y}px where the panel's foot (its button) was drawn`)
    else if (Math.abs(best.rect.y - F.y) > FOOT_TOL_PX) {
      const d = r(best.rect.y - F.y)
      faults.push(`the panel's foot drawn at y=${F.y}px is built at y=${r(best.rect.y)}px (${Math.abs(d)}px ${d > 0 ? 'low' : 'high'}): pin it at y=${F.y}px (margin-top:auto in a ${P.h}px flex column), ` +
        `and keep what is above it at its natural size`)
    }
    // a number grid above the foot: rows of 3+ short numbers
    const nums = seen.filter((n) => /^\d{1,2}$/.test((n.text ?? '').trim()) && (() => { const b = tb(n); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= P.x && cx <= P.x + P.w && cy >= P.y && cy < F.y })())
    const rows: number[][] = []
    for (const y of nums.map((n) => { const b = tb(n); return b.y + b.h / 2 }).sort((a, b) => a - b)) {
      const last = rows[rows.length - 1]
      if (last && y - last[0]! <= 6) last.push(y); else rows.push([y])
    }
    const full = rows.filter((g) => g.length >= 3).map((g) => g[0]!)
    if (full.length >= 3) {
      const pitch = (full[full.length - 1]! - full[0]!) / (full.length - 1)
      if (pitch > GRID_ROW_MAX_PX) faults.push(`the grid in the panel at x=${P.x} is stretched: its rows are ${r(pitch)}px apart; give it natural rows (about 40-48px) from the panel's top and leave the space above the foot empty`)
    }
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only those; do not change widths, colours or copy' }
    : { satisfied: true, reason: `${ps.length} panel foot${ps.length > 1 ? 's' : ''} at the drawn place, contents above at natural size` }
}
