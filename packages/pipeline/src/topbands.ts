/**
 * The top of the page sits where it was drawn (n116).
 *
 * Round 38 e1 (hotel booking, n113 try 4): a line drawn right across the page under the logo marks the bottom of
 * the top bar, and a wide box under it the search bar. The build made the bar ~20px taller than drawn and the search
 * bar taller again, so every block under them (room cards, "3 rooms available") landed 20-40px low: layout 62, likeness
 * 45 with every part right. Round 38 e3 (budget): the panel's rows 18px low under a taller heading. The whole-page
 * drift check catches it only after the build, and its repair round can be cut short; by then the page is wrong.
 *
 * A person who draws a rule across the page, or a wide flat box near the top, has drawn where that band ends. Here,
 * from the drawing alone:
 * - RULE: a level line at least 60% of the page wide in the top 40% of the page is a band edge: the band above it
 *   (a top bar, a header) ends exactly there; its height is the line's y minus the band's top (0 for the first).
 * - BAR: a box at least 50% of the page wide, under 140px tall, in the top 40% of the page: its top and height as
 *   drawn (a search bar, a filter row, a tab strip), never padded taller.
 * The build is told each band's top and bottom in px, and that nothing under a band may start above it nor be pushed
 * below its drawn place by a taller band. The page is checked: each rule has an element edge (a border or a block's
 * bottom) within 10px of its y and nothing of the band's contents below it; each bar has a built element of about its
 * width whose top and bottom are within 10px of the drawn ones. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'

interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { rect: Box; text?: string; tag?: string; style?: { border?: string; borderBottom?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean; viewport: { w: number; h: number } }

export interface TopBand { kind: 'rule' | 'bar'; top: number; bottom: number; x: number; w: number }
export interface TopBandsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const BAND_TOL_PX = 10
const r = Math.round

/** Bands drawn at the top of the page, top to bottom. `page` is the page (viewport) size in px. */
export function topBands(marks: Array<Pick<ShapeMark, 'shape' | 'box' | 'from' | 'to'> & Partial<Pick<ShapeMark, 'edge' | 'area' | 'tilt'>>>, page: { w: number; h: number }): TopBand[] {
  const zone = Math.max(200, 0.4 * page.h)
  const rules = marks.filter((m) => m.shape === 'line' && !m.edge && m.box.w >= 0.6 * page.w && m.box.h <= 12 &&
    (!m.from || !m.to || Math.abs(m.to.y - m.from.y) <= Math.max(8, 0.03 * m.box.w)) && m.box.y + m.box.h / 2 <= zone)
    .sort((a, b) => a.box.y - b.box.y)
  const bars = marks.filter((m) => m.shape === 'box' && !m.area && !m.tilt && m.box.w >= 0.5 * page.w && m.box.h >= 20 && m.box.h <= 140 && m.box.y <= zone)
  const out: TopBand[] = []
  let prev = 0
  for (const l of rules) {
    const y = r(l.box.y + l.box.h / 2)
    // a line drawn inside a bar box (an underline, a divider in a search bar) is not a page band
    if (bars.some((b) => y > b.box.y + 6 && y < b.box.y + b.box.h - 6)) continue
    out.push({ kind: 'rule', top: prev, bottom: y, x: r(l.box.x), w: r(l.box.w) })
    prev = y
  }
  for (const b of bars) {
    // a big box containing other wide bars is a panel, not a band
    if (bars.some((o) => o !== b && o.box.y > b.box.y && o.box.y + o.box.h < b.box.y + b.box.h)) continue
    out.push({ kind: 'bar', top: r(b.box.y), bottom: r(b.box.y + b.box.h), x: r(b.box.x), w: r(b.box.w) })
  }
  return out.sort((a, b) => a.bottom - b.bottom)
}

export function topBandsBrief(marks: ShapeMark[], page: { w: number; h: number }): string {
  const bands = topBands(marks, page)
  if (!bands.length) return ''
  const each = bands.map((b) => b.kind === 'rule'
    ? `a line drawn across the page at y=${b.bottom}px: the band above it (${b.top === 0 ? 'the top bar, from the page top' : `from y=${b.top}px`}) ends exactly there, ` +
      `so it is ${b.bottom - b.top}px tall with its border or edge at y=${b.bottom}px (logo, links and buttons centred inside it, never padded taller)`
    : `a wide bar drawn at x=${b.x}, y=${b.top}, ${b.w}px wide and ${b.bottom - b.top}px tall: build it at that top and exactly that height (height: ${b.bottom - b.top}px, ` +
      `its contents centred inside), never padded taller`).join('; ')
  return `\n\nTOP BANDS (where the page's top bars were drawn; everything under them hangs off these): ${each}. ` +
    `Set each band's height explicitly (height, not padding) and put no extra margin or gap under it beyond what the drawing shows: ` +
    `a band that comes out even 10px taller pushes every block under it below its drawn place. ` +
    `This is checked on the page: each band's top and bottom within ${BAND_TOL_PX}px of the drawn ones.`
}

