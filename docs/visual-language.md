# The visual language — a mark for every common edit, or a reason why not

seed2tree s2c-015, 2026-10-16. Sketch first, words as support (SEED.md): this
lists what each common edit costs in ink, checked against the code that reads
it today. It does not invent gestures to fill rows. Where a mark loses to a
drag, a slider or two typed words, it says so.

**Who reads the marks.** There are two readers, and they do not agree:

- **v2, the live path** (`packages/pipeline/src/intent2.ts`, `INTERPRET_PROMPT`).
  This is what the overlay calls (`vite-plugin` → `interpretV2`/`runV2`). A
  model reads the rendered ink plus exact per-stroke features (reversals,
  touched/start/end elements, `drawnColor`) and picks from a fixed verb list:
  delete, modify, add, move, swap, design, serve, save. Its "gesture grammar"
  is prose in a prompt, so "recognised" means told to the model, not enforced.
- **v1, deterministic** (`packages/intent/src/plan.ts` on `packages/ink`
  classification). Only the legacy `runPipeline` handler uses it. Its rules are
  code, so they can be tested without tokens. That is why the tests here use it
  as a proxy for "is this mark geometrically readable".

Measured status (live, tokens) for every row is still **unknown** until the
s2c-013 pilot runs. "bench" names the rough page that will measure it.

## The table

| # | Edit | The mark | Words needed | v1 (code) | v2 (prompt) | Other UI, zero tokens | bench | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | delete | scribble over it; X over it; strike through a line of text | none | DELETE for scribble and mid-band strike; **an X gives no op** (each diagonal fails the flat-strike test; tested on r06) | yes, ≥4 reversals + confined | — | r01, r06 | **Mark wins.** Faster than select + Delete key, and no editor does it on a live app (s2c-018/019). |
| 2 | rewrite text | strike through + the new text | **content** (the new words) | DELETE + text attached | yes | — | r02 | Mark says *which*, words say *what*. Inline text editing would beat both; we have none. |
| 3 | move | one arrow from the thing to where it goes | none | MOVE, before/after/into by direction | yes | tweak mode drag (Alt+T), free move + reorder | r04 | **Concede for short moves**: a drag is exact and free. The arrow earns its place only when batched with other marks in one sketch, or across a distance a drag can't hold (scroll). |
| 4 | reorder siblings | same arrow | none | MOVE | yes | tweak drag reorder | r04 (same) | Same as move. Not a separate gesture. |
| 5 | swap two things | two arrows between them, one each way | none | **wrong**: two MOVEs, result 2-3-1 not 3-2-1 | yes, named verb `swap` | — | **r13 (new)** | Mark wins (two drags otherwise). v1 is wrong, see below. |
| 6 | resize | — | — | — | — | tweak handles (`manipulate.ts`, w-/h-) | — | **Concede.** A handle drag states the value; no mark can. "bigger" as a word is the fallback. |
| 7 | restyle: colour | draw the ring (or any mark) **in that colour** (Alt+P pen) | none | — | yes, `drawnColor` = "make it this colour", snapped to the app palette (`palette.ts`) | eyedropper (Alt+I), paint SVG path (Alt+K) | **r12 (new)** | **Mark carries the value.** s2c-016 was wrong that restyle "needs words": that was a bench limit (it could not draw in colour). r12 = r03 minus every word. |
| 8 | restyle: size / weight / font | — | **yes** ("bolder", "smaller") | — | ring + note = modify | props panel (Alt+O) | r03 ("bigger") | **Needs words or the panel.** Proofreader underlines (wavy = bold) exist, but nobody outside print knows them; not worth a gesture. |
| 9 | duplicate / add one more of a list | draw one more rough box in the list's empty slot | none (copy is invented) or "x3" | ADD into the list container (tested on r15: `container` = the row) | lexicon: repeated boxes = a list; one box beside three is untested | element library (Alt+Shift+L) | **r15 (new)** | **Plausible, unmeasured.** v1 reads it right. Whether v2 makes a fourth tile *like the others* rather than a new kind of card is what r15 measures. |
| 10 | wrap / group | ring around several elements | **yes** (what the wrapper is) | **wrong**: picks one target, MODIFY | `layerHint: container` in design mode only | lasso (Alt+L) extracts a component | — | **Needs words.** A bare ring means "modify this" (row 7/8), so a ring over many is ambiguous. Lasso already exists for the structural case. |
| 11 | add new UI | wireframe in empty space, symbol lexicon | content only (labels, copy) | ADD | `design` | — | r05, r07–r11 | **Mark wins**, the strongest row (s2c-018). |
| 12 | insert at a point | caret ^ under the gap | **content** (what goes there) | INSERT | in the skill text, not the verb list (lands as `add`) | — | **r14 (new)** | Mark says *where* precisely; words say *what*. Fine as is. |
| 13 | align | — | — | — | — | tweak mode magnetic guides | — | **Concede.** A straight line down two edges is already taken by the rule tool (Alt+Shift+R, "keep this aligned"), so it can't also mean "align these now". |
| 14 | hide / show / conditional | — | **yes** (the condition) | — | — | — | — | **Needs words.** A condition is behaviour; no mark carries "when logged out". |
| 15 | link / navigate | arrow from a button to a section or screen | **yes** on one page ("go to") | would read as MOVE | design mode: arrows = flow | — | — | **Needs words in gesture mode.** An arrow between two existing elements already means move (row 3). In design mode, between sketched screens, it is flow. |
| 16 | make it work (save, serve data) | — | — | — | verbs `save`, `serve` from a note | "make this real" (Alt+Shift+D), endpoint (⌘K) | — | **Not a mark.** These are one-click buttons, which beat both a mark and a sentence. |

