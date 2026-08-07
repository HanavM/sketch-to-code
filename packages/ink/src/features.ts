import { detectCorners } from './corners.js'
import {
  bboxOf, convexHull, dist, largestQuad, largestTriangle, minAreaRect,
  pathLength, polygonArea, polygonPerimeter, turnAngle,
} from './geometry.js'
import { dedupe, resampleBySpacing } from './resample.js'
import { rdp } from './simplify.js'
import type { Point, Stroke, StrokeFeatures } from './types.js'

/** Cap hull vertex count before O(n^3) inscribed-polygon searches. */
function capHull(hull: Point[], maxVerts = 28): Point[] {
  if (hull.length <= maxVerts) return hull
  const step = hull.length / maxVerts
  const out: Point[] = []
  for (let i = 0; i < maxVerts; i++) out.push(hull[Math.floor(i * step)]!)
  return out
}

export function computeFeatures(stroke: Stroke): StrokeFeatures {
  const raw = stroke.points
  const deduped = dedupe(raw, 2)
  const bbox = bboxOf(deduped.length ? deduped : raw)
  const diag = Math.hypot(bbox.w, bbox.h)
  // spacing scales with size but stays fine enough for small glyphs
  const spacing = Math.max(2, Math.min(6, diag / 40))
  const pts = resampleBySpacing(deduped, spacing)
  const length = pathLength(pts)

  const empty: StrokeFeatures = {
    length, bbox, hull: pts, hullArea: 0, hullPerimeter: 0,
    erArea: 0, erShort: 0, erLong: 0,
    triArea: 0, triPerimeter: 0, quadArea: 0,
    closedness: 1, revolutions: 0, straightness: 1,
    ndde: 0, dcr: 0, corners: [], resampled: pts, rawPointCount: raw.length,
  }
  if (pts.length < 3 || length < 4) return empty

  const hull = capHull(convexHull(pts))
  const hullArea = polygonArea(hull)
  const hullPerimeter = polygonPerimeter(hull)
  const er = minAreaRect(hull)
  const tri = largestTriangle(hull)
  const quad = largestQuad(hull)

  const chord = dist(pts[0]!, pts[pts.length - 1]!)
  const closedness = chord / length
  const straightness = chord / length

  // direction series + rotation
  const dirs: number[] = []
  for (let i = 1; i < pts.length; i++) {
    dirs.push(Math.atan2(pts[i]!.y - pts[i - 1]!.y, pts[i]!.x - pts[i - 1]!.x))
  }
  let totalRot = 0
  const deltas: number[] = []
  for (let i = 2; i < pts.length; i++) {
    const d = turnAngle(pts[i - 2]!, pts[i - 1]!, pts[i]!)
    deltas.push(d)
    totalRot += d
  }
  // A closed trace ends where it started, so the seam's turns are never
  // sampled — a perfect rectangle sweeps only ~270° of direction. When the
  // endpoint gap is small, close the loop and count the seam turns too.
  if (closedness < 0.2 && pts.length >= 4) {
    const n = pts.length
    totalRot += turnAngle(pts[n - 2]!, pts[n - 1]!, pts[0]!)
    totalRot += turnAngle(pts[n - 1]!, pts[0]!, pts[1]!)
  }
  const revolutions = Math.abs(totalRot) / (2 * Math.PI)

  // NDDE: fraction of stroke length between the points of extreme direction.
  // Ellipses/arcs sweep direction monotonically → extremes at the ends → NDDE ≈ 1.
  // Polylines revisit directions → extremes land close together → NDDE low.
  let minDirIdx = 0, maxDirIdx = 0
  // unwrap direction so extremes are meaningful
  const unwrapped: number[] = [dirs[0] ?? 0]
  for (let i = 1; i < dirs.length; i++) {
    let d = dirs[i]! - dirs[i - 1]!
    while (d > Math.PI) d -= 2 * Math.PI
    while (d <= -Math.PI) d += 2 * Math.PI
    unwrapped.push(unwrapped[i - 1]! + d)
  }
  for (let i = 0; i < unwrapped.length; i++) {
    if (unwrapped[i]! < unwrapped[minDirIdx]!) minDirIdx = i
    if (unwrapped[i]! > unwrapped[maxDirIdx]!) maxDirIdx = i
  }
  const lo = Math.min(minDirIdx, maxDirIdx)
  const hi = Math.max(minDirIdx, maxDirIdx)
  const segLen = pathLength(pts.slice(lo, hi + 2))
  const ndde = length > 0 ? segLen / length : 0

  // DCR: max |Δdir| / mean |Δdir| — spikes at polyline corners, flat on smooth curves.
  const absD = deltas.map(Math.abs)
  const meanD = absD.length ? absD.reduce((a, b) => a + b, 0) / absD.length : 0
  const maxD = absD.length ? Math.max(...absD) : 0
  const dcr = meanD > 1e-9 ? maxD / meanD : 0

  // corners on an RDP-cleaned copy scaled to the stroke size
  const simplified = rdp(pts, Math.max(2, diag * 0.02))
  const cornerScale = Math.max(4, Math.min(14, diag * 0.09))
  const corners = detectCorners(pts, { dMin: cornerScale, dMax: cornerScale * 4 })
  void simplified

  return {
    length, bbox, hull, hullArea, hullPerimeter,
    erArea: er.area, erShort: er.short, erLong: er.long,
    triArea: tri.area, triPerimeter: tri.perimeter, quadArea: quad.area,
    closedness, revolutions, straightness,
    ndde, dcr, corners, resampled: pts, rawPointCount: raw.length,
  }
}