const inX = (n: NodeLike, b: TopBand) => n.rect.x < b.x + b.w && n.rect.x + n.rect.w > b.x

function hasBorderAt(n: NodeLike, y: number): boolean {
  const s = n.style ?? {}
  const bb = parseFloat(s.borderBottom ?? '0') || 0
  const bt = parseFloat(s.border ?? '0') || 0
  return (bb > 0 && Math.abs(n.rect.y + n.rect.h - y) <= BAND_TOL_PX) || (bt > 0 && Math.abs(n.rect.y - y) <= BAND_TOL_PX)
}

export function verifyTopBands(marks: ShapeMark[], after: Snap): TopBandsVerdict {
  const bands = topBands(marks, after.viewport)
  if (!bands.length) return { satisfied: true, unverifiable: true, reason: 'no bands drawn at the top' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  const seen = (after.nodes ?? []).filter((n) => n.rect.w > 0 && n.rect.h > 0)
  for (const b of bands) {
    if (b.kind === 'rule') {
      const y = b.bottom
      // the band's own element: wide, starting about where the band starts, ending at the rule (bottom edge or border)
      const wide = seen.filter((n) => n.rect.w >= 0.5 * b.w && inX(n, b) && Math.abs(n.rect.y - b.top) <= 40 && n.rect.h < 2 * (y - b.top) + 40)
      const edge = wide.some((n) => Math.abs(n.rect.y + n.rect.h - y) <= BAND_TOL_PX) || seen.some((n) => hasBorderAt(n, y) && n.rect.w >= 0.5 * b.w) ||
        seen.some((n) => n.rect.w >= 0.5 * b.w && n.rect.h <= 3 && Math.abs(n.rect.y - y) <= BAND_TOL_PX)
      if (!edge) {
        const near = wide.map((n) => n.rect.y + n.rect.h).filter((v) => v > b.top + 8 && v < y + 80).sort((p, q) => Math.abs(p - y) - Math.abs(q - y))[0]
        faults.push(near != null
          ? `the top band drawn to end at y=${y}px ends at y=${r(near)}px (${r(Math.abs(near - y))}px ${near > y ? 'too tall' : 'too short'}): set its height to ${y - b.top}px so its bottom edge is at ${y}px; everything under it moves with it`
          : `no band edge at y=${y}px where a line was drawn across the page: the band above it is ${y - b.top}px tall, its bottom edge (or border) at y=${y}px`)
      }
    } else {
      const own = seen.filter((n) => Math.abs(n.rect.w - b.w) <= Math.max(40, 0.12 * b.w) && Math.abs(n.rect.x - b.x) <= Math.max(40, 0.1 * b.w) && Math.abs(n.rect.y - b.top) <= 60)
      const ok = own.some((n) => Math.abs(n.rect.y - b.top) <= BAND_TOL_PX && Math.abs(n.rect.y + n.rect.h - b.bottom) <= BAND_TOL_PX)
      if (!ok) {
        const best = own.sort((p, q) => (Math.abs(p.rect.y - b.top) + Math.abs(p.rect.y + p.rect.h - b.bottom)) - (Math.abs(q.rect.y - b.top) + Math.abs(q.rect.y + q.rect.h - b.bottom)))[0]
        faults.push(best
          ? `the wide bar drawn at y=${b.top}-${b.bottom}px is built at y=${r(best.rect.y)}-${r(best.rect.y + best.rect.h)}px: set its top to ${b.top}px and its height to ${b.bottom - b.top}px (take out the extra space above it or the padding inside it)`
          : `no bar about ${b.w}px wide at y=${b.top}-${b.bottom}px where one was drawn`)
      }
    }
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only those heights and the one space above; never a negative margin or absolute position; do not change widths, colours or copy' }
    : { satisfied: true, reason: `${bands.length} top band${bands.length > 1 ? 's' : ''} at their drawn tops and heights` }
}

export type { BBox }
