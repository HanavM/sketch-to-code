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
    // several lines are drawn as several lines whatever the block's height: a 2-line 30px intro
    // (72px) drawn as one 36px squiggle read as a 52px one-line heading (round 3 c2)
    if (opts.fontPx && opts.lines >= 2) {
      const amp = h > 140 ? 8 : Math.max(4, Math.min(12, 0.35 * opts.fontPx))
      return textBlock(x + 8, y + h / opts.lines / 2, w * 0.9, opts.lines, h / opts.lines, { amp, wavelength: h > 140 ? 50 : 46 })
    }
    return h > 140
      ? textBlock(x + 8, y + h * 0.3, w * 0.9, 2, h * 0.45, { amp: 8, wavelength: 50 })
      // drawn as tall as the type: a 28px title wobbles ~19px, a big one up to the cap
      : [textLine(x + 8, cy, w * 0.9, { amp: Math.max(7, Math.min(18, h * 0.3)), wavelength: 46 })]
    // vertical type (a label running up the page edge) is one squiggle drawn down its length;
    // flat lines in a 15px-wide box came out as specks (round 3 c5 side label)
    case 'text': if (h >= 3 * w && h > 60) {
      return [textLine(0, 0, h - 8, { amp: Math.max(4, Math.min(8, w / 2)), seed: Math.round(x * 31 + y) })
        .map((p) => ({ ...p, x: x + w / 2 + p.y, y: y + 4 + p.x }))]
    }
    // a paragraph whose line count is known (auto plans): one squiggle per line at the real pitch
    if (opts.lines >= 2) return textBlock(x + 4, y + h / opts.lines / 2, w - 8, opts.lines, h / opts.lines)
    return h > 40 ? textBlock(x + 4, y + 14, w - 8, 2, Math.min(24, h / 2)) : [textLine(x + 4, cy, w - 8)]
    case 'image': return imageBox(x + 4, y + 4, w - 8, h - 8)
    case 'circle': return [circle(x + w / 2, cy, Math.min(w, h) / 2 - 4)]
    // a cut-out drawn as its own outline, kept on screen (marks off the page edge break capture)
    case 'shape': return [polygon(opts.poly.map(([fx, fy]) => [
      Math.min(1274, Math.max(6, x + fx * w)), Math.min(894, Math.max(6, y + fy * h)),
    ]))]
    default: throw new Error(`unknown mark ${kind}`)
  }
}

/** Is (x,y) on a mark's drawn area: its outline polygon for a cut-out shape, else its box. */
function onMark(kind, r, o, x, y) {
  if (kind === 'shape' && o?.poly) {
    const pts = o.poly.map(([fx, fy]) => [r.x + fx * r.w, r.y + fy * r.h])
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h

/**
 * Where a person types a mark's note: on the part of the mark they can see. A box keeps its
 * centre (typing inside a drawn box is how its contents are addressed). Any other mark's
 * note goes on the spot of its own area nearest its centre that no other mark covers: marks
 * drawn later sit on top; an earlier mark only gets in the way if it doesn't enclose this one.
 * Round 3 c1: both ridge notes landed at their box centres, inside the near ridge, so the far
 * ridge's colour went to the near one.
 */
export function noteSpot(plan, role, at) {
  const r = at(role)
  const centre = { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }
  const i = plan.findIndex(([ro]) => ro === role)
  const [, kind, o] = plan[i] ?? []
  if (!kind || kind === 'box') return centre
  const others = plan.map(([ro, k, oo], j) => ({ j, k, oo, rr: at(ro) }))
    .filter(({ j, rr }) => j !== i && (j > i || !contains(rr, r)))
  const free = (x, y) => onMark(kind, r, o, x, y) && !others.some(({ k, oo, rr }) => onMark(k, rr, oo, x, y))
  if (!(kind === 'heading' && o?.lines >= 2 && r.h > 140) && free(centre.x, centre.y)) return centre
  const step = 8, pad = Math.min(12, r.w / 4, r.h / 4)
  // clear of other marks by more than the reading's 24px focus slack if there is room, else less
  // a heading drawn as several lines: typed on one of its lines, not in the gap between them
  // (round 3 c5: typed between the headline's lines, the note reached the photo and line 1 only)
  const rows = kind === 'heading' && o?.lines >= 2 && r.h > 140
    ? Array.from({ length: o.lines }, (_, k) => r.y + (r.h / o.lines) * (k + 0.5))
    : null
  for (const clear of [28, 14, 0]) {
    let best = null, bd = Infinity
    for (let y = r.y + pad; y <= r.y + r.h - pad; y += step) {
      if (rows && !rows.some((ry) => Math.abs(ry - y) < step / 2)) continue
      for (let x = r.x + pad; x <= r.x + r.w - pad; x += step) {
        if (!free(x, y) || !free(x - clear, y) || !free(x + clear, y) || !free(x, y - clear) || !free(x, y + clear)) continue
        const d = Math.hypot(x - centre.x, y - centre.y)
        if (d < bd) { bd = d; best = { x: Math.round(x), y: Math.round(y) } }
      }
    }
    if (best) return best
  }
  return centre
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
        return { at: noteSpot(plan, role, at), text }
      }),
    }
  }
}
