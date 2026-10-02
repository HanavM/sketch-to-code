import { box, hatch, line, textLine } from '../lib/draw.mjs'

/** Archetype: comparison table — features down the first column, two options across. */
export default {
  id: '13-comparison-table',
  title: 'Comparison table with a shaded header row, a feature column and two option columns',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'heading', rect: { x: 450, y: 96, w: 380, h: 52 }, must: true },
    { role: 'table', rect: { x: 132, y: 212, w: 1016, h: 496 }, must: true },
    { role: 'header-row', rect: { x: 140, y: 220, w: 1000, h: 80 }, must: true },
    { role: 'col-features', rect: { x: 140, y: 300, w: 400, h: 400 }, must: true },
    { role: 'col-option-1', rect: { x: 540, y: 300, w: 300, h: 400 } },
    { role: 'col-option-2', rect: { x: 840, y: 300, w: 300, h: 400 } },
  ],
  strokes: [
    textLine(470, 122, 340, { amp: 7, wavelength: 44 }), // heading
    box(140, 220, 1000, 480),                            // table frame
    line(540, 220, 540, 700),                            // column rules
    line(840, 220, 840, 700),
    line(140, 300, 1140, 300),                           // row rules
    line(140, 400, 1140, 400),
    line(140, 500, 1140, 500),
    line(140, 600, 1140, 600),
    hatch(146, 226, 988, 68),                            // header row shaded = filled
    textLine(170, 352, 280),                             // feature labels
    textLine(170, 452, 300),
  ],
  notes: [
    { at: { x: 640, y: 258 }, text: 'header row has a filled background, first column lists features' },
    { at: { x: 640, y: 450 }, text: 'ruled rows, two option columns on the right' },
  ],
}
