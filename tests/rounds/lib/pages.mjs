/**
 * Turn a round's plan ([[role, kind]...] + notes) into a bench page: strokes on
 * the target's own measured boxes (<round>/targets.json). Shared by every round's
 * hand sketches and auto plans.
 */
import { existsSync, readFileSync } from 'node:fs'
import { box, circle, imageBox, textLine, textBlock } from '../../bench/lib/draw.mjs'

/** One region -> polylines, by mark kind. Marks sit a few px inside the box. */
function mark(kind, r) {
  const { x, y, w, h } = r
  const cy = y + h / 2
  switch (kind) {
    case 'box': return [box(x + 4, y + 4, w - 8, h - 8)]
    case 'button': return [box(x + 2, y + 2, w - 4, h - 4, { radius: Math.min(16, h / 2 - 2) })]
    case 'heading': return h > 140
      ? textBlock(x + 8, y + h * 0.3, w * 0.9, 2, h * 0.45, { amp: 8, wavelength: 50 })
      // drawn as tall as the type: a 28px title wobbles ~19px, a big one up to the cap
      : [textLine(x + 8, cy, w * 0.9, { amp: Math.max(7, Math.min(18, h * 0.3)), wavelength: 46 })]
    case 'text': return h > 40 ? textBlock(x + 4, y + 14, w - 8, 2, Math.min(24, h / 2)) : [textLine(x + 4, cy, w - 8)]
    case 'image': return imageBox(x + 4, y + 4, w - 8, h - 8)
    case 'circle': return [circle(x + w / 2, cy, Math.min(w, h) / 2 - 4)]
    default: throw new Error(`unknown mark ${kind}`)
  }
}

/** pageMaker(dir)(id, kind, title, plan, notes); plan in drawing order, notes [[role, text]...]. */
export function pageMaker(DIR) {
  const { targets, calibration } = JSON.parse(readFileSync(`${DIR}targets.json`, 'utf8'))
  // the target's own creative techniques (measure.mjs, lib/effects.mjs); a build is graded on keeping them
  const effects = existsSync(`${DIR}effects.json`) ? JSON.parse(readFileSync(`${DIR}effects.json`, 'utf8')) : {}
  return function page(id, kind, title, plan, notes) {
    const regions = targets[id].regions
    const at = (role) => {
      const r = regions.find((g) => g.role === role)
      if (!r) throw new Error(`${id}: no region ${role}`)
      return r.rect
    }
    return {
      id, kind, title, target: `${DIR}${id}.html`, ref: `${DIR}ref/${id}.png`,
      viewport: { width: 1280, height: 900 },
      baseline: calibration[id].blank,
      effects: effects[id]?.names ?? [],
      regions,
      plan, planNotes: notes,
      strokes: plan.flatMap(([role, k]) => mark(k, at(role))),
      // role '*' = a whole-page note (Alt+Shift+N): the look of the page, not of a mark
      notes: notes.map(([role, text]) => {
        if (role === '*') return { at: { x: 640, y: 450 }, text, whole: true }
        const r = at(role)
        return { at: { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }, text }
      }),
    }
  }
}
