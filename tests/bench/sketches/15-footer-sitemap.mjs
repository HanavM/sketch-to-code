import { box, circle, textLine } from '../lib/draw.mjs'

/** Archetype: footer-heavy sitemap page — short top, four columns of links below. */
export default {
  id: '15-footer-sitemap',
  title: 'Footer-heavy page: short headline above a four-column link footer with small print',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'hero-headline', rect: { x: 380, y: 112, w: 520, h: 60 } },
    { role: 'footer', rect: { x: 52, y: 372, w: 1176, h: 456 }, must: true },
    { role: 'footer-col-1', rect: { x: 112, y: 420, w: 220, h: 180 }, must: true },
    { role: 'footer-col-2', rect: { x: 412, y: 420, w: 220, h: 180 } },
    { role: 'footer-col-3', rect: { x: 712, y: 420, w: 220, h: 180 } },
    { role: 'footer-col-4', rect: { x: 1012, y: 420, w: 220, h: 180 } },
    { role: 'legal', rect: { x: 112, y: 740, w: 400, h: 40 } },
  ],
  strokes: [
    textLine(400, 142, 480, { amp: 8, wavelength: 46 }), // page headline
    box(60, 380, 1160, 440),                             // footer region
    // bigger writing than the links under them: "thicker = higher level"
    textLine(120, 442, 140, { amp: 6, wavelength: 38 }), // four column headings
    textLine(420, 442, 140, { amp: 6, wavelength: 38 }),
    textLine(720, 442, 140, { amp: 6, wavelength: 38 }),
    textLine(1020, 442, 140, { amp: 6, wavelength: 38 }),
    textLine(120, 500, 170),                             // links under each heading
    textLine(420, 500, 170),
    textLine(720, 500, 170),
    textLine(1020, 500, 170),
    textLine(120, 764, 360),                             // small print
    circle(1150, 770, 20),                               // footer logo mark
  ],
  notes: [
    { at: { x: 640, y: 470 }, text: 'four columns of footer links, a bold heading over each list' },
    { at: { x: 400, y: 764 }, text: 'copyright line on the last row with the logo mark on the right' },
  ],
}
