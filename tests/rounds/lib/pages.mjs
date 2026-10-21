/**
 * Turn a round's plan ([[role, kind]...] + notes) into a bench page: strokes on
 * the target's own measured boxes (<round>/targets.json). Shared by every round's
 * hand sketches and auto plans.
 */
import { existsSync, readFileSync } from 'node:fs'
import { box, circle, imageBox, polygon, textLine, textBlock } from '../../bench/lib/draw.mjs'

/** One region -> polylines, by mark kind. Marks sit a few px inside the box. */
function mark(kind, r, opts = {}) {
  const { x, y, w, h } = r
  const cy = y + h / 2
  switch (kind) {
    case 'box': return [box(x + 4, y + 4, w - 8, h - 8)]
    case 'button': return [box(x + 2, y + 2, w - 4, h - 4, { radius: Math.min(16, h / 2 - 2) })]
    // a heading whose set size is known (auto plans): one line is one zigzag over the
    // letters (caps ~0.7 of the font, so the pen travels ~0.7 x fontPx crest to trough);
    // several lines are that many squiggles at the set line pitch
    case 'heading': if (opts.fontPx && opts.lines === 1 && opts.fontPx >= 40) {
      // a short word (a big "07") is drawn flatter: a zigzag about as tall as wide reads as a scratch-out
      // drawn on screen: a word bleeding off the page edge is zigzagged over its visible part
      const x0 = Math.max(x + 8, 6)
      const x1 = Math.min(x + 8 + w * 0.9, 1274)
      const amp = Math.min(0.35 * opts.fontPx, (x1 - x0) / 6)
      return [textLine(x0, cy, x1 - x0, { amp, wavelength: Math.max(46, amp * 3) })]
    }
    if (opts.fontPx && opts.lines >= 2 && h > 140) {
      return textBlock(x + 8, y + h / opts.lines / 2, w * 0.9, opts.lines, h / opts.lines, { amp: 8, wavelength: 50 })
    }
    return h > 140
      ? textBlock(x + 8, y + h * 0.3, w * 0.9, 2, h * 0.45, { amp: 8, wavelength: 50 })
      // drawn as tall as the type: a 28px title wobbles ~19px, a big one up to the cap
      : [textLine(x + 8, cy, w * 0.9, { amp: Math.max(7, Math.min(18, h * 0.3)), wavelength: 46 })]
    case 'text': return h > 40 ? textBlock(x + 4, y + 14, w - 8, 2, Math.min(24, h / 2)) : [textLine(x + 4, cy, w - 8)]
    case 'image': return imageBox(x + 4, y + 4, w - 8, h - 8)
    case 'circle': return [circle(x + w / 2, cy, Math.min(w, h) / 2 - 4)]
    // a cut-out drawn as its own outline, kept on screen (marks off the page edge break capture)
    case 'shape': return [polygon(opts.poly.map(([fx, fy]) => [
      Math.min(1274, Math.max(6, x + fx * w)), Math.min(894, Math.max(6, y + fy * h)),
    ]))]
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
      strokes: plan.flatMap(([role, k, o]) => mark(k, at(role), o)),
      // role '*' = a whole-page note (Alt+Shift+N): the look of the page, not of a mark
      notes: notes.map(([role, text]) => {
        if (role === '*') return { at: { x: 640, y: 450 }, text, whole: true }
        const r = at(role)
        return { at: { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }, text }
      }),
    }
  }
}
