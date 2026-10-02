import { box, circle, hatch, textLine, wave } from '../lib/draw.mjs'

/** Archetype: dark, full-bleed gradient hero with one CTA and a wave divider. */
export default {
  id: '14-dark-gradient-hero',
  title: 'Dark gradient hero with inline nav, centred headline, one CTA and a wave divider',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'hero', rect: { x: 0, y: 0, w: 1280, h: 640 }, must: true },
    { role: 'nav', rect: { x: 40, y: 40, w: 1200, h: 72 } },
    { role: 'headline', rect: { x: 320, y: 214, w: 640, h: 76 }, must: true },
    { role: 'subhead', rect: { x: 400, y: 298, w: 480, h: 44 } },
    { role: 'cta', rect: { x: 532, y: 372, w: 216, h: 72 }, must: true },
    { role: 'wave-divider', rect: { x: 0, y: 576, w: 1280, h: 90 } },
  ],
  strokes: [
    box(20, 16, 1240, 600),                              // the hero band
    // shading INSIDE the hero's boundary = the whole band is filled. Scribbled
    // across an empty strip rather than over the whole hero: burying the
    // headline in ink would hide the marks that matter.
    hatch(60, 470, 1160, 120, { step: 34 }),             // shading = a FILLED background
    circle(84, 72, 18),                                  // logo mark
    textLine(980, 78, 220),                              // nav links
    textLine(340, 252, 600, { amp: 9, wavelength: 48 }), // headline
    textLine(420, 320, 440),                             // subhead
    box(540, 380, 200, 56, { radius: 24 }),              // single CTA
    wave(20, 610, 1240, { amp: 22, crests: 2 }),         // wave divider at the hero's foot
  ],
  notes: [
    { at: { x: 640, y: 252 }, text: 'dark hero with a gradient background and light text' },
    { at: { x: 640, y: 300 }, text: 'the shading means a filled dark background, do not draw the hatch lines' },
    { at: { x: 640, y: 612 }, text: 'wave divider between the hero and the section below it' },
  ],
}
