import { rbox, rring, rtext } from '../../lib/rough.mjs'

/** New UI: a top bar that doesn't close, a dented logo, a squiggle and a 3-sided button. */
export default {
  id: 'r11-sloppy-nav-hero',
  title: 'NEW: nav + hero from an unclosed bar, a dented ring, one squiggle and a 3-sided button',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'topbar', rect: { x: 20, y: 16, w: 1240, h: 60 }, must: true },
    { role: 'logo', rect: { x: 40, y: 26, w: 40, h: 40 } },
    { role: 'hero-headline', rect: { x: 320, y: 230, w: 640, h: 64 }, must: true, minWords: 3 },
    { role: 'cta', rect: { x: 560, y: 340, w: 160, h: 50 }, must: true },
  ],
  strokes: [
    rbox(20, 16, 1240, 60),
    rring(60, 46, 18, 17),
    rtext(340, 262, 600, { amp: 9 }),
    rbox(560, 340, 160, 50, { sides: 3 }),
  ],
  notes: [
    { at: { x: 900, y: 46 }, text: 'nav: Docs, Pricing, Sign in on the right', content: 'Docs, Pricing, Sign in' },
    { at: { x: 640, y: 262 }, text: 'headline: Your notes, everywhere', content: 'Your notes, everywhere' },
    { at: { x: 640, y: 365 }, text: 'Get the app', content: 'Get the app' },
  ],
}
