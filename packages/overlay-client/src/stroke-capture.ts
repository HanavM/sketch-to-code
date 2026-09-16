/**
 * Pure stroke-capture math: the trackpad-hop bridge test and the rendered
 * path shape. No DOM here — kept separate from main.ts so it's testable
 * without a browser (pointer capture can't be exercised outside one).
 */

export interface Pt { x: number; y: number; t: number }

// ---- trackpad-friendly stroke capture ----------------------------------
// A trackpad forces a "hop": mid-gesture the user's finger runs out of pad
// travel, they lift and re-place it, and — because a trackpad only tracks
// motion while touched — the cursor doesn't drift during that lift. A mouse
// drag never needs this. Bridging turns the hop back into one stroke instead
// of two, which is both truer to what the user drew and friendlier to
// per-stroke shape classification (one rect outline beats four disconnected
// lines). Gated tight on all three axes so it can't misfire on handwriting,
// where consecutive letters are a deliberate, larger jump.
export const BRIDGE_MAX_MS = 400
export const BRIDGE_MAX_PX = 14
/** Matches @s2c/ink's own small-vs-letter bbox-diagonal cutoff (features.ts) —
 *  only a stroke already gesture-sized is a hop candidate, never a letter. */
export const BRIDGE_MIN_SPAN = 72

/** Diagonal of a point set's bbox — same measure @s2c/ink uses to tell a
 *  gesture-scale stroke from a letter-scale one. */
export function strokeDiagonal(points: Pt[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return Math.hypot(maxX - minX, maxY - minY)
}

/**
 * True when a new stroke starting at `p` is a trackpad hop off the stroke
 * that ended at `lastEnd` — landed back within BRIDGE_MAX_PX, within
 * BRIDGE_MAX_MS, and the interrupted stroke was already gesture-sized.
 */
export function shouldBridge(lastEnd: Pt | null, lastBig: boolean, p: Pt): boolean {
  return lastBig && lastEnd !== null
    && p.t - lastEnd.t <= BRIDGE_MAX_MS
    && Math.hypot(p.x - lastEnd.x, p.y - lastEnd.y) <= BRIDGE_MAX_PX
}

/**
 * Page-space path data. Recognition reads `points` raw (unaffected by this);
 * this only shapes what's painted. A trackpad's coarser tracking means more
 * of the input's real jitter survives per unit distance than with a mouse,
 * and straight `L` segments through that render visibly faceted. Quadratic
 * curves through each pair's midpoint (endpoints untouched) round that off
 * into a single confident line — cheap enough to rebuild every pointermove.
 */
export function pathD(points: Pt[]): string {
  if (points.length < 3) {
    let d = ''
    for (const [i, p] of points.entries()) {
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    }
    return d
  }
  const p0 = points[0]!
  let d = `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!, next = points[i + 1]!
    const midX = (p.x + next.x) / 2, midY = (p.y + next.y) / 2
    d += `Q${p.x.toFixed(1)} ${p.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
  }
  const last = points[points.length - 1]!
  d += `L${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}
