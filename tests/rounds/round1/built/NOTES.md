# Round 1 live builds (target left, built right)

| page | run | likeness | colour | structure | layout | tokens |
|---|---|---|---|---|---|---|
| c1 sunset hero | 123s | 35% | 93% | 70% | 0% (0/6 regions) | ~76k for both pages |
| e1 sign-in | 42s | 11% | 95% | 84% | 36% (4/6) | |
| c1 sunset hero, v2 (note focus fix + fairer sketch) | 107s | 48% | 93% | 75% | 26% (2/6) | ~33k |
| e2 pricing | 66s | 31% | 94% | 65% | 49% (4/5) | ~43k for e2+e3 |
| e3 blog list | 71s | 14% | 94% | 58% | 47% (7/8) | |

What failed:
- c1: the whole-page box the person drew came out as a literal wavy top and bottom edge.
- c1: nav (logo + links) and the subheading were dropped; the headline came out one line, not huge.
- e1: card sits where drawn but ~65px lower and taller; grey page background lost; field labels and subtitle dropped (title, email regions missed).
- e1 scores 11% likeness (lift over a blank white page, which already scores 95% colour): harsh but explainable.

Readings (read-only, 9 pages): 8 ok first time, 1 ran out of turns on bad JSON (now salvaged); 3 wrapped the answer.

## Step n6 (2026-10-20)
- Root cause of c1's lost subheading: a typed note took the WHOLE nearby drawing (headline, subheading and
  button chain into one cluster), so "huge serif headline" and "white pill button" both claimed the subheading
  strokes. Fix: each note now carries a focus, the strokes right where it was typed; it attaches only there.
- c1's wavy edges came from the sketch: a full-width box over the nav plus "whole page: gradient" on it. v2 draws
  the logo and links and says the page look as a whole-page note. Wavy edges gone, nav and subheading back.
- Still off on c1: the headline is about half the target's size (one line, not two); the logo is tiny.
- e2/e3: content right, but the build sits ~25-60px lower than drawn and a little wider (e1 showed the same).
  e3's drawn nav box became a dark bar (target has a plain nav row): again, a box reads as a filled bar.

## Step n7 (2026-10-20)
- Drawn type size now carries through: stacked text squiggles' spacing is read as line height and passed to
  codegen as a font size (c1 headline: 108px drawn pitch -> ~98px; target 120px). Codegen is also told the
  region is where the block must land (top within ~16px, width within ~10%).
- c1 v3: likeness 48% -> 57% (colour 94, structure 78, layout 26% -> 43%, regions 5/6). Headline is two big
  lines now; links region still scored missed (built links sit ~10px low). ~34k tokens.
- Implied sizes for the other creative pages from their sketches: c2 157 (target 190), c3 70 (84), c4 87 (104),
  c5 122 (240, its giant "01" is drawn too small) and 75 (58). Sketch pitch, not the reader, limits these.
