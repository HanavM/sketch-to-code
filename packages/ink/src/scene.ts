import { detectSingleStrokeArrow, detectTwoStrokeArrow } from './arrows.js'
import { classifyStroke } from './classify.js'
import { textProbability } from './entropy.js'
import { bboxOf, bboxUnion, pathLength } from './geometry.js'
import { groupStrokes } from './group.js'
import { rdp } from './simplify.js'
import type {
  ArrowLink, InkNode, InkScene, ShapeCandidate, Stroke, StrokeFeatures, TextRegion,
} from './types.js'

let uid = 0
const nid = (prefix: string) => `${prefix}${uid++}`

export interface AnalyzeOptions {
  /** Groups whose P(text) exceeds this become TextRegions. Fit on fixtures. */
  textThreshold?: number
}

/**
 * Full deterministic pipeline: strokes → recognized scene.
 * No model calls anywhere in here.
 */
export function analyzeStrokes(strokes: Stroke[], opts: AnalyzeOptions = {}): InkScene {
  uid = 0
  const textThreshold = opts.textThreshold ?? 0.62
  const groups = groupStrokes(strokes)
  const byId = new Map(strokes.map((s) => [s.id, s]))

  const nodes: InkNode[] = []
  const textRegions: TextRegion[] = []
  const arrows: ArrowLink[] = []

  for (const group of groups) {
    const groupStrokeList = group.strokeIds.map((id) => byId.get(id)!).filter(Boolean)

    // 1) text first: handwriting is many small dense strokes — per-stroke shape
    //    classification on letters is meaningless noise.
    const pText = textProbability(groupStrokeList)
    if (pText >= textThreshold) {
      textRegions.push({
        id: nid('t'),
        bbox: group.bbox,
        strokeIds: [...group.strokeIds],
        groupId: group.id,
      })
      continue
    }

    // 2) classify each stroke in the group
    const classified = groupStrokeList.map((s) => ({
      stroke: s,
      ...classifyStroke(s),
      verts: [] as StrokeFeatures['resampled'],
    }))
    for (const c of classified) {
      const diag = Math.hypot(c.features.bbox.w, c.features.bbox.h)
      c.verts = rdp(c.features.resampled, Math.max(2.5, diag * 0.035))
    }

    // 3) arrows — single-stroke first
    const consumed = new Set<string>()
    for (const c of classified) {
      if (consumed.has(c.stroke.id)) continue
      const top = c.candidates[0]
      // closed shapes are never arrows
      if (top && ['rect', 'rounded-rect', 'ellipse', 'circle', 'triangle', 'diamond'].includes(top.kind)) continue
      const det = detectSingleStrokeArrow(c.features, c.verts)
      if (det && det.confidence >= 0.6) {
        const nodeId = nid('n')
        nodes.push({
          id: nodeId,
          kind: 'arrow',
          candidates: [{ kind: 'arrow', confidence: det.confidence }, ...c.candidates],
          bbox: c.features.bbox,
          strokeIds: [c.stroke.id],
          groupId: group.id,
          vertices: [det.from, det.to],
        })
        arrows.push({ id: nid('a'), nodeId, from: det.from, to: det.to })
        consumed.add(c.stroke.id)
      }
    }

    // 3b) two-stroke arrows: pair remaining line-ish strokes with V-head strokes
    for (const shaft of classified) {
      if (consumed.has(shaft.stroke.id)) continue
      const shaftTop = shaft.candidates[0]
      if (!shaftTop || !['line', 'polyline', 'arc'].includes(shaftTop.kind)) continue
      for (const head of classified) {
        if (head === shaft || consumed.has(head.stroke.id) || consumed.has(shaft.stroke.id)) continue
        const headTop = head.candidates[0]
        if (headTop && ['rect', 'rounded-rect', 'ellipse', 'circle'].includes(headTop.kind)) continue
        const det = detectTwoStrokeArrow(
          shaft.verts, pathLength(shaft.verts),
          head.verts, pathLength(head.verts),
        )
        if (det) {
          const nodeId = nid('n')
          nodes.push({
            id: nodeId,
            kind: 'arrow',
            candidates: [{ kind: 'arrow', confidence: det.confidence }],
            bbox: bboxUnion(shaft.features.bbox, head.features.bbox),
            strokeIds: [shaft.stroke.id, head.stroke.id],
            groupId: group.id,
            vertices: [det.from, det.to],
          })
          arrows.push({ id: nid('a'), nodeId, from: det.from, to: det.to })
          consumed.add(shaft.stroke.id)
          consumed.add(head.stroke.id)
          break
        }
      }
    }

    // 4) everything else becomes its own node
    for (const c of classified) {
      if (consumed.has(c.stroke.id)) continue
      const top: ShapeCandidate = c.candidates[0] ?? { kind: 'ink', confidence: 0.4 }
      const node: InkNode = {
        id: nid('n'),
        kind: top.kind,
        candidates: c.candidates,
        bbox: c.features.bbox,
        strokeIds: [c.stroke.id],
        groupId: group.id,
      }
      if (['line', 'polyline', 'caret', 'arc'].includes(top.kind)) node.vertices = c.verts
      nodes.push(node)
    }
  }

  // 5) strikethrough promotion: a line/scribble node overlapping a text region
  //    substantially is a strikethrough gesture, not a shape. (Final DELETE
  //    semantics against DOM elements are decided in the intent layer.)
  for (const n of nodes) {
    if (n.kind !== 'line' && n.kind !== 'scribble') continue
    for (const t of textRegions) {
      const overlapX = Math.min(n.bbox.x + n.bbox.w, t.bbox.x + t.bbox.w) - Math.max(n.bbox.x, t.bbox.x)
      const overlapY = Math.min(n.bbox.y + n.bbox.h, t.bbox.y + t.bbox.h) - Math.max(n.bbox.y, t.bbox.y)
      if (overlapX > Math.min(n.bbox.w, t.bbox.w) * 0.6 && overlapY > 0) {
        n.kind = 'strikethrough'
        n.candidates.unshift({ kind: 'strikethrough', confidence: 0.8 })
        break
      }
    }
  }

  return {
    strokes,
    groups,
    nodes,
    textRegions,
    arrows,
  }
}

export { bboxOf }
