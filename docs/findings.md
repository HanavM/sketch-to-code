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
  it back. Which path carried the stale row into that run is still not
  established, and the original explanation is doubtful: see "The codegen
  agent could read and write the library" below (s2c-007).
- **Partial-rejection reporting conflated two things** and I nearly fixed the
  wrong bug because of it. `rejected` is a list of reasons; an unresolvable
  element id does not kill a design action, whose region comes from its strokes.
  "11 not carried out" was false — every action ran. Now `droppedActions` is
  counted separately.

## The prompt fix was not the whole fix (seed2tree s2c-003)

*Added 2026-10-15.* Page 05 was fixed by rewording the prompt: fidelity per
action, text placeholders never verbatim. But the prompt is not the only thing
that turns ink into paths, and four deterministic parts of the pipeline were
still pushing the other way:

- **Grounding fitted an `svgPath` for every stroke an add/design action cited**,
  squiggles included.
- **The scaffold** (`scaffold.ts`, written before codegen at every rung but
  reinterpret) put each of those paths in a component labelled *"these paths
  ARE the drawing … keep them"*. So on page 05 the model was told in the same
  brief never to trace the quote and to keep the traced quote.
- **The trace rung** set `fidelity: 'verbatim'` on every action with paths,
  overriding the per-action decision the prompt fix asked for.
- **The composition check** at the trace rung scored every drawn form, so a
  squiggle that correctly came back as words counted as a failed likeness and
  pushed candidate selection toward tracing.
- **The instant render** mounted squiggles drawn in empty space as SVG.

The fix decides it once, from the ink: `textmark.ts` calls a stroke a line of
text when it is level (tilt <= 25 deg), thin (<= 40px across its chord) and
oscillates hard (perpendicular travel >= 0.35 per px, >= 3 crests). Grounding
then keeps those strokes cited (they still set the region) but lists them as
`textMarks` with no path, so the scaffold, the trace override and the
composition check never see them. An action made only of text marks loses
`verbatim`. The codegen brief says what `textMarks` means, and the instant
render declines any drawing that contains one.

Calibrated on the bench's own generators: every text squiggle on the 15 tidy
pages and the rough set is flagged. Both decorative waves (pages 08, 14) are
not (travel 0.14–0.15 against ~0.5 for text), and neither are straight or
hurried lines, boxes, rings, arrows or hatching. Known overlap: a delete zigzag
also measures as text. That is harmless, because delete actions never get paths
and the instant render's scratch-out check runs first. A short wavy *underline
drawn as decoration* would be read as text. I accept that cost.

Tested (`packages/pipeline/tests/textmark.test.ts`) by replaying page 05's
failing reading (one design action over the whole drawing, `verbatim`):
grounding fits paths for the 5 logo boxes and the avatar only, and the
trace-rung scaffold contains none of the 4 text strokes. **Not measured:** how
much this moves realized % on a live run. That needs quota (s2c-008/s2c-013),
and it matters for the kill test, because the structured arm was being handed
traced squiggles on every design page.

### Widgets were scaffolded too (seed2tree s2c-014)

The same scaffold had a second leak: it ignored `fidelity` entirely. A card
box or a button outline is a widget (the interpreter leaves fidelity unset and
the contract says *rectify, don't reproduce*), yet at the default rung
(resemblance 0.5, normalize) its wobbly outline went into a `SketchShape`
component marked "drawn by the user, keep it". `buildScaffold` now returns
null unless the action is `recognized` (a drawn thing) or `verbatim` (a
decoration). The trace rung is unchanged on purpose: run2 marks every action
with paths `verbatim` there, so at resemblance >= 0.85 widgets are traced,
which is what that slider position asks for.

Exposure, measured on the bench's own ink with a worst-case reading (one
design action over the whole page, fidelity unset, default rung): **20 of 20**
design pages (15 tidy, 5 rough new-UI) got a box-tracing scaffold before; 0
after. The 6 rough edit pages are gestures and never scaffold. Real readings
split pages into several actions, so the true count is lower and still
unmeasured without a saved run. 4 tests in `scaffold.test.ts`; the two
widget tests fail on the old code.

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

## The codegen agent could read and write the library (seed2tree s2c-007)

*Added 2026-10-15.* The question was how a stale library row reached the run
that turned a scratch-out into a component. Two findings, one negative.

