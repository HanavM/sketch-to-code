import { col, path, textLine } from '../lib/draw.mjs'

/** Archetype: FAQ list as a stack of collapsible rows. */
export default {
  id: '06-faq-accordion',
  title: 'FAQ page: heading above four accordion rows with a chevron affordance',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'heading', rect: { x: 460, y: 104, w: 360, h: 56 }, must: true },
    { role: 'faq-list', rect: { x: 272, y: 212, w: 736, h: 412 }, must: true },
    { role: 'item-1', rect: { x: 272, y: 212, w: 736, h: 92 }, must: true },
    { role: 'item-2', rect: { x: 272, y: 316, w: 736, h: 92 } },
    { role: 'item-3', rect: { x: 272, y: 420, w: 736, h: 92 } },
    { role: 'item-4', rect: { x: 272, y: 524, w: 736, h: 92 } },
  ],
  strokes: [
    textLine(480, 132, 320, { amp: 7, wavelength: 44 }), // heading
    ...col(4, 280, 220, 720, 84, 20),                    // four rows
    textLine(320, 262, 420),                             // the questions
    textLine(320, 366, 380),
    textLine(320, 470, 440),
    textLine(320, 574, 360),
    path([{ x: 938, y: 254 }, { x: 952, y: 270 }, { x: 966, y: 254 }]), // chevron = collapsible
  ],
  notes: [
    { at: { x: 640, y: 262 }, text: 'accordion list, one question per row, chevron on the right of every row' },
  ],
}
