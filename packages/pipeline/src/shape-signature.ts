/**
 * A shape descriptor for searching the library by drawing at it.
 *
 * composition.ts already measures "what does this look like", and the obvious
 * move was to reuse it. That turned out to answer a different question, and the
 * difference is instructive: its grid is normalised into the drawing's OWN
 * bounding box, which is exactly right for scoring a generated depiction against
 * the ink that asked for it — the two should match whatever size they came out.
 * For a search it is fatal. Every rectangle outline fills the border cells of its
 * own box, so a wide nav row and a tall form scored 0.99 against each other, and
 * the only thing left to tell them apart was a single aspect number weighed
 * against 256 grid cells. Measured live, a tall sketch confidently returned the
 * widest thing in the library.
 *
 * So this letterboxes instead: the shape is scaled by its LONGER side and
 * centred in a square, which puts proportion inside the grid rather than beside
 * it. A flat thing occupies a horizontal band, a tall thing a vertical one, and
 * they no longer resemble each other at all — while two cards of different sizes
 * still land on top of one another, which is the part that has to keep working.
 *
 * Mass is accumulated by walking the polylines at a fixed step, so a long edge
 * contributes more than a short one, the way more ink would.
 */

/** A bare point. Deliberately not ink's Pt: outlines have no timestamps. */
export interface ShapePoint { x: number; y: number }

export interface ShapeSignature {
  /** GRID×GRID row-major mass, normalised to sum 1. */
  grid: number[]
  /** Width over height of the whole shape, kept for the tie-break term. */
  aspect: number
}

const GRID = 16
/** Samples per cell along a line: enough that a diagonal never skips a cell. */
const SUBSTEPS = 3

export function shapeSignature(polylines: ShapePoint[][]): ShapeSignature | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let points = 0
  for (const line of polylines) {
    for (const p of line) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      points++
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  if (points < 2) return null
  const w = maxX - minX
  const h = maxY - minY
  const span = Math.max(w, h)
  // a single point, or a perfectly degenerate line, is not a shape
  if (!(span > 0)) return null

  // letterbox: scale by the longer side, centre the shorter one
  const ox = minX - (span - w) / 2
  const oy = minY - (span - h) / 2
  const grid = new Array<number>(GRID * GRID).fill(0)
  const step = span / (GRID * SUBSTEPS)
  const mark = (x: number, y: number) => {
    const gx = Math.min(GRID - 1, Math.max(0, Math.floor(((x - ox) / span) * GRID)))
    const gy = Math.min(GRID - 1, Math.max(0, Math.floor(((y - oy) / span) * GRID)))
    grid[gy * GRID + gx] = (grid[gy * GRID + gx] ?? 0) + 1
  }

  let total = 0
  for (const line of polylines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!
      const b = line[i]!
      if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      const n = Math.max(1, Math.ceil(d / step))
      for (let s = 0; s <= n; s++) {
        const t = s / n
        mark(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
        total++
      }
    }
  }
  if (total === 0) return null
  for (let i = 0; i < grid.length; i++) grid[i] = (grid[i] ?? 0) / total
  return { grid, aspect: h > 0 ? w / h : span }
}

/** Strokes are polylines with timestamps this does not need. */
export const shapeFromStrokes = (
  strokes: { points: ShapePoint[] }[],
): ShapeSignature | null => shapeSignature(strokes.map((s) => s.points))
