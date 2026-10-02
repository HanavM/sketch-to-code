import { box, circle, imageBox, row, textLine } from '../lib/draw.mjs'

/** Archetype: the default B2B SaaS top-of-page — nav, big claim, two CTAs, product shot. */
export default {
  id: '01-saas-hero',
  /** What kind of landing page this is, in one line. */
  title: 'SaaS hero with nav, headline, two buttons and a screenshot slot',
  /** The viewport the sketch is drawn for. */
  viewport: { width: 1280, height: 900 },
  /**
   * The INTENDED regions, as semantic rects. This is the answer key: the
   * benchmark scores whether a rendered element landed on each one.
   * `role` is a short slug; `must` marks regions whose absence is a failure
   * rather than a partial score.
   */
  regions: [
    { role: 'nav', rect: { x: 0, y: 0, w: 1280, h: 92 }, must: true },
    { role: 'headline', rect: { x: 320, y: 176, w: 640, h: 64 }, must: true },
    { role: 'subhead', rect: { x: 400, y: 248, w: 480, h: 44 } },
    { role: 'cta-primary', rect: { x: 470, y: 310, w: 170, h: 68 }, must: true },
    { role: 'cta-secondary', rect: { x: 644, y: 310, w: 170, h: 68 } },
    { role: 'screenshot', rect: { x: 230, y: 408, w: 820, h: 424 }, must: true },
  ],
  /** Polylines, in drawing order. */
  strokes: [
    box(40, 24, 1200, 56),              // navbar
    circle(72, 52, 16),                 // logo mark
    textLine(880, 52, 180),             // nav links
    box(1100, 34, 112, 36, { radius: 10 }), // nav button
    textLine(340, 206, 600, { amp: 7, wavelength: 46 }), // headline (large writing)
    textLine(420, 268, 440),            // subhead
    ...row(2, 480, 320, 150, 48, 24, { radius: 20 }), // two CTAs
    ...imageBox(240, 420, 800, 400),    // rect with an X = image placeholder
  ],
  /** Typed notes: words the user types on the page. */
  notes: [
    { at: { x: 640, y: 206 }, text: 'big bold headline, dark text on white' },
    { at: { x: 640, y: 620 }, text: 'product screenshot placeholder, rounded with a soft shadow' },
  ],
}
