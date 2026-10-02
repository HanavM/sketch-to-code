import { box, hatch, textBlock, textLine } from '../lib/draw.mjs'

/** Archetype: developer docs / landing hybrid — persistent sidebar plus a content column. */
export default {
  id: '10-docs-landing-hybrid',
  title: 'Docs-style landing with a top bar, left nav sidebar and a content column with a code block',
  viewport: { width: 1440, height: 900 },
  regions: [
    { role: 'topbar', rect: { x: 0, y: 12, w: 1440, h: 68 } },
    { role: 'sidebar', rect: { x: 24, y: 90, w: 292, h: 752 }, must: true },
    { role: 'doc-heading', rect: { x: 372, y: 120, w: 480, h: 60 }, must: true },
    { role: 'doc-body', rect: { x: 372, y: 192, w: 640, h: 80 } },
    { role: 'code-block', rect: { x: 352, y: 312, w: 776, h: 216 }, must: true },
  ],
  strokes: [
    box(30, 20, 1380, 52),                               // top bar
    box(30, 96, 280, 740),                               // sidebar
    // short sidebar items on purpose: a LONG squiggle whose end sits near the
    // start of another squiggle can pair with it as a two-stroke arrow
    // (packages/ink/src/arrows.ts scales the pairing tolerance with the head
    // stroke's length), and a phantom arrow reads as flow in design mode
    textLine(60, 142, 150),                              // sidebar nav items
    textLine(60, 192, 160),
    textLine(60, 242, 140),
    textLine(60, 292, 155),
    textLine(380, 152, 460, { amp: 7, wavelength: 44 }), // page heading
    ...textBlock(380, 212, 620, 2, 36),                  // intro paragraph
    box(360, 320, 760, 200),                             // code block frame
    hatch(380, 340, 720, 160),                           // hatching = a FILLED region
  ],
  notes: [
    { at: { x: 170, y: 220 }, text: 'left sidebar is the docs nav, four top level links' },
    { at: { x: 740, y: 420 }, text: 'the shaded box is a code sample on a dark fill, monospace' },
  ],
}
