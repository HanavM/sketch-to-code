import { circle, line, textLine } from '../lib/draw.mjs'

/** Archetype: "how it works" — four numbered steps on one connector line. */
export default {
  id: '12-timeline-steps',
  title: 'How-it-works timeline: four numbered circles on a horizontal connector with captions',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'heading', rect: { x: 450, y: 96, w: 380, h: 52 }, must: true },
    { role: 'timeline', rect: { x: 150, y: 262, w: 1000, h: 180 }, must: true },
    { role: 'step-1', rect: { x: 150, y: 266, w: 200, h: 170 }, must: true },
    { role: 'step-2', rect: { x: 450, y: 266, w: 200, h: 170 } },
    { role: 'step-3', rect: { x: 750, y: 266, w: 200, h: 170 } },
    { role: 'step-4', rect: { x: 1050, y: 266, w: 200, h: 170 } },
  ],
  strokes: [
    textLine(470, 122, 340, { amp: 7, wavelength: 44 }), // heading
    line(160, 300, 1120, 300),                           // the connector
    circle(220, 300, 30),                                // four step markers
    circle(520, 300, 30),
    circle(820, 300, 30),
    circle(1120, 300, 30),
    textLine(160, 392, 160),                             // four captions
    textLine(460, 392, 160),
    textLine(760, 392, 160),
    textLine(1060, 392, 160),
  ],
  notes: [
    { at: { x: 640, y: 300 }, text: 'four steps left to right on one line, numbered circle over a short caption' },
  ],
}
