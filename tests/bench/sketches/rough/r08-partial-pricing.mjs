import { rbox, rtext } from '../../lib/rough.mjs'

/** New UI: two pricing boxes and the corner of a third; the words say three. */
export default {
  id: 'r08-partial-pricing',
  title: 'NEW: pricing from two loose boxes and half of a third; the note says three tiers',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'heading', rect: { x: 440, y: 80, w: 400, h: 60 } },
    { role: 'tier-1', rect: { x: 120, y: 180, w: 320, h: 420 }, must: true },
    { role: 'tier-2', rect: { x: 480, y: 160, w: 320, h: 460 }, must: true },
    { role: 'tier-3', rect: { x: 840, y: 180, w: 320, h: 420 }, must: true },
  ],
  strokes: [
    rtext(500, 110, 280, { amp: 7 }),
    rbox(120, 180, 320, 420),
    rbox(480, 160, 320, 460, { close: 'overlap' }),
    rbox(840, 180, 320, 420, { sides: 2 }),
  ],
  notes: [
    { at: { x: 640, y: 390 }, text: '3 pricing tiers, middle one highlighted, each: price + Choose button' },
  ],
}
