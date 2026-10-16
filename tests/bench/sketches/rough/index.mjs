/**
 * The ROUGH set (s2c-009): what SEED.md says users actually draw. Loose,
 * partial, overdrawn marks and mostly words, drawn with lib/rough.mjs, at most
 * 4 strokes a page against the tidy set's 14.
 *
 * r01-r06 and r12-r15 are EDITS on an existing page (sketches/rough/base.mjs): delete,
 * rewrite, restyle, move, add-into, delete-one-link. They exist because every
 * tidy page reads as `design` in auto mode, so the gesture grammar had never
 * been measured (s2c-012). r07-r11 are new UI on the blank page.
 *
 *   node tests/bench/run.mjs --set rough [--dry]
 */
import r01 from './r01-scribble-out-card.mjs'
import r02 from './r02-strike-headline.mjs'
import r03 from './r03-ring-button-green.mjs'
import r04 from './r04-arrow-move-quote.mjs'
import r05 from './r05-footer-newsletter.mjs'
import r06 from './r06-x-out-nav-link.mjs'
import r07 from './r07-hero-mostly-words.mjs'
import r08 from './r08-partial-pricing.mjs'
import r09 from './r09-overdrawn-form.mjs'
import r10 from './r10-unclosed-cards.mjs'
import r11 from './r11-sloppy-nav-hero.mjs'
import r12 from './r12-green-pen-ring-button.mjs'
import r13 from './r13-two-arrows-swap-cards.mjs'
import r14 from './r14-caret-insert-nav-link.mjs'
import r15 from './r15-box-one-more-tile.mjs'

export const rough = [
  r01, r02, r03, r04, r05, r06, r07, r08, r09, r10, r11,
  // s2c-015: the gestures the reader knows and no page drew (docs/visual-language.md)
  r12, r13, r14,
  // row 9, add one more of a list: needs the list base (base.mjs BASE_LIST_APP)
  r15,
]

export default rough
