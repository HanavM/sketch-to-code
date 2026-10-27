/**
 * How simple a hand sketch is: per stroke, its points and ink length, and
 * whether it is a simple shape (line, box, circle/ellipse, arrow, tick) or
 * freehand detail. Geometry only, from the stroke's own points.
 */
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const len = (pts) => pts.slice(1).reduce((s, p, i) => s + d(pts[i], p), 0)

function segDev(pts) {
  // max distance of any point from the chord, over chord length
  const a = pts[0], b = pts[pts.length - 1], L = d(a, b) || 1
  return Math.max(...pts.map((p) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L)) / L
}

export function shapeOf(pts) {
  if (pts.length < 2) return 'dot'
  const L = len(pts)
  if (L < 1) return 'dot'
  const closed = d(pts[0], pts[pts.length - 1]) < Math.max(12, L * 0.12)
  if (!closed && segDev(pts) < 0.06) return 'line'
  if (closed && pts.length >= 4) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
    if (pts.length <= 6 && Math.abs(L - 2 * (w + h)) / (2 * (w + h)) < 0.15) return 'box'
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
    const rs = pts.map((p) => Math.hypot((p[0] - cx) / (w / 2 || 1), (p[1] - cy) / (h / 2 || 1)))
    const m = rs.reduce((a, b) => a + b, 0) / rs.length
    const cv = Math.sqrt(rs.reduce((a, r) => a + (r - m) ** 2, 0) / rs.length) / (m || 1)
    if (cv < 0.15) return 'circle'
  }
  // arrow: a straight shaft then a short head (<= 5 waypoints)
  if (!closed && pts.length <= 5 && pts.length >= 3) {
    const shaft = d(pts[0], pts[1])
    if (shaft > 0.6 * L) return 'arrow'
  }
  if (!closed && pts.length === 3) return 'tick'
  return 'freehand'
}

export function strokeStats(strokes) {
  const rows = strokes.map((pts) => ({ points: pts.length, ink: Math.round(len(pts)), shape: shapeOf(pts) }))
  const n = rows.length
  const simple = rows.filter((r) => r.shape !== 'freehand').length
  const shapes = {}
  for (const r of rows) shapes[r.shape] = (shapes[r.shape] ?? 0) + 1
  return {
    count: n,
    pointsPerStroke: n ? Math.round((rows.reduce((a, r) => a + r.points, 0) / n) * 10) / 10 : 0,
    simpleShare: n ? Math.round((simple / n) * 100) / 100 : null,
    shapes,
    inkPx: rows.reduce((a, r) => a + r.ink, 0),
  }
}
