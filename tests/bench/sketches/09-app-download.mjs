import { box, circle, row, textBlock, textLine } from '../lib/draw.mjs'

/** Archetype: mobile app landing — copy and download buttons left, device mockup right. */
export default {
  id: '09-app-download',
  title: 'App download page: copy with two download buttons beside a phone mockup',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'logo', rect: { x: 64, y: 34, w: 56, h: 56 } },
    { role: 'headline', rect: { x: 112, y: 188, w: 500, h: 64 }, must: true },
    { role: 'subhead', rect: { x: 112, y: 266, w: 440, h: 76 } },
    { role: 'download-1', rect: { x: 112, y: 372, w: 216, h: 76 }, must: true },
    { role: 'download-2', rect: { x: 340, y: 372, w: 216, h: 76 } },
    { role: 'device-mockup', rect: { x: 752, y: 132, w: 316, h: 616 }, must: true },
  ],
  strokes: [
    circle(92, 62, 20),                                  // logo mark
    textLine(120, 220, 480, { amp: 8, wavelength: 46 }), // headline
    ...textBlock(120, 282, 420, 2, 34),                  // supporting copy
    ...row(2, 120, 380, 200, 60, 28, { radius: 14 }),    // two download buttons
    box(760, 140, 300, 600, { radius: 36 }),             // phone body
    box(786, 190, 248, 500),                             // phone screen
    textLine(812, 262, 200),                             // in-app content lines
    textLine(812, 322, 160),
  ],
  notes: [
    { at: { x: 330, y: 220 }, text: 'copy on the left, phone mockup on the right' },
    { at: { x: 330, y: 410 }, text: 'two download buttons side by side, dark pills with rounded corners' },
  ],
}
