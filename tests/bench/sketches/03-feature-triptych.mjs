import { circle, row, textLine } from '../lib/draw.mjs'

/** Archetype: three equal feature cards under a section heading. */
export default {
  id: '03-feature-triptych',
  title: 'Feature triptych: section heading above three equal icon-and-title cards',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'section-heading', rect: { x: 420, y: 112, w: 440, h: 56 }, must: true },
    { role: 'section-subhead', rect: { x: 460, y: 174, w: 360, h: 40 } },
    { role: 'feature-1', rect: { x: 112, y: 252, w: 356, h: 316 }, must: true },
    { role: 'feature-2', rect: { x: 502, y: 252, w: 356, h: 316 }, must: true },
    { role: 'feature-3', rect: { x: 892, y: 252, w: 356, h: 316 }, must: true },
  ],
  strokes: [
    textLine(440, 142, 400, { amp: 7, wavelength: 44 }), // section heading
    textLine(480, 192, 320),                             // section subhead
    ...row(3, 120, 260, 340, 300, 50),                   // three cards
    circle(172, 312, 22),                                // icon slots
    circle(562, 312, 22),
    circle(952, 312, 22),
    textLine(162, 382, 200),                             // card titles
    textLine(552, 382, 200),
    textLine(942, 382, 200),
  ],
  notes: [
    { at: { x: 640, y: 142 }, text: 'three equal feature cards in one row, icon above a short title' },
  ],
}
