/**
 * A long open polyline is a route line (n142).
 *
 * Round 40 e3 (ride booking, n139): a route was drawn as one stroke along a road and down another (a straight
 * run, a rounded corner, a straight run), with "route, rounded corner" typed on it. It is no box, line or ring,
 * so no shape claimed it; the build read the two roads as a box and dropped the route on the first build and
 * again after a fix note asked for it. A person drawing one long open stroke with a few straight runs and bends
 * means a path: a route on a map, a connector between steps, a chart's line.
 *
 * Here every stroke that is not a plain shape, runs 300px or more of ink, ends far from where it started, and
 * simplifies to 3-10 corners whose long runs are level or plumb (a few straight runs along the page, not a
 * scribble, a wave, a ridge or a chart line) is told as a ROUTE: one SVG path
 * through its simplified points, in its pen colour, about 5px, round joins, no fill, at exactly those page
 * coordinates, drawn over what it crosses. Checked on the page: an SVG element must cover the route's extent.
 * Zero tokens.
 */
import type { Point } from '@s2c/ink'
import { rdp } from '@s2c/ink'
import { shapeOf } from './shapemark.js'

interface StrokeLike { id: string; points: Array<{ x: number; y: number }>; color?: string | null }
interface NodeLike { rect: { x: number; y: number; w: number; h: number }; tag?: string }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface RouteVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }
export interface Route { id: string; pts: Array<{ x: number; y: number }>; color: string; box: { x: number; y: number; w: number; h: number } }

const r1 = (v: number) => Math.round(v)

function inkLength(pts: Array<{ x: number; y: number }>): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  return l
}

/** Light pens (white, pale grey) would vanish on a map: a route is then dark. */
function routeColour(c: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? '')
  if (!m) return '#111827'
  const v = parseInt(m[1]!, 16)
  const lum = 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)
  return lum > 200 ? '#111827' : `#${m[1]!.toLowerCase()}`
}

export function routeLines(strokes: readonly StrokeLike[] | undefined): Route[] {
  const out: Route[] = []
  for (const st of strokes ?? []) {
    const pts = st.points
    if (pts.length < 3) continue
    const len = inkLength(pts)
    if (len < 300) continue
    const a = pts[0]!, z = pts[pts.length - 1]!
    if (Math.hypot(z.x - a.x, z.y - a.y) < 150) continue
    if (shapeOf(pts)) continue
    const simple = rdp(pts.map((p) => ({ ...p, t: 0 })) as unknown as Point[], 6) as Array<{ x: number; y: number }>
    if (simple.length < 3 || simple.length > 10) continue
    // a few long runs, not a zigzag: every run but the bends is long enough to be a straight stretch
    // and those long runs go along the page (level or plumb, as roads and connectors do): a mountain ridge, a
    // chart line or a wave runs on the slant and is never a route
    const runs = simple.slice(1).map((p, i) => {
      const q = simple[i]!, deg = Math.abs(Math.atan2(p.y - q.y, p.x - q.x) * 180 / Math.PI) % 90
      return { len: Math.hypot(p.x - q.x, p.y - q.y), square: Math.min(deg, 90 - deg) <= 12 }
    })
    const long = runs.filter((r) => r.len >= 60)
    if (long.length < 2 || long.some((r) => !r.square)) continue
    const xs = simple.map((p) => p.x), ys = simple.map((p) => p.y)
    const box = { x: r1(Math.min(...xs)), y: r1(Math.min(...ys)), w: r1(Math.max(...xs) - Math.min(...xs)), h: r1(Math.max(...ys) - Math.min(...ys)) }
    out.push({ id: st.id, pts: simple.map((p) => ({ x: r1(p.x), y: r1(p.y) })), color: routeColour(st.color), box })
  }
  return out
}

export function routeBrief(strokes: readonly StrokeLike[] | undefined): string {
  const routes = routeLines(strokes)
  if (!routes.length) return ''
  const lines = routes.map((r) => `- the stroke drawn through ${r.pts.map((p) => `(${String(p.x)},${String(p.y)})`).join(' ')} is a ROUTE LINE (a path on a map, a connector): ` +
    `build it as ONE SVG <path> through exactly those page points (absolutely positioned svg over the page or its section, overflow visible, pointer-events none, above what it crosses: roads, map, panels), ` +
    `stroke ${r.color}, stroke-width about 5px, fill none, stroke-linecap and stroke-linejoin round, each bend a short smooth curve (quadratic) rather than a sharp corner when a note says rounded; ` +
    `no glow, no shadow, no dashes unless a note says so. It is never dropped, never a box or a border, and the two straight lines it runs along stay what they are.`)
  return `ROUTE LINES (deterministic, from long open strokes; checked on the page):\n${lines.join('\n')}\n\n`
}

export function verifyRoutes(strokes: readonly StrokeLike[] | undefined, after: Snap): RouteVerdict {
  const routes = routeLines(strokes)
  if (!routes.length) return { satisfied: true, unverifiable: true, reason: 'no route line drawn' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const svgs = after.nodes.filter((n) => /^(svg|path|polyline|line)$/i.test(n.tag ?? '') && n.rect.w + n.rect.h > 0)
  const misses: string[] = []
  for (const r of routes) {
    const covers = svgs.some((n) => {
      const ox = Math.min(n.rect.x + n.rect.w, r.box.x + r.box.w) - Math.max(n.rect.x, r.box.x)
      const oy = Math.min(n.rect.y + n.rect.h, r.box.y + r.box.h) - Math.max(n.rect.y, r.box.y)
      return ox >= Math.max(1, r.box.w * 0.7) - 6 && oy >= Math.max(1, r.box.h * 0.7) - 6 &&
        n.rect.w <= Math.max(r.box.w * 3, r.box.w + 400) && n.rect.h <= Math.max(r.box.h * 3, r.box.h + 400)
    })
    if (!covers) misses.push(`the route line drawn from (${String(r.pts[0]!.x)},${String(r.pts[0]!.y)}) through ${String(r.pts.length - 2)} bend${r.pts.length > 3 ? 's' : ''} to (${String(r.pts.at(-1)!.x)},${String(r.pts.at(-1)!.y)}) is missing: add one absolutely positioned SVG <path> through ${r.pts.map((p) => `(${String(p.x)},${String(p.y)})`).join(' ')}, stroke ${r.color}, about 5px, fill none, round joins, above what it crosses; change nothing else`)
  }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${String(routes.length)} route line${routes.length > 1 ? 's' : ''} drawn` }
}
