# Fifteen landing pages from fifteen sketches

What happens when you draw a landing page in about ten marks and press Run.
Measured, not estimated: every number below came out of `tests/bench/run.mjs`
against the real pipeline, on 2026-10-02.

## The headline

**All 15 pages produced real, working React + Tailwind.** No page failed, no run
errored, nothing had to be retried. Several results are good enough to ship as a
first draft.

| | |
|---|---|
| pages | 15 of 15 completed |
| marks drawn | 150 total, **mean 10 per page** (range 8–12) |
| drawing time | 6.9 min total, **27s per page** |
| run time | 39.6 min total, **158s per page** |
| tokens | **691k billed**, 5.95M cache reads — **46k billed per page** |
| vertical order | 91% correct, on the 11 pages where it could be measured |
| region score | 41% — **and this number is misleading; see below** |

## The most important finding is about the measurement, not the product

The region score asks: *is there a rendered element whose box overlaps the box I
drew, by at least 35%?* I chose it to be independent of the pipeline's own
self-assessment, which was right. But it turns out to answer the wrong question.

**Page 12 scored 0% and is a correct page.** Four numbered steps, a connecting
line, labels, a heading — a person would call it a success. It scored zero
because the model centred it in the upper third while my sketch had it lower and
wider. Nothing overlapped enough.

**Page 08 scored 20% and is the best output in the set.** A newsletter card with
a real heading, body copy, an email input, a Subscribe button, a consent
checkbox and a decorative wave. It lost points for being centred in a tidy card
instead of sprawling across my shaky rectangles.

The metric is also **biased by element size**, which produced a false pattern I
believed for several hours. `heading` is "missed" on 6 of 15 pages — but the
headings are nearly always *there*, 100–200px from where I drew them. A 1280×72
nav displaced by 60px still overlaps itself; a 400×40 headline displaced by 60px
does not. Containers pass and content fails **because containers are big**, not
because the pipeline handles them better.

I reported "containers land, content doesn't" twice before checking the
screenshots. That was wrong, and it is exactly the error an automated metric
invites: it was internally consistent, reproducible, and about my ruler.

**So: 41% is a positional-fidelity score. It is not a quality score.** For a tool
whose entire premise is *rough sketch → real UI*, penalising the model for
laying out the page better than the sketch did is measuring the wrong thing.

## The one real product failure

**Page 05 drew the sketch back at me.** The five logo boxes are correct. Every
text squiggle became a literal wavy SVG path instead of becoming text — two
waves where a testimonial quote belonged, a wave where the attribution belonged.

That is `verbatim` fidelity applied to marks that meant *text*. The convention is
already written down — a squiggle is a line of text, and the skill says so — but
a run that settles on tracing traces everything, including the marks whose whole
purpose was to stand for words.

This is the highest-value thing to fix, and it is narrow: **a stroke group that
reads as text must never be rendered verbatim**, whatever fidelity the rest of
the drawing is using.

### Fixed, and the fix is verified

The cause was one line of guidance. The prompt said *"FIDELITY — decide per
drawing"* while `fidelity` is a **per-action** field in the schema, so a single
decision was applied to every action in the run. One drawing routinely mixes all
three kinds — a hero with a wavy divider, an icon and three lines of copy is one
of each — so there is no correct single answer, and on page 05 the text marks
were swept up as decoration.

Now fidelity is set per action, and text placeholders are named as never-verbatim
in their own right: tracing a mark that stands for words produces a wavy line
where words were meant, which is the single most common way to ruin a result.

Re-running page 05 on the fix: the wavy lines are gone. The page now renders a
real logo wall with five named logos, a pull-quote in large type, an avatar, and
a name and job title. It went from unusable to something you could ship as a
first draft.

**And the region score moved from 18% to 23%.**

That is the most useful number in this document. A page went from garbage to good
and the metric barely twitched — which is the clearest possible evidence that it
is measuring position rather than quality, and that nobody should tune this
system against it.

## Every page

| page | marks | run | billed | region | must | order | missed |
|---|---|---|---|---|---|---|---|
| 01-saas-hero | 11 | 196s | 57k | 61% | 100% | 100% | — |
| 02-split-hero | 10 | 155s | 96k | 44% | 50% | 100% | headline, cta |
| 03-feature-triptych | 11 | 118s | 31k | 45% | 75% | — | section-heading, section-subhead |
| 04-pricing-tiers | 10 | 207s | 49k | 54% | 75% | — | heading |
| 05-logo-wall-testimonial | 10 | 182s | 51k | 18% | 100% | 100% | eyebrow, avatar, attribution |
| 06-faq-accordion | 10 | 82s | 29k | 47% | 67% | 100% | heading |
| 07-stats-band | 9 | 89s | 24k | 58% | 100% | — | — |
| 08-newsletter-capture | 8 | 179s | 41k | 20% | 25% | — | heading, email-input, submit, decor-wave |
| 09-app-download | 10 | 192s | 49k | 24% | 33% | 100% | headline, download-1, download-2 |
| 10-docs-landing-hybrid | 11 | 151s | 51k | 49% | 100% | 100% | — |
| 11-gallery-masonry | 9 | 131s | 45k | 35% | 100% | 100% | heading, tile-2 |
| 12-timeline-steps | 10 | 150s | 36k | 0% | 0% | 100% | all — see above, the page is correct |
| 13-comparison-table | 11 | 123s | 34k | 68% | 75% | 0% | heading |
| 14-dark-gradient-hero | 8 | 212s | 53k | 36% | 67% | 100% | subhead, cta |
| 15-footer-sitemap | 12 | 206s | 45k | 55% | 100% | 100% | — |