**The incident was not the agent, and probably not the library.** It was
caught by `live-instant`, which stubs both `/@s2c/interpret` and `/@s2c/run`:
no model and no codegen agent ran. Nothing deterministic reads the library
into a run either. `interpret`, `run2`, `instant` and `scaffold` never import
`library.ts`. The plugin only writes to it after a run (`captureInto`) and
reads it through `/@s2c/library/*`, which only the panel calls, and placing
from the panel is a click. So "a stale library row was placed" has no code
path. The cause is unknown. A leak between the test's two halves is the more
likely suspect (the mid-test reset is `git checkout` plus `rm` of one
hard-coded filename, not `git clean`). Not reproduced.

**But the agent could, and now cannot.** Gitignoring `.sketch2code/` does not
hide it from the agent. The bundled CLI's Glob runs ripgrep with
`--no-ignore --hidden` by default (`CLAUDE_CODE_GLOB_NO_IGNORE` defaults to
true), and Read/Write accept any path under cwd. Checked against the real
binary with a mocked Messages API (zero tokens). `Glob **/*` listed
`.sketch2code/library/index.json` and old run bundles. Read returned a
stored entry's component source. Write replaced the library index. Grep
without a path respects .gitignore, but with `path: .sketch2code` it read
everything. So the agent could find last week's drawing and use it, or
corrupt the library. The screenshot arm of the kill test is told to "find the
files yourself", so it is the most exposed.

Fixed with permission rules, not prompt text: `Read(./.sketch2code/**)` and
`Edit(./.sketch2code/**)` are now in the codegen agent's `disallowedTools`
(`codegenToolOptions`). The CLI applies Read deny rules to Glob and Grep as
exclusions. After the fix, Glob omits the directory, Grep/Read/Write into it
are refused, the index is byte-identical, and app source still reads.
`tests/e2e/codegen-private-state.mjs` reproduces this. It fails on the old
rules at the Glob step. `packages/pipeline/tests/codegen.test.ts` asserts that
every mode's session gets the rules.

Not covered: the global library (`~/.sketch2code` or `$XDG_DATA_HOME`) sits
outside cwd, where acceptEdits has no grant and nothing can approve a
prompt. The bench's reset does not clear it, but nothing automatic reads it.

## How much does the sketch carry alone? (seed2tree s2c-016)

*Added 2026-10-16.* SEED.md says "sketch first, text as support". The bench
could not test that: it typed every note in full, so a page that came out
right might have been carried by "move the quote up here" with the arrow as
decoration. `--words` now runs the same page three ways
(`tests/bench/lib/words.mjs`):

| arm | what is typed | rough-set words |
|---|---|---|
| `all` (default) | every note as written, the old behaviour | 64 |
| `content` | only words no mark can carry: new copy, labels, a colour | 32 |
| `none` | nothing | 0 |

Each rough note now declares its `content`, the claim being measured. It is
written into the spec so it can be argued with. r04's arrow types **nothing**
in `content` mode, and r08's "3 pricing tiers, middle one highlighted, each:
price + Choose button" shrinks to "pricing, Choose". `content` mode refuses an
unclassified note rather than guessing, so the tidy set (unclassified) cannot
run in it yet.

