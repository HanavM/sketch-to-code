/**
 * A box drawn turned is built turned (n31).
 *
 * Round 31 c3 (hand, n27): three cards drawn as a fanned stack, each turned a
 * few degrees, were read as a ring (the turned outline missed the upright box
 * test) or as freehand, and built straight; a word fix ("tilt blue and pink
 * cards too") then turned them the wrong way. The angle is in the ink, so it
 * is read there (shapemark.ts tiltOf), told to codegen exactly (the box's own
 * size, its centre, rotate(deg)), and checked on the page: some element about
 * the box's own size, centred near where it was drawn, is turned within a
 * couple of degrees of the drawn angle, the same way. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'

const r1 = (v: number) => Math.round(v * 10) / 10

export function tiltBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>): string {
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (!m.tilt) continue
      const t = m.tilt
      lines.push(
        `- action ${i}: the box drawn turned at (${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h} is ONE element ${t.w}px wide and ${t.h}px tall ` +
        `(its own size, before turning), centred at (${t.cx},${t.cy}), with transform: rotate(${r1(t.deg)}deg) ` +
        `(${t.deg < 0 ? 'its right side higher' : 'its right side lower'}); its contents turn with it. Keep the angle and the stacking order as drawn ` +
        `(a box drawn later sits on top).`,
      )
    }
  })
  return lines.length
    ? `BOXES DRAWN TURNED (deterministic, the angle measured from the ink; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

interface NodeLike { id: string; tag: string; rect: BBox; style: { transform?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }

/** The rotation (degrees, CSS sense) a computed transform applies, or 0. */
export function angleOf(transform: string | undefined): number {
  if (!transform) return 0
  const m = /matrix\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)/.exec(transform)
  if (!m) return 0
  return Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI
}

export function verifyTilts(marks: ShapeMark[], after: Snap): { satisfied: boolean; unverifiable?: boolean; reason: string } {
  const tilted = marks.filter((m) => m.tilt)
  if (!tilted.length) return { satisfied: true, unverifiable: true, reason: 'no boxes drawn turned' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  const used = new Set<string>()
  for (const m of tilted) {
    const t = m.tilt!
    const aabb = m.box
    // the element whose upright bounds best match the space the turned box takes
    let best: { n: NodeLike; d: number } | null = null
    for (const n of after.nodes) {
      if (used.has(n.id)) continue
      const r = n.rect
      if (Math.abs(r.w - aabb.w) > aabb.w * 0.35 || Math.abs(r.h - aabb.h) > aabb.h * 0.4) continue
      const d = Math.hypot(r.x + r.w / 2 - t.cx, r.y + r.h / 2 - t.cy)
      if (d > 120) continue
      const turned = Math.abs(angleOf(n.style.transform)) > 0.5 ? 0 : 1
      const score = d + turned * 200
      if (!best || score < best.d) best = { n, d: score }
    }
    const what = `the box drawn turned ${r1(t.deg)} degrees at (${aabb.x},${aabb.y}) ${aabb.w}x${aabb.h}`
    if (!best) { faults.push(`${what}: nothing about that size was built near it; build one element ${t.w}x${t.h} centred at (${t.cx},${t.cy}), rotate(${r1(t.deg)}deg)`); continue }
    used.add(best.n.id)
    const got = angleOf(best.n.style.transform)
    if (Math.abs(got - t.deg) > Math.max(1.5, Math.abs(t.deg) * 0.35)) {
      faults.push(`${what} is built as a <${best.n.tag}> turned ${r1(got)} degrees: set its transform to rotate(${r1(t.deg)}deg) ` +
        `(${t.deg < 0 ? 'right side higher' : 'right side lower'}); change nothing else`)
    }
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${tilted.length} box${tilted.length > 1 ? 'es' : ''} built turned as drawn` }
}