**Count:** 7 of 16 edits are carried by a mark alone (1, 3, 4, 5, 7, 9, 11),
3 more by a mark for *where* plus content words (2, 12, and 11's labels), 4
need words for *what* (8, 10, 14, 15), and 4 lose to direct manipulation or a
button (3–4 for short moves, 6, 13, 16). That is consistent with s2c-018's
8/14 from the competitor side. The language is not "every edit is a gesture"
and should not try to be. The drawing-first claim holds for delete, add, swap
and colour, and those are the ones to make excellent.

## Conflicts between marks (and the rule that settles each)

1. **Arrow: move vs swap vs flow vs link.** Settled by mode first (gesture vs
   design, `auto` picks from where you drew), then by count: one arrow between
   two existing elements = move, an opposite pair = swap. Link needs a word.
   v1 does not implement the pair rule: opposite arrows give two MOVEs, and
   applied in order (1 after 3, then 3 before 1) the result is 2-3-1, not a
   swap. v1 is legacy, so this is noted, not fixed.
2. **Long arrows lost their heads (fixed this run).** `ink/scene.ts`
   simplifies each stroke at 3.5% of its diagonal. On a shaft over ~600 px
   that is wider than a normal head, so the barbs vanished and the arrow read
   as a line: r13's left-to-right arrow did exactly that. The scene now retries
   at a 6 px tolerance before calling it a line. Tested at 300–1000 px both
   ways, and plain lines of the same lengths still never become arrows. This
   matters for v1 and anything else that reads `scene.arrows`. v2 only renders
   the scene to an image and lets the model read the arrow.
3. **Short arrow vs caret.** One arrow stroke (r04's) classifies as `caret`
   0.80 on its own. Arrow detection runs first in the scene, so it comes out an
   arrow, but a short, steep arrow is one tolerance away from an insert mark.
4. **Scribble (delete) vs hatch (fill) vs text squiggle vs decorative wave.**
   Settled by geometry, not the model: ≥4 sharp turns at 8 px and confined to
   one element = delete; `textmark.ts` catches text squiggles by
   wavelength/amplitude; smooth (≤2 reversals) and section-wide = decoration.
   Hatch inside a *new* drawn boundary = fill, which is safe only in empty
   space (bench `draw.mjs` note 2).
5. **X over an element (delete) vs a box with an X (image placeholder).** The
   box decides: X inside a drawn rectangle in empty space = image; X over
   existing UI = delete (r06). Only v2 knows the X; v1 drops both diagonals.
6. **Ring with no words and default ink.** It means "modify this" with nothing
   saying how. That is an empty command. It should get a question back, not a
   guess. Whether v2 asks or guesses is unmeasured.
7. **Straight line: strike vs underline vs rule vs divider.** Strike = mid-band
   of a text element (v1 checks 20–80% of its height). A line in empty space
   stays unresolved on purpose (could be a divider). The rule tool lives in its
   own mode, so its lines never reach the reader.

## What this run added to the bench (zero tokens)

- `pens: [...]` on a page: each mark drawn in a chosen pen colour, through the
  real UI (Alt+P, the custom colour input, Alt+0 to reset before each page).
  run.mjs fails the page if the captured strokes don't carry those colours
  (`tests/bench/lib/pen.mjs`).
- `leftOf` edit check: reading order within a row (swap, insert).
- **r12** green-pen ring, no words (restyle carried by the mark).
  **r13** two arrows, swap the outer cards, no words.
  **r14** caret between two nav links + "Blog" (not judged with no words: the
  link text is content).
- `rough-check.mjs` proves all three keys fail untouched and pass when edited,
  with and without words. `run.mjs --dry` draws all three in Chromium, and
  r12's stroke arrives green.

Still uncovered by any page: the ring-with-no-words question (conflict 6),
which is s2c-020.

## Second pass (2026-10-16, row 9)

- `BASE_LIST_APP` (sketches/rough/base.mjs): the base page plus a "Works with
  your stack" row of three tiles in a four-column grid, under the feature
  cards. The fourth cell (x 954–1232, y 591–681) is empty and inside the
  900 px viewport. Nav, hero and feature anchors are unchanged on it.
- **r15**: one loose empty box in that cell, no words. In `auto` mode it
  routes to `gesture`. v1 reads it as ADD into the row.
- New edit check `siblings` (`lib/intent.mjs` `listSize`): the list holding
  `text` has at least `min` items. Items are counted by size, and any two
  boxes match whatever their tags, so a fourth `<article>` beside three
  `<div>`s counts. A banner dropped into the row, or a card elsewhere on the
  page, does not.
- What r15 does not check: whether the new tile *looks* like the other three.
  The count is the claim; the screenshot in the report shows the rest.