With no words, checks that only typed words can pass (`needsWords: true`:
r02's new headline text, r03's green, r05's "Subscribe" label) are dropped.
r02 without words is then asked for a plain delete, which is what a bare
strike-through means. **r03 is not judged in `none`**: a ring cannot say
"green", and the only check left (`kept`) passes on the untouched page. It is
not run, so no quota is spent on a page nobody can grade, and it is reported
as `n/j`, never as a pass or a fail.

Every run also writes `out/results.<mode>.words-<arm>.json`.
`node tests/bench/words-compare.mjs` puts the arms side by side: realized %,
words typed, **words per realized page**, and a page-by-arm matrix. The
number to watch is the drop from `all` to `content`. Those are the pages that
only worked because a note spelled out what the ink should already have said.

**Zero-token checks, all passing:** `--set rough --dry` with each of the three
arms draws every page (every mark registers). Auto mode routes the same in all
three (r01–r06 gesture, r07–r11 design), so words don't decide the mode.
`rough-check.mjs` confirms that the `none` key still fails each untouched edit
page and passes the hand-made change. `tests/bench/words.test.ts` has 17
tests.

Not done: no paid run. The live numbers ride on the s2c-013 quota. For the
pilot, the cheapest thesis test is r04 + r05 + r08 in `--words content`
(three pages, about a fifth of a full arm).

## The visual language, checked against the readers (seed2tree s2c-015)

*Added 2026-10-16.* Full table: `docs/visual-language.md`. 16 common edits.
A mark alone carries 7 of them (delete, move, reorder, swap, colour,
add-another, add-new-UI). 4 need words for *what*: size/weight, wrap, a
condition, a link. 4 lose to a drag or a button: short moves, resize, align,
"make it work". The drawing-first claim is strongest for delete, add, swap
and colour.

Three things the check turned up, none measured with tokens:

1. **s2c-016 was wrong that restyle needs words.** The overlay has had a pen
   colour for a while (Alt+P, `palette.ts`: "the pen colour IS the
   instruction"). The bench could not draw in colour, so r03 looked
   ungradeable with no words. The bench now has `pens:` (set through the real
   UI, verified on the captured strokes). **r12** is r03's ring in green ink
   with no words, and it is judged in `--words none`.
2. **Long arrows lost their heads.** `ink/scene.ts` simplifies at 3.5% of a
   stroke's diagonal, so on shafts over ~600 px the head vanished and the
   arrow read as a plain line. r13's card-1-to-card-3 arrow did this. Fixed
   with a 6 px retry. Only v1 and other `scene.arrows` readers were affected:
   the live v2 reader only renders the scene for the model.
3. **v1 gets swap and X wrong.** Opposite arrows give two MOVEs, which end
   2-3-1, not a swap. An X over a link gives no op at all. v1 is the legacy
   handler, so this is recorded, not fixed. v2 has both in its prompt.

New pages: r12 (green-pen ring), r13 (two arrows, swap), r14 (caret + "Blog").
`rough-check.mjs` passes all three with and without words, and
`run.mjs --dry` draws them in Chromium. `tests/bench/language.test.ts` has 16
tests.

### Row 9, add one more of a list (s2c-015, second pass)

*Added 2026-10-16.* The last row with no page. **r15** draws one loose empty
box, no words, in the empty fourth cell of a three-tile row (new base
`BASE_LIST_APP`). v1 reads it as ADD into the row. The new `siblings` check
fails the untouched page (3 tiles) and passes a fourth tile whatever its tag,
in unit tests and on a real DOM (`rough-check.mjs`, with and without words).
`run.mjs --set rough --dry` draws all 15 rough pages in Chromium with every
anchor in place. Zero tokens, so this says nothing yet about whether the live
reader makes "one more of these".

One bench bug fixed on the way: when the scratch app was reused on a new
port, `makeApp` committed the whole tree *before* resetting it. Anything left
in `src/` (a crashed run, a hand measurement) became part of the "blank" app
every later page starts from. Here it made r15's base commit fail with
"nothing to commit". It now resets first.


## The one-word note, made cheap (seed2tree s2c-006)

*Added 2026-10-16.* Item 2 of "What to change next" is done in the overlay.
**Draw, then just start typing.** The first printable key after a stroke
opens a note on that drawing, with the key already in the field. Enter
attaches it. A word on a just-drawn box went from four steps (pointer back
on the shape, Alt+N, type, Enter) to two (type, Enter).

- **Subject:** the cluster the newest stroke belongs to, using the same
  space-and-time clustering as Alt+N's rule 2. It is *not* whatever is under
  the pointer. You drew a box and typed "Pricing", so the box is what
  "Pricing" is about.
- **One-shot.** It is armed while the newest stroke is unlabelled. A label,
  an undo, a Clear, a click, leaving draw mode or the test surface all hand
  the keyboard back to the host page. The rule is one identity check
  (`type-to-label.ts`), so no disarm path can be forgotten.
- **Bound keys win.** It runs after the keymap, so `?` still opens help.
  Space never starts a label (it scrolls the page), and neither does any key
  with Alt/Ctrl/⌘ or an IME composition in progress.
- **Auto mode:** a key typed during the 0.9 s settle countdown holds the run,
  as any open note does. Enter releases it, and the interpret request
  carries the label. **The window is still 0.9 s.** If you pause longer
  before typing, auto has already read the bare shape. That suits a mark
  that carries its own action (scribble, arrow). It does not suit an empty
  box, which needs its word. s2c-020 (ask, don't guess, on a bare mark) is
  where to fix that.

Tests: `packages/overlay-client/tests/type-to-label.test.ts` (9 unit) and
`tests/e2e/live-label.mjs` (6 live checks, zero tokens). The existing
live-notes, live-keymap, live-noterefs and live-auto suites still pass.
Not measured: whether real users find it without being told. The status
line says "start typing to label it" after a stroke in review/manual mode.
In auto mode the countdown overwrites it.