`—` in the order column means fewer than two regions were comparable, so there
was no sequence to check. Printing those as 0% would be averaging in a
non-observation; four pages are in that state.

Page 13 is the one genuine ordering failure in the set.

## What this says about drawing fewer marks

The question was how FEW marks get a recognisable page. The answer from this
corpus: **about ten, and precision does not help.**

1. **Ten marks is enough.** Every page here is 8–12 marks and every one produced
   a real page. Nothing suggests 20 would do better.
2. **Accuracy of placement is wasted effort.** The model re-lays-out the page
   regardless — which is why my positional metric scored it so harshly, and why
   pages 08 and 12 look better than what I drew. Time spent making a rectangle
   straight or putting it at the right y is time thrown away.
3. **The marks that pay are the ones that say what KIND of thing it is.** A box
   with an X means an image slot and is read as one. Three equal boxes in a row
   mean a triptych. A rounded box means a button. Those marks carry structure.
4. **The marks that do not pay are the ones standing in for words.** They are the
   ones that fail (page 05), and a typed note does the same job exactly, with no
   ambiguity and no risk of being traced.

The leverage, then, is not in drawing *better*. It is in **drawing less and
typing more**: shapes for structure, words for content.

## What to change next, in priority order

1. **Per-group fidelity.** A group that reads as text is never traced verbatim.
   Fixes page 05 directly and is the only change here addressing an actual
   defect rather than an ergonomic one.
2. **Make the one-word note cheap.** The leverage above says words beat marks for
   content, so typing a label on a shape should be as fast as drawing the shape.
   It currently costs: move the pointer, Alt+N, type, Enter.
3. **Stop asking for positional precision in the UI.** If the model re-lays-out
   anyway, the overlay should say so — a sketch is a structure, not a mock-up.
   Users who believe their coordinates matter will spend time on them.
4. **Replace this benchmark's primary metric.** Score structure, content and
   order; keep IoU as a secondary signal with a size-aware tolerance. The current
   number cannot tell a good page from a bad one, which is the only thing a
   benchmark is for.

## The ruler, replaced (seed2tree s2c-001)

*Added 2026-10-15.* Item 4 above is done in code: the bench's primary score is
now `tests/bench/lib/intent.mjs`, and IoU is reported beside it as a secondary,
positional signal.

It asks what a person asks, and never where things landed:

- **structure** — is each region there as the *kind* of thing it asked for? The
  kind comes from the role name (`headline` is text, `cta` a clickable control,
  `email-input` an input, `avatar` media, `tier-1..3` three alike siblings) or
  an explicit `kind` in the spec.
- **content** — do the regions that stand for words carry real words, not a
  placeholder and not a squiggle traced as an SVG path?
- **order** — top-to-bottom order, judged on the elements chosen above.

A page is **realized** when the mean of those is ≥ 0.8 and every `must` region
is present. The share of realized pages is the number SEED.md's definition of
done counts.

Checked against the cases this document caught the old ruler getting wrong,
rendered as plain HTML in a real browser (`node tests/bench/intent-check.mjs`,
zero tokens) and as 13 unit tests (`tests/bench/intent.test.ts`):

| page | intent | realized | old IoU score |
|---|---|---|---|
| 12, correct but centred higher than drawn | 1.00 | yes | 0% |
| 05, quote and attribution traced as squiggles | 0.64 | no — quote, attribution not found as text | 25% |
| 05, after the fidelity fix | 0.93 | yes | 20% |

The IoU score ranked the broken page 05 *above* the fixed one. The intent score
puts them on opposite sides of the line.

**Not done yet: the fifteen real pages are not re-scored.** The table above
("Every page") was measured from DOMs that were not kept, so re-scoring needs a
fresh live run, which spends model quota. That run is the owner's call.

Known limits: kinds come from role names, so a new role word may need a rule or
a `kind:`; when two regions are the same kind (two headings), they are matched
in reading order, so a swap of two same-kind blocks is invisible to `order` —
a person couldn't tell those apart either without reading the words.

## The rough set (seed2tree s2c-009)

*Added 2026-10-15.* The fifteen tidy pages are careful drawings: closed boxes,
square corners, up to 12 marks a page. SEED.md says real users won't draw like
that, and s2c-012 found something worse: every tidy page is drawn on a blank
page, so all fifteen read as `design` in auto mode and **the gesture grammar —
delete, rewrite, restyle, move — has never been measured at all.**

`node tests/bench/run.mjs --set rough` runs eleven new pages, at most 4 marks
each, drawn with `tests/bench/lib/rough.mjs` (boxes that don't close, corners
that overshoot, sides that bow and skew, partial boxes, a drifting ring, a
one-stroke arrow, a loose scribble):

