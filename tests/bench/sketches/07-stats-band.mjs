import { box, textLine } from '../lib/draw.mjs'

/** Archetype: a metrics band — four big numbers with captions in one strip. */
export default {
  id: '07-stats-band',
  title: 'Stats band with four big numbers and a short label under each',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'stats-band', rect: { x: 72, y: 252, w: 1136, h: 236 }, must: true },
    { role: 'stat-1', rect: { x: 140, y: 300, w: 230, h: 140 }, must: true },
    { role: 'stat-2', rect: { x: 410, y: 300, w: 230, h: 140 } },
    { role: 'stat-3', rect: { x: 680, y: 300, w: 230, h: 140 } },
    { role: 'stat-4', rect: { x: 950, y: 300, w: 230, h: 140 } },
  ],
  strokes: [
    box(80, 260, 1120, 220),                             // the band
    textLine(180, 340, 120, { amp: 9, wavelength: 34 }), // four big numbers
    textLine(450, 340, 120, { amp: 9, wavelength: 34 }),
    textLine(720, 340, 120, { amp: 9, wavelength: 34 }),
    textLine(990, 340, 120, { amp: 9, wavelength: 34 }),
    textLine(160, 404, 170),                             // four captions
    textLine(430, 404, 170),
    textLine(700, 404, 170),
    textLine(970, 404, 170),
  ],
  notes: [
    { at: { x: 640, y: 288 }, text: 'one full-width band, four metrics across it, big number over a small label' },
  ],
}
