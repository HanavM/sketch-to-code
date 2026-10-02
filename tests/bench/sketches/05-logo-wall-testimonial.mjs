import { circle, row, textBlock, textLine } from '../lib/draw.mjs'

/** Archetype: social proof — a row of logo placeholders above one pull quote. */
export default {
  id: '05-logo-wall-testimonial',
  title: 'Social proof band: five logo placeholders above a single quote with attribution',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'eyebrow', rect: { x: 500, y: 96, w: 280, h: 40 } },
    { role: 'logo-wall', rect: { x: 112, y: 172, w: 1096, h: 86 }, must: true },
    { role: 'quote', rect: { x: 312, y: 302, w: 656, h: 96 }, must: true },
    { role: 'avatar', rect: { x: 532, y: 442, w: 56, h: 56 } },
    { role: 'attribution', rect: { x: 604, y: 456, w: 200, h: 36 } },
  ],
  strokes: [
    textLine(520, 120, 240),                 // eyebrow ("trusted by")
    ...row(5, 120, 180, 180, 70, 50),        // five logo placeholder boxes
    ...textBlock(320, 330, 640, 2, 44, { amp: 6, wavelength: 40 }), // the quote
    circle(560, 470, 26),                    // avatar
    textLine(610, 478, 180),                 // name and role
  ],
  notes: [
    { at: { x: 640, y: 215 }, text: 'five client logo placeholders, evenly spaced and muted' },
    { at: { x: 640, y: 352 }, text: 'one pull quote in larger type, with avatar and name under it' },
  ],
}
