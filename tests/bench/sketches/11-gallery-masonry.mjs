import { box, hatch, textLine } from '../lib/draw.mjs'

/** Archetype: portfolio / gallery page — three columns of uneven image tiles. */
export default {
  id: '11-gallery-masonry',
  title: 'Masonry gallery: heading above three columns of image tiles with uneven heights',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'heading', rect: { x: 480, y: 96, w: 320, h: 52 } },
    { role: 'gallery', rect: { x: 92, y: 182, w: 1076, h: 546 }, must: true },
    { role: 'tile-1', rect: { x: 100, y: 190, w: 280, h: 300 }, must: true },
    { role: 'tile-2', rect: { x: 100, y: 520, w: 280, h: 200 } },
    { role: 'tile-3', rect: { x: 490, y: 190, w: 280, h: 200 } },
    { role: 'tile-4', rect: { x: 490, y: 420, w: 280, h: 300 } },
  ],
  strokes: [
    textLine(500, 120, 280, { amp: 7, wavelength: 42 }), // heading
    box(100, 190, 280, 300),                             // column 1
    box(100, 520, 280, 200),
    box(490, 190, 280, 200),                             // column 2
    box(490, 420, 280, 300),
    box(880, 190, 280, 250),                             // column 3
    box(880, 470, 280, 250),
    hatch(116, 206, 248, 268),                           // two tiles shaded = filled images
    hatch(506, 436, 248, 268),
  ],
  notes: [
    { at: { x: 640, y: 120 }, text: 'masonry grid, three columns, tiles of different heights, small even gaps' },
  ],
}
