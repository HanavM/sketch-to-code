import { box, imageBox, textBlock, textLine } from '../lib/draw.mjs'

/** Archetype: split hero — copy stacked on the left, visual on the right. */
export default {
  id: '02-split-hero',
  title: 'Split hero with copy and a CTA on the left and a media slot on the right',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'nav', rect: { x: 0, y: 0, w: 1280, h: 92 }, must: true },
    { role: 'headline', rect: { x: 72, y: 168, w: 500, h: 60 }, must: true },
    { role: 'body', rect: { x: 72, y: 240, w: 460, h: 80 } },
    { role: 'cta', rect: { x: 72, y: 352, w: 190, h: 68 }, must: true },
    { role: 'media', rect: { x: 668, y: 150, w: 544, h: 440 }, must: true },
  ],
  strokes: [
    box(40, 24, 1200, 56),              // navbar
    textLine(900, 52, 300),             // nav links
    textLine(80, 198, 480, { amp: 7, wavelength: 44 }), // headline
    ...textBlock(80, 258, 440, 2, 34),  // two lines of body copy
    box(80, 360, 180, 52, { radius: 20 }), // primary button
    textLine(292, 386, 120),            // secondary text link
    ...imageBox(680, 160, 520, 420),    // image placeholder
  ],
  notes: [
    { at: { x: 300, y: 198 }, text: 'two column split, copy left and image right, vertically centred' },
  ],
}
