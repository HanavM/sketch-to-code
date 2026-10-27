# Goal

Prove sketch-to-code works the way a person would actually use it: look at a website, sketch it roughly
with a few strokes and a few words, and get that website. You (the Claude agent) play the person. Make
the tool better until rough, human-like sketches reliably produce close copies, and measure how much
effort each sketch took.

## How every page is done (the rules)
1. **Look only at the picture.** For each target page, the sketcher sees only its screenshot
   (`ref/*.png`). Never open, read, grep or measure the target's HTML, CSS, DOM, targets.json,
   effects.json or any file derived from them while sketching. No exact pixel values, hex codes or CSS
   in notes beyond what a person could eyeball ("dark navy", "big bold headline", "about a third wide").
2. **You draw it yourself, one stroke at a time.** No script, planner or rule set generates the
   sketch: you decide each stroke and each note by looking at the screenshot, then draw it through the
   real drawing overlay (e.g. Playwright pointer events), like a person with a mouse or pen.
   The old auto-planner (`tests/rounds/lib/autoplan.mjs` and its rules) is retired: don't use or extend it.
3. **Work like a person, in sequence.** Draw the big parts first, look at what the tool shows, then add
   or fix strokes and short notes where it got it wrong. Stop when it looks right or when more effort
   isn't worth it. Every correction counts toward effort.
4. **Fair targets.** Targets may be written by you, but the run that sketches a page must not have seen
   its source: write a round's targets and screenshots in one step, and sketch them in later steps
   without opening the source. Mix 5 creative landing pages and 5 everyday app pages per round, easier
   to harder over time. Existing rounds 1-30 screenshots can be reused as a pool.
5. **Improve the tool, not the sketch.** Wins must come from changes to sketch-to-code itself (how it
   reads strokes and notes, how it builds and corrects), not from longer or more precise notes, and not
   from a page-by-page list of sketching tricks. A short general "how I sketch" guide (one page max) is
   fine. Keep the likeness scorer fixed (v3); don't tune it.

## Measure on every page, and roll up per round
- **Likeness** to the target (current v3 scorer).
- **Strokes:** how many; and **how simple** they are: points per stroke, share that are simple shapes
  (lines, boxes, circles, arrows) vs freehand detail, total ink length, strokes erased or redrawn.
- **Words:** how many words typed, how many notes, longest note.
- **Time:** time spent sketching, time until the tool first shows what it understood, build time, and
  total time from first stroke to done.
- **Corrections:** how many rounds of look-and-fix after the first result.
- **Tokens:** for the build (and separately for your own sketching, if you can tell).
Keep it in a table per round (like EASE.md) and add `round`, `round_scores` and the round's median
strokes, words and minutes to tree.yaml so the dashboard shows them.

## First step
Baseline: sketch 10 pages from the existing pool (screenshots only, by the rules above) with the tool
as it is today, and record every number. Report honestly how far below the old 90% this lands.

## Done when
1. Two fresh rounds (20 pages never seen before, at least half of them harder than round 1) average
   **80% likeness or more**, with a median of **20 strokes or fewer** and **50 words or fewer** per page,
   all sketched by the rules above.
2. A skeptic verify run re-sketches 4 of those pages from scratch and gets within 5 points of their scores.
3. Every number above is recorded per page and per round, with side-by-sides (target, your sketch,
   result) to watch.

## Budget
No daily token cap; log tokens per day.
