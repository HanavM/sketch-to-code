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

## Step n8 (2026-10-21): round 1 completed live
| page | run | likeness | colour | structure | layout | billed tokens |
|---|---|---|---|---|---|---|
| c2 brutalist type | 232s | 36% | 83% | 54% | 36% (2/4) | 91k |
| c3 split studio | ~230s | 51% | 90% | 66% | 45% | 70k |
| c4 neon dark | ~170s | 36% | 69% | 30% | 8% | 35k |
| c5 editorial | ~200s | 15% | 93% | 59% | 51% | 57k |
| e4 contact | ~120s | 11% | 98% | 83% | 35% | 25k |
| e5 dashboard | ~110s | 63% | 98% | 76% | 76% | 24k |

Round 1 now has all 10 pages built (c1 57%, c2 36%, c3 51%, c4 36%, c5 15%, e1 11%, e2 31%, e3 14%, e4 11%, e5 63%).
Everyday pages look right by eye (e4, e5 near copies); their low numbers are the white-page lift-over-blank.

What failed, and the common cause:
- c2: the page look was typed on the nav box ("bright yellow page ... thick black rule under nav"): nav became a
  black filled bar, links fell below it. c4: "near-black page with faint purple grid" typed on the nav box: the
  dark look stopped where the content stopped (bottom third white), nav dropped. c5: "magazine on warm paper"
  typed on the masthead: masthead became a tinted band. Three pages, one cause: a page-look note typed on a
  block styles only that block. Fix (this step): notes that name the page (page, site, background, paper,
  theme, whole...) also go to codegen as PAGE LOOK, applied to the page root at full viewport height.
- c2 headline ~50px vs 160px drawn pitch; c5 "01" small (drawn small); c3 quoted copy went to the small line
  under the heading instead of the heading; c5 sidebar box became an image placeholder.
- Cost: c2 and c3 codegen ran long (690-830k cache reads). 6 pages = 303k billed, over the 300k/day budget by
  ~1%. Bench now takes --budget N and stops before a page that could pass it (worst page 95k).

## Step n13 (2026-10-21, free): why c2's headline shrank
- The ink is not the cause: c2's two headline squiggles are 172px apart and read as a 157px stack (target 190).
- The size was read per action, so it only survived if one action cited both lines. A reading that splits
  "MAKE IT" / "LOUD" into two actions, or cites one line elsewhere, drops it and codegen falls back to its
  default heading. Now stacks are read once from every squiggle on the page and given to each action that
  cites any of their lines (tests: split headline keeps 157px+ on both; headline+body keep two sizes).
- The c2 run record was not kept (bench out/ is not committed), so which of the two happened is unproven.
  Live bench runs now write a small digest per page to built/runs/<id>.json (actions, squiggles, type size,
  region, likeness, tokens) so the next live check can see it.

## Step n22 (2026-10-21, free): two round-1 misses traced
- c3 (heading copy on the small line): the panel note was typed at the panel's centre, 21px above the first
  body line. Note focus took every stroke within 24px of the nearest one, and the panel box (distance 0) let
  the body line in, so the note went to the panel and the body; the copy "Plants that grow with you" and
  "serif" landed on the body. Fix: inside a drawn box, a note typed on (or between the lines of) a block
  inside it is about that block; otherwise the box's contents leave the focus. Only closed, box-shaped strokes
  count as containers (rings, jagged ridges and diagonal bands on layered pages do not). Checked offline on
  the round 1-3 dry-run notes: only c3's panel note and round-3 c1's button note change (the button no
  longer drags in both ridges); every other note is unchanged.
- c5 (sidebar became a picture): the sidebar was a plain box with no note; nothing said it was not an image.
  Reading and codegen now both say a plain box is never an image (only a box with an X, or a note saying
  picture/photo/image); an empty box beside the main column is a sidebar with short plausible text.
  Prompt-only: proven only by the next live run of c5.

## Step n24 (2026-10-21, free): the likeness score punished small offsets
- Check: score each target against ITSELF moved down a little. With the old structure measure (plain SSIM per
  8px cell) the target moved 16px lost most of its structure lift (e4 0%, e3 2%, c5 5%, e1 12%), and at 40px
  nearly all of it. So "right page, sitting a bit low" scored like "built nothing", and round-to-round gains
  were partly offset noise. Placement already has its own score (layout, region overlap).
- Fix (likeness v2): each 8px cell is matched at its best offset within 2 cells (~16px at 1280 wide). The target
  moved 16px now keeps 99-100%; moved 40px keeps only 2-74%, so real misplacement still costs. Wrong page and
  blank page still score 0 (all 30 round 1-3 targets re-measured: self 100%, blank baselines unchanged).
  The old number is kept as `structureStrict`, and run digests carry both `overall` (v2) and `overallV1`.
- Round 1 re-scored from the saved side-by-sides (`node tests/rounds/rescore.mjs`, zero tokens). The crop
  re-score reproduces the recorded v1 likeness within 3 points, so the comparison is fair:

| page | structure v1 | structure v2 | target moved 16px v1 / v2 | moved 40px v1 / v2 | likeness v1 | likeness v2 |
|---|---|---|---|---|---|---|
| c1 sunset hero (v3) | 47% | 68% | 49% / 100% | 6% / 32% | 60% | 67% |
| c2 brutalist type | 0% | 3% | 19% / 100% | 0% / 19% | 36% | 37% |
| c3 split studio | 28% | 51% | 61% / 100% | 32% / 63% | 51% | 59% |
| c4 neon dark | 28% | 34% | 78% / 100% | 63% / 74% | 36% | 38% |
| c5 editorial | 0% | 0% | 5% / 100% | 0% / 12% | 15% | 15% |
| e1 sign-in | 0% | 0% | 12% / 100% | 0% / 4% | 11% | 11% |
| e2 pricing | 0% | 35% | 29% / 100% | 14% / 41% | 30% | 42% |
| e3 blog list | 0% | 2% | 2% / 100% | 0% / 12% | 14% | 15% |
| e4 contact | 0% | 5% | 0% / 99% | 0% / 2% | 10% | 12% |
| e5 dashboard | 25% | 64% | 36% / 100% | 38% / 60% | 63% | 77% |

- What v2 does NOT change, honestly: c2, c5, e1, e3, e4 stay low because the builds really differ. Looking again
  at e4 (called a "near copy" in n8, wrongly): heading copy "Get in touch" became "Contact Us", the subtitle and
  field labels were dropped, the form is narrower and the office card wider. e1 lost its grey page. These are
  copy/label losses, the next free thing to trace from the run digests.

## Step n25 (2026-10-21, free): where e4/e1 copy and labels went
- Not the pipeline: the round-1 HAND sketches never said "Get in touch", the sub-lines or the field labels, so the
  build invented "Contact Us" and used placeholders. The auto planner (rounds 2-3) had the same hole for unmarked
  text beside a block: a label just above a field and a smaller line just under a heading were said nowhere
  (e1) or hung on an unmarked wrapper (e4 form).
- Fix: the planner now says 'label "Email" above, input "..."', 'label "Name" above an empty field' and
  '"Sign in", line under: "Welcome back..."'; text said this way isn't repeated on the wrapper. Codegen contract:
  quoted copy is word for word (never retitled), a label above is a visible label, not a placeholder.
- Plan diff: round 1 e1/e4 and round 2 e1 checkout fields only; round 3 unchanged. Dry wire: notes arrive whole.
- Check live cheaply: --set round1auto --only e1,e4 (~25k each) or --read-only first (~7k each).