| page | what is drawn | auto sends |
|---|---|---|
| r01 | one scribble over the third feature card, no words | gesture |
| r02 | sloppy strike-through on the headline + "say: Sketch it. Ship it." | gesture |
| r03 | lopsided ring round the button + "bigger and green" | gesture |
| r04 | one wobbly arrow from the testimonial up to the features + a note | gesture |
| r05 | three-sided box on the footer + "newsletter: email box + Subscribe button" | gesture |
| r06 | two-stroke X over the "Pricing" nav link, no words | gesture |
| r07 | a hero from one line, one box and two notes | design |
| r08 | two pricing boxes and an L-shaped third; the note says three tiers | design |
| r09 | a signup form with one field drawn twice, one-word labels | design |
| r10 | three skewed unclosed cards under a squiggle; the note names them | design |
| r11 | nav + hero from an unclosed bar, a dented ring, a squiggle, a 3-sided button | design |

r01–r06 start from an ordinary landing page (`sketches/rough/base.mjs`) that
the runner commits on top of the blank app before drawing, so the model's
checkpoint sees it as the starting point. Their marks are hard-coded to where
that page renders; the runner re-measures those elements first and refuses the
page if anything moved by more than 12 px.

**Scoring an edit.** Presence is meaningless on an edit page (the base already
has every block), so edit specs list facts about the page afterwards instead:
`absent` (deleted), `present` (added, by kind and words), `kept` (no collateral
damage), `above` (moved), `bg` (restyled, by hue; Tailwind v4 reports oklch).
Realized = ≥ 0.8 of the checks hold and every `must` holds.

**Rougher by a stated measure** (`tests/bench/rough.test.ts`): mean distance
of the stroke from the shape it stands for is ≥ 3× the tidy primitive's for
boxes, lines and rings, and rough boxes leave a closing gap > 8 px (tidy: < 1).
The set is also wordier: 2.7 typed words per mark against the tidy set's 1.8.

**Roughness never changes the meaning of a mark.** The reader treats ≥ 4 sharp
turns confined to one element as DELETE. Every rough box, line, ring and arrow
stays under 4 by the reader's own count (checked against `@s2c/ink`'s
resampler over 20 sizes each); the scribble stays over it. More tremor would
have turned "restyle this button" into "delete this button".

**Zero-token checks, all passing:**

- `--set rough --dry`: all 11 pages draw (every mark registers), the 6 edits
  send `gesture` and the 5 new-UI pages send `design` in auto mode, and every
  page scores **not realized untouched** (the runner now fails any page whose
  untouched state scores realized: a vacuous answer key).
- `node tests/bench/rough-check.mjs`: on a real DOM, each edit spec fails on
  the base page and passes once the asked-for change is made by hand.

Not done: no paid run. The rough set is the input to s2c-013, the
structure-vs-screenshot kill test, which still waits on a quota decision.

## Bugs found while building this

All three were found by *instrumenting* the system, not by the measurements.

- **The instant render races the reading off the page.** It writes and mounts a
  component, vite full-reloads, and the in-flight reading dies with the page that
  requested it (`interpret failed: Failed to fetch`). The reading is a slow model
  call and the render is fast and deterministic, so the render wins nearly every
  time it *accepts* — meaning the cleaner your sketch, the likelier your run
  dies. Moving the render after confirmation breaks the property that makes it
  valuable (it must not need the model); the real fix is for the reading to
  survive a reload. `instant: false` exists now as a measurement workaround and
  is labelled as one.
- **The component library outlives `git clean`**, because `.sketch2code/` is
  gitignored. A stale entry from an earlier session turned a scratch-out — a
  gesture that means *delete* — into a placed component. For a user this is worse
  than for a test: your scribble silently becomes something you drew last week.
  *Fixed on `seed2tree` (s2c-004):* every library read now checks a project
  row against the file as it is now (exists, still declares the export as a
  component) and hides it otherwise; hidden, not deleted, so a checkout brings
  it back. Not yet established: which path carried the stale row into that run
  — the store is now the gate for list/search/place, but the codegen agent can
  still `Read`/`Grep` `.sketch2code/` directly (s2c-007).
- **Partial-rejection reporting conflated two things** and I nearly fixed the
  wrong bug because of it. `rejected` is a list of reasons; an unresolvable
  element id does not kill a design action, whose region comes from its strokes.
  "11 not carried out" was false — every action ran. Now `droppedActions` is
  counted separately.

## Honest limits of this study

- **One run per page.** Model output varies; two runs of page 01 scored 40% and
  24%. No per-page number here should be read as repeatable, and no change
  should be attributed from a single page. The population-level patterns are
  what this supports.
- **The sketches are synthetic.** Drawn by a program with simulated hand jitter,
  not by a person. They are consistent, which is good for comparison, and
  unrepresentative of real hand tremor, hesitation and redrawing, which is not.
- **`instant: false` throughout.** The measured path is not the default
  configuration, because the default cannot be measured (see the race above).
- **Generic archetypes only.** No real company's layout, branding or copy was
  reproduced; these are structural patterns.
