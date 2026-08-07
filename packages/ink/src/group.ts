import { bboxGap, bboxOf, bboxUnion } from './geometry.js'
import type { BBox, Stroke, StrokeGroup } from './types.js'

export interface GroupOptions {
  /** Max pause between strokes to stay in one group (ms). */
  maxGapMs?: number
  /** Max spatial gap between a stroke and the group bbox (px). */
  maxGapPx?: number
}

/**
 * Temporal-spatial clustering: strokes drawn in quick succession near each
 * other form one group (≈ one object or one annotation). Timing is the free
 * segmentation signal we get from owning the capture.
 */
export function groupStrokes(strokes: Stroke[], opts: GroupOptions = {}): StrokeGroup[] {
  const maxGapMs = opts.maxGapMs ?? 900
  const maxGapPx = opts.maxGapPx ?? 48

  const ordered = [...strokes]
    .filter((s) => s.points.length > 0)
    .sort((a, b) => a.points[0]!.t - b.points[0]!.t)

  const groups: Array<{ strokeIds: string[]; bbox: BBox; startT: number; endT: number }> = []
  for (const s of ordered) {
    const sBox = bboxOf(s.points)
    const sStart = s.points[0]!.t
    const sEnd = s.points[s.points.length - 1]!.t
    const last = groups[groups.length - 1]
    if (last && sStart - last.endT <= maxGapMs && bboxGap(last.bbox, sBox) <= maxGapPx) {
      last.strokeIds.push(s.id)
      last.bbox = bboxUnion(last.bbox, sBox)
      last.endT = Math.max(last.endT, sEnd)
    } else {
      groups.push({ strokeIds: [s.id], bbox: sBox, startT: sStart, endT: sEnd })
    }
  }
  return groups.map((g, i) => ({ id: `g${i}`, ...g }))
}
