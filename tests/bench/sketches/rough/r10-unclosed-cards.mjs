import { rbox, rtext } from '../../lib/rough.mjs'

/** New UI: three skewed, unclosed cards under a squiggle; the note carries content. */
export default {
  id: 'r10-unclosed-cards',
  title: 'NEW: three skewed unclosed boxes under a squiggle; the note names the features',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'section-heading', rect: { x: 480, y: 100, w: 320, h: 50 } },
    { role: 'card-1', rect: { x: 100, y: 200, w: 320, h: 260 }, must: true },
    { role: 'card-2', rect: { x: 480, y: 200, w: 320, h: 260 }, must: true },
    { role: 'card-3', rect: { x: 860, y: 200, w: 320, h: 260 }, must: true },
  ],
  strokes: [
    rtext(500, 124, 280, { amp: 7 }),
    rbox(100, 200, 320, 260, { skew: 0.04 }),
    rbox(480, 205, 320, 255, { skew: 0.04 }),
    rbox(860, 196, 320, 262, { skew: 0.04 }),
  ],
  notes: [
    { at: { x: 640, y: 330 }, text: 'features: Fast, Safe, Cheap. icon + title + one line each', content: 'Fast, Safe, Cheap' },
  ],
}
