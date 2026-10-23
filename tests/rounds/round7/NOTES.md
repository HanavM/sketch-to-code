# Round 7 (n92): harder than round 6, untuned first look

Creative: c1 bento overlap (six rounded tiles: purple-pink gradient hero, yellow stat, list, quote, cyan, bar chart;
a glowing orb crosses four tile edges and a hollow yellow "07" spills off the chart tile), c2 variable wave (one word
whose letters swell 120→220px and 100→900 weight and back, a hollow "100—900" line, a red-orange band tilted 6°
bleeding both edges, a slider axis with knob), c3 parallax night (navy→indigo→pink sky, moon with two halo rings,
blurred clouds, two layered SVG skylines, gradient-text headline, scroll rail), c4 isometric stack (three SVG
cubes each drawn as three shaded faces, dashed leader lines to boxed labels, a highlighted word in the headline),
c5 torn collage (two torn clip-path gradient photos tilted opposite ways, tape strips, a colour-inverting italic
serif headline across both, drop-cap column, a hand-drawn red ellipse with a note).
Everyday: e1 kanban with two swimlanes x four columns, WIP over-limit count, tags, avatars, progress bars, done cards
faded and struck; e2 growth dashboard: KPI cards with sparklines, a 4-step funnel, a stacked bar chart, a 6x6
retention cohort triangle in five teal shades; e3 code editor: activity bar, file tree, tabs, syntax-coloured code
with line numbers and a current line, minimap, terminal with pass/fail lines, status bar; e4 product page: thumbnails,
big photo, stars, sale price, colour swatches (one ringed), size grid with sold-out sizes struck, add to bag,
accordion; e5 admin table: 10 rows x 8 columns with checkboxes, avatars, role, status pills, usage bars, a blue bulk
bar for 3 selected rows, an open status filter menu with shadow, pager.

Measured: blank page scores 14-97% colour / 16-76% structure (c1, c3, e3 are dark). Effect scan misses what makes
this round hard: per-letter weights, SVG polygon cubes and skylines, box-shadow halo rings and the ellipse are not
techniques it reads; c4 shows no effects at all.

Untuned planner misses (from autoplan.txt; rounds 1-6 plans unchanged, no rule changed this step):
- c1: list tile says only "SYNC" (six bars, one cyan, unsaid); chart bars all "dark grey" (the yellow tallest bar
  lost); orb glow/shadow and that it sits over four tiles unsaid; tiles' 28px rounding unsaid.
- c2: the variable-weight wave word "VARIABLE" has no note at all (its sizes/weights per letter unsaid).
- c3: clouds, both skylines and the scroll rail are bare boxes (no colour, blur, polygon tops); moon halo rings
  unsaid ("hard edge, no blur").
- c4: the three cubes and the leaders are bare boxes: no faces, colours or dashes; the yellow highlight on "three"
  unsaid; labels read as white buttons (close).
- c5: tapes read as image placeholders (would build an X); column's drop cap and the red ellipse unsaid;
  photos' torn edges said only "jagged cut-out".
- e1: card tags' colours, avatars, the blocked card's red left edge and done cards' strike-through unsaid; WIP "4 / 3"
  in red unsaid; lanes read as inputs; progress cards put the title as a small grey line under the bar.
- e2: KPI sparklines unsaid (red one too); funnel bars' widths/fade unsaid (said as a list); stacked bar chart says
  only its title; cohort shades read as status pills with wrong colours ("near-black 33%").
- e3: line numbers fused into the code ("1import"); current-line highlight and minimap unsaid; terminal's green/red
  lines unsaid.
- e4: page note missing; main photo and two thumbs unsaid (no colour, the jacket shape); rating/price run together
  ("$189$240-21%": strike-through and red badge lost); size grid's selected and sold-out states unsaid; ringed swatch
  unsaid.
- e5: table rows unsaid beyond columns (avatars read as status pills "A", "B"); checkboxes, usage bars, selected row
  tint unsaid; bulk bar's blue fill and "3 selected" unsaid; menu read as a card of run-on text.

Worst gaps to fix first (planner, free): e5 rows, e4 run-on inline text and states, c2 wave word, c4/c3 SVG
polygons as shapes, e2 charts.

## n92: first live builds, creative c1-c3 (2026-10-22, ~181k billed; --budget 250000 stopped before c4, c5)

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| c1 bento overlap | 55% | 51k | orb gone (only a faint glow behind the tiles); list and chart tiles built white (target near-black); "07" sits behind the chart tile; list bars missing; hero headline on one line at the bottom |
| c2 variable wave | 16% | 27k | the unsaid wave word became an invented paragraph; everything below shifts ~80px; band twice as tall |
| c3 parallax night | 73% | 42k | both skylines missing (bare boxes); sky built dark grey (target navy → indigo → pink); clouds built as hard dark bars; moon halo rings missing |

Each build was one codegen turn (no repair). The misses are the ones the plan readout predicted: what the planner
leaves unsaid is dropped or invented. Next: say the wave word (per-letter size/weight), SVG polygons (skyline tops,
cube faces) as shapes with fill, a page gradient's middle stop, a filled orb with glow over other tiles (z-order),
near-black tiles' fill; then live c4, c5 and re-run c1-c3.

## n94: planner says the round-7 creative shapes (2026-10-22)

New rules (rounds 2, 4, 5, 6 plans unchanged; rounds 1 and 3 gain hex stops on three 3-stop gradients):
- a word set letter by letter (each its own size/weight) is a heading drawn at its biggest letter, and says every
  letter's px and weight on one baseline (c2 "VARIABLE");
- SVG polygons are shapes: a stepped silhouette says its rooftops and exact points (c3 skylines), three faces sharing
  corners say "isometric cube" with each face's hex and corners (c4), a `<g>` inside an SVG counts, straight dashed
  leader lines say their ends (c4);
- a straight gradient with 3+ stops says each hex and where the middle stop sits (c3 sky);
- a textless round radial blend is a lit sphere with its stops, highlight, glow and "on top of the tiles" (c1 orb);
- a tile with a stack of thin bars says the bars (c1 list), a bar chart with one or two odd bars says which (c1 yellow);
- a tilted band says its own thickness before the tilt (c2: 86px band was said as its 242px outline, built 2x tall).

Live (~294k billed, c2 before the heading/band fix):

| page | before (n92) | now | what's left |
|---|---|---|---|
| c2 variable wave | 16% | 37% | wave word built right; band ~2x thick and low (fixed after, re-run below) |
| c3 parallax night | 73% | 90% | both skylines and the 3-stop sky right; moon halo rings and soft clouds still missing |
| c4 isometric stack | — | 91% | three cubes and dashed leaders right; faint sketch outlines leak round cubes, "three" highlight missing, labels pills not boxed |

Re-run after the heading and band fixes (~126k billed):

| page | before (n92) | now | what's left |
|---|---|---|---|
| c1 bento overlap | 55% | 85% | lit orb on top of the tiles, near-black list and chart tiles, cyan bar, yellow tallest bar all right; hero headline built small at the top (target 84px two lines at the bottom), "07" sits behind the bars |
| c2 variable wave | 16% (37%) | 61% | wave word and a thin band right; slider rule built thick with a tiny knob (axis, knob, label regions missed) |

Round-7 creative now: c1 85, c2 61, c3 90, c4 91; c5 torn collage not built yet.

## n95: first live builds of the round-7 everyday pages (2026-10-22, ~404k billed)

Planner, before the live run (rounds 1-6 plans unchanged):
- a table whose cells hold checkboxes, round letter avatars or usage bars says every row cell by cell (checkbox,
  avatar colour + letter, bold name, grey email, pill colour, bar %), the header fill, row height, the lines between
  rows and which rows are selected (tinted); tables with only pills keep the old one-line note (rounds 3, 4);
- a filled bar with its own lead copy says its fill, the lead ("3 selected") and that its buttons are outlined;
- a floating menu (short options stacked in a white card with a big soft shadow) says its size, shadow, that it floats
  over what is under it, the options one per line and the highlighted one;
- (after e1's first build) a task card says its tag (colours), title, progress bar, avatar dot and corner, a coloured
  left edge, faded and struck when done; a column head says its count at the far right (red "4 / 3"); a swimlane label
  says its dashed rule across the page (was "input").

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| e1 kanban lanes (old plan) | 22% | ~60k | heads invented ("TO DO", "BACKLOG"), counts dropped; no avatars, no strike-through, done cards given tags; lanes as boxes |
| e1 kanban lanes (card notes) | 23% | 66k | heads, counts, red "4 / 3", tags, avatars, struck done cards, red edge all right; but cards packed in flow (target keeps 60px gaps), MOBILE lane ~240px high, filter chips pushed right |
| e2 funnel + cohort | 28% | ~70k | sparklines missing; funnel built as labelled progress rows (target filled labelled bars); stacked bar chart invented as a source list; cohort built as pills with invented numbers (target teal heat cells, triangle) |
| e3 code editor | 86% | ~65k | close; line numbers, current line and terminal colours mostly right |
| e4 product page | 30% | ~70k | main photo and two thumbs blank placeholders (lavender photo with the jacket shape unsaid); size states lost; sale badge pale; all ~15px low |
| e5 admin table (row notes) | 66% | ~70k | every row, checkbox, avatar, pill, bar, selected tint, bulk bar and floating menu right; table ~16px low, pager below the page and "Showing 1–10 of 128" dropped |

Round-7 everyday now: e1 23, e2 28, e3 86, e4 30, e5 66. Next: kanban cards at their drawn spots (absolute or fixed
gaps) and lane top; e2 sparklines, funnel bars, stacked bars, cohort heat cells; e4 photo shape and size states.

## n97: everyday fixes, kanban, funnel/cohort, product page (2026-10-22, ~229k billed)

Planner (rounds 1, 3, 4, 6 plans unchanged; rounds 2, 5 tab/menu bars gain "all at the left" only):
- cards stacked in a column say their top px and the empty gap above them (>= 20px) when 4+ cards share columns;
  a section divider far below the marks above it (>= 60px) says its top px and the empty space left above it;
- a wide bar whose row of items ends before 60% of its width says they sit together at the left (right part
  empty) and names an outlined search field and its width;
- one stat card with an SVG polyline says label, value size and the sparkline (size, colour, rising/falling, corner);
- funnel: filled labelled bars down one left edge, each narrower, opacity, value at the far right on each row;
- SVG stacked bar chart: bar count, width, gap, segment colours bottom to top, total and bottom heights;
- cohort table whose cells are shades of one hue: shades darkest to lightest by hex, each cell number@shade, blanks;
- a short line of differently styled runs with a struck part (price $189, struck $240, red -21% tag);
- a row of choice boxes says the picked one (2px border, bold) and struck unavailable ones;
- a big textless gradient block with no other words says its gradient and that it is an empty photo backdrop;
- task-card avatar dot says it is a full 24x24 circle (built as a flat pill in e1 run below; not re-run).

| page | before (n95) | now | what's left |
|---|---|---|---|
| e1 kanban lanes | 23% | 50% (91k) | gaps, lane spacing and left toolbar right; everything ~16-30px low; avatar dots built as small pills |
| e2 funnel + cohort | 28% | 75% (~70k) | sparklines, funnel bars, stacked bars, cohort heat triangle all right; ~10px low |
| e4 product page | 30% | 48% (~68k) | price run, sizes states, gradient photo right; the target's indigo jacket shape (a big ::after shape, >200px so pseudoPic skips it) missing; thumbs' colours and selected outline lost; heart icon wrong |

## n98: product photo shape, thumbs, heart, pager (2026-10-22, ~257k billed)

Planner (round 7 e4/e5 and one round-3 pager note change; other plans unchanged):
- a big gradient photo backdrop with a big solid ::before/::after shape (over 120px) says the shape inside it: colour,
  hex, size, where it sits and its corners (e4 indigo jacket);
- a pale tinted thumbnail says its hex, size and corners ("no picture, no X"); a 2px+ outline ring says it is the
  selected one and how far out it sits;
- a one-glyph outline button names its icon (♡ "an empty heart (wishlist) outline icon") and its square size;
- a pager whose caption is its own text node keeps the caption, says its buttons' size, outline, the current one's
  fill and how far down the line sits; the pager rule now wins over the "head with a count at the right" rule.

| page | before (n97) | now | what's left |
|---|---|---|---|
| e4 product page | 48% | 62% (79k) | jacket shape, tinted thumbs, selected ring, heart all right; ~16-32px low; photo corners square; swatch ring lost |
| e1 kanban lanes | 50% | 36% (60k) | avatar dots now circles; but heads, lane rules and cards drift 10-30px lower down the page (aligned -64px) |
| e5 admin table | 66% | 62% (59k) | "Showing 1–10 of 128" now built; whole page ~16px low so the pager is cut at the bottom |

The repeated miss on the everyday pages is now vertical drift: builds put each block 10-30px lower than drawn, and
it compounds down the page. Next: find where the drift comes from (spacing the build adds between blocks vs the
drawn tops) and say or pin the absolute tops of the main bands.

## n99: vertical drift check (2026-10-22, ~255k billed)

Cause: the codegen contract already asks for each block's top within ~16px of where it was drawn, but nothing
measured it: the placement check passes anything within ~120px. New zero-token check (pipeline drift.ts, run on
whole-page builds with 6+ placed blocks): match each drawn block to the new element of its x, width and a plausible
height whose top is nearest, and when 3+ blocks (25%+) are over 16px off in the same direction, fail with each
block's built and drawn top so a repair turn takes the extra space out. Blocks off both ways are treated as
mismatches and say nothing.

| page | before (n98) | now | what happened |
|---|---|---|---|
| e1 kanban lanes | 36% (aligned -64px) | 51% (110k), aligned 0px, layout 14 to 54% | check found 14 of 16 blocks up to 66px low; one repair turn cut two margins; cards and the MOBILE lane now within ~19px. The repair used a negative margin, so cards cover the WEB APP label |
| e5 admin table | 62% | 64% (80k), aligned 0px | too few blocks matched for the check to speak; page landed at its drawn height anyway |
| e4 product page | 62% | 45% then 40% (27k, 37k) | both runs hit the 10-minute run limit during the repair; the check had flagged blocks off both ways (mismatches), now silenced. Not re-run |

Next: re-run e4 with the both-ways rule (must finish inside 10 minutes, back to ~62%); stop a repair from
pulling blocks up with negative margins over a label (e1 WEB APP).

## n100: run cap guard, drift repair wording (2026-10-22, ~251k billed)

Pipeline: the e4 runs were stopped by the server's 12-minute run cap during a repair turn, which reports the whole run
as failed. A repair turn now starts only when the time left before the cap covers it (the longest repair so far, else
40% of the build turn, at least 2 minutes, plus a minute to verify); otherwise the verified build is kept with its open
failures (pipeline repair-time.ts). Each turn's time and tokens are saved to the run folder as it ends (sends.json), so
a stopped run still says where its time went. The drift check's repair note now says to remove space and never pull a
block up with a negative margin, negative top or absolute position (n99 e1 slid cards over the WEB APP label).

| page | before (n99) | now | what happened |
|---|---|---|---|
| e4 product page | 45% / 40% (cap) | 45% (cap again, 31k), then 45% (147k), finished | first run before the guard: build turn plus repair hit the cap again. With the guard: one 8-minute build turn (120k, 26 tool calls reading 6 drawn-shape files), no time for a repair, run completes. Still ~30px low with the right column stretched; thumbs keep drawn X lines; heart is a drawn glyph |
| e1 kanban lanes | 51% | 74% (73k), one build turn | 19 of 19 blocks within 16px of their drawn tops, no repair needed, WEB APP label clear |

Next: e4's build turn is slow because thumbs and the heart become drawn-shape files the build reads and edits (6 here,
2 in n98's 62% run); find why they are kept as drawn shapes when the plan says plain tinted boxes and an icon, so the
build finishes in ~5 minutes and leaves room for the drift repair.

## n101: widgets drawn as plain boxes are no longer scaffolds (2026-10-22, ~148k billed + ~30k reading probe)

Cause: the reading marks thumbnails, swatch dots and the wishlist button as drawn things, so each cluster became a
"the user's strokes, keep them" component file the build had to read and edit (8 files in n100, 26 tool calls, an
8-minute build turn, no time to repair; the picture X's on the thumbs were kept too). Pipeline scaffold.ts: a path is
a primitive when it is a straight line, an upright (rounded) rectangle or a dot of 80px or less, measured on points
sampled along the curve (bezier handles overshoot rounded corners); edge tolerance capped at 14px so torn or skewed
photo edges stay real geometry. No scaffold when an action's strokes are 3+ closed primitives of about one size plus
any straight lines (thumbs, swatches, a size grid), or a single primitive in a region of 80px or less (icon button,
avatar dot). One or two big boxes keep their scaffold (creative cubes, skylines, tilted photos built well with it);
the trace rung is untouched. Checked on every auto-plan mark of rounds 1-7: all 37 buttons, 96 pictures, 226 of 227
boxes and 9 small dots read as primitives, all 7 cut-out shapes and 20 big circles do not. Replayed on saved run
records, only 7 actions across rounds 1-7 lose a scaffold: three on e4, four single small buttons/dots elsewhere.

| page | before (n100) | now | what happened |
|---|---|---|---|
| e4 product page | 45% (one 8-min build turn, 8 drawn-shape files, no repair) | 69% (148k): build 4.4 min, 9 tool calls, 1 scaffold (the jacket); repair ran (4.5 min) | thumbs clean tinted boxes with the selected ring, heart icon right, sizes and price run right. Left: photo square-cornered with a wobbly drawn edge, Details header overlaps its body text, swatch ring lost, add-to-bag navy (target near-black) |

A first attempt this step failed before building: the reading took over 150s (a read-only probe a minute later took
80s, ~30k billed); nothing in the pipeline changed for it.

## n102: torn collage first live build (2026-10-22, ~93k billed)

Planner (zero tokens): the two tape strips were read as pictures (a build draws an X box); now a small see-through
strip says its colour, opacity, unrotated size and that it lies on top of the photo edge (round-4 c5 tape note changes
the same way). The column's drop cap was unsaid (no note at all); a paragraph whose ::first-letter is floated and 2.5x+
the body size now says the letter, px, weight, colour and the text. The red ellipse was a bare box; an SVG holding one
unfilled stroked ellipse is now drawn as its own ring and says colour, line, size and tilt. Rounds 1-3, 5, 6 plans
unchanged.

| page | before | now | what's left |
|---|---|---|---|
| c5 torn collage | never built | 69% (93k, 5.6 min), must 100%, effects 75% | issue line "No. 12 · Winter" built above the column with an invented "VOL. IV" top right; photos ~60px right and the amber one taller, gradients more saturated (bright teal top, near-black brown bottom), added drop shadows; "read this first!" wraps to 2 lines; torn edges built wavy, not jagged |

Next: say the issue line's place (top right, its own line), the hand note on one line, and photos flat (no shadow) with
their gradient hexes; re-run c5.

## n103: torn collage photos, hand note, lone top labels (2026-10-22, ~85k billed)

Planner (zero tokens): a tilted gradient cut-out photo now says its exact two hexes and angle, its size and top-left
before the tilt, and that it lies flat (no drop shadow, no border) when the target has none. A 20-39px display line of
several words set on one line says its px, ONE line (nowrap) and width (the 30px hand note wrapped to 2 lines; same
clause now on 10 page titles in rounds 1-7). A 13-17px one-line label near the top of the page, not in a bar, says it
stands on its own at its top/left px with nothing written beside it (the issue line gained an invented "VOL. IV"; 8
labels across rounds 2-7 gain it). Round 4 c1's tilted orange scrap also gains its unrotated size. No plan marks changed.

| page | before (n102) | now | what's left |
|---|---|---|---|
| c5 torn collage | 69% | 82% (85k, 4.6 min, one build turn, no repair), colour 97%, layout 78%, must 100% | issue line in place, nothing invented; photos' teal and amber right, no shadows; hand note one line in its ring. Masthead built regular (target bold), issue letter-spacing lost, tapes ~1.3x large, amber photo ~40px taller, ring hand-wobbly |

Not done this step (still open): e5 admin table ~16px low and pager cut; e4 photo corners, Details header over body,
swatch ring.

## n104: page and band hexes, exact small dots, bulk buttons beside their label (2026-10-22, ~119k billed)

Planner (zero tokens): a tinted page now says its hex ("pale grey (#f9fafb, plainly not white) page"; 30 page notes
across rounds 1-7 gain a hex, white pages unchanged); a coloured band behind tilted type says its hex (the c2 band was
built rust, target #ff4f1f); a small textless dot says its exact box (w-[Npx] h-[Npx]: the 22px slider knob was built
~8px); a filled bar's buttons sit right beside its lead label (the e5 bulk buttons were pushed to the right end).
No plan marks changed.

| page | before | now | what's left |
|---|---|---|---|
| c2 variable wave | 61% | 66% (40k, one build turn), must 100%, effects 100% | band colour exact, knob 22px, rule thin. VARIABLE ~20px high, 100—900 ~15px low, nav links large; the 2px rule is not matched as a region |
| e5 admin table | 64% | 59% (79k, build + repair) | bulk buttons beside "3 selected", page tinted. Table built without its white bordered card, columns unevenly spaced (Email wide), menu moved right, pager ~16px low (cut) |

Next: e5 table says its white bordered rounded card and each column's left edge; pager kept inside the page.

## n105: table card and column edges (2026-10-22, ~91k billed)

Planner (zero tokens): a rich table (checkboxes, avatars, bars) that sits in a filled, bordered or rounded box now says
that card first (fill hex, width, border px + hex, corner radius, corners clipped) with the table filling it edge to
edge, and ends with fixed column widths: each column's left edge from the table's left. Only round-7 e5 changed; no
plan marks changed. Vitest: same 2 environmental failures.

| page | before (n104) | now | what's left |
|---|---|---|---|
| e5 admin table | 59% | 76% (91k, 5.0 min), colour 98%, structure 92%, layout 74%, must 100% | white bordered rounded card back, every column at its drawn edge, menu in place. "Columns" button pushed to the far right, Role/Status lose their ▾ carets, header row barely tinted, pager ~8px low |

Next: toolbar items packed at the left with the carets kept; e4 photo corners, Details header over body, swatch ring.

## n106: toolbar controls packed at the left with their carets (2026-10-22, ~91k billed)

Planner (zero tokens): a row of mixed controls (input, dropdowns, buttons) packed at the left of a wide row now says
so: in order, side by side with the gap, each control's width, the shared height/fill/border/radius, and a dropdown's
▾ caret written after its text. Only round-3 e1 and round-7 e5 toolbar notes changed; no plan marks changed. Vitest:
same 2 environmental failures.

| page | before (n105) | now | what's left |
|---|---|---|---|
| e5 admin table | 76% | 83% (91k, 5.2 min), colour 98%, structure 95%, layout 84%, must 100% | toolbar packed left with Role ▾ and Status: Any ▾, Columns beside them; pager at its drawn top. Header row built white (target #f3f4f6 tint), title ~8px right |

Next: e4 photo corners, Details header over body, swatch ring; c2 VARIABLE 20px high; e5 header row tint.

## n107: product page photo, swatch ring, near-black button, Details body; drift matched by copy (2026-10-22, ~298k billed)

Planner (zero tokens): a selected swatch dot says its outline ring and offset; a paragraph tucked right under a
one-line row (an accordion's open body) says its top and that it sits below that line, never over it; a near-black
filled button says its hex ("not a blue"). Plan diffs: r7 e4 (3 notes), r2/r4/r6 one near-black button or one
paragraph under a heading each. Pipeline: one upright drawn box whose words give its exact size (NxNpx, not tilted)
gets no drawn-shape file (the photo backdrop was built as the wobbly drawn outline). The page drift check now matches
a block by its quoted copy before its size: on the first run the size row matched a wrapper 7px off while it sat
91px low, blocks read as off both ways and the drift went unreported. Vitest: same 2 environmental failures.

| page | before (n101) | now | what's left |
|---|---|---|---|
| e4 product page | 69% | run 1 (old drift match): 46% (139k), everything right but the right column 77-91px low, unreported. Run 2: 71% (159k, 12.3 min), colour 99%, structure 92%, must 100% | photo rounded and clean, swatch ring, near-black button, Details body under its line, drift caught and repaired. Accordion rows ~20-30px taller than drawn (last row cut); the repair turn cost 91k and 16 tool calls (Grep x7, read Tailwind preflight); run time 12.3 min is at the cap |

Next: keep repair turns lean (no Grep/preflight reading for a spacing fix); accordion row heights; e5 header row tint; c2 VARIABLE 20px high.

## n108: lean repair turns, accordion row heights, header tint (2026-10-22, ~223k billed)

Pipeline: a repair turn is now told which file the build wrote and to fix the named elements with exact px classes,
without Grep/Glob or reading node_modules/Tailwind internals (packages/pipeline/src/repair-brief.ts, tested).
Planner (zero tokens): a ruled one-line row (accordion header) says its 1px rule colour and its exact height
(h-[Npx], text centred, no extra padding); a tinted table header says bg-[hex] on every header cell. Only round-7
e4 (3 notes) and e5 (1 note) changed. Vitest: same 2 environmental failures.

| page | before | now | what's left |
|---|---|---|---|
| e4 product page | 71% (159k, 12.3 min; repair 91k, 16 tools) | 73% (145k, 9.3 min; repairs 31k/5 tools and 23k/2 tools, Edit only), colour 98%, structure 92% | accordion rows the drawn height, last row fits. Right column still ~8-14px low at the top, rating all amber (target grey count) |
| e5 admin table | 83% | 79% (78k, 4.3 min; repair 10k, 2 tools) | header row still built white: the reading paraphrased the note and dropped the tint, the builder followed the reading. Avatars pale tints (target vivid), header checkbox missing. Within run noise |

Next: carry a note's colours through the reading's paraphrase (header tint lost there); e4 top-of-column drift; c2 VARIABLE 20px high.

## n109: typed colours checked on the page; the finishing pass stopped erasing pale tints (2026-10-22)

Root cause found: the zero-token finishing pass after every codegen turn rewrote any `bg-[#hex]` within ΔE 6 of a
colour the app already renders into that token. On the blank bench app that is white, so the note's pale grey
(#f3f4f6) header row (ΔE 4 from white) and #f9fafb page (ΔE 1.6) became `bg-white` after the build AND after the
repair that fixed them. The n106-n108 "the builder/reading drops the tint" diagnosis was wrong: the builder wrote
the tint every time. Any pale page or panel tint typed as hex in rounds 1-7 could have been erased the same way.

Pipeline: (1) a hex the user typed (any note or instruction) is never snapped (finish.ts askedHexes); (2) a new
zero-token check (fills.ts) reads typed fills from the words (page "(#hex) page", "(#hex) header row" /
"bg-[#hex] on every header cell", a "(#hex) bar/pill/button/band ... "copy"") and measures the built page's
computed colours; misses go to the repair turn with the exact class. Offline: all 46 claims it reads from
rounds 1-7 notes hold on the target pages (tests/rounds/fillcheck.mjs), so it adds no false repairs there.
Vitest: same 2 environmental failures.

| page | before | now | what's left |
|---|---|---|---|
| e5 admin table | 83% best (79% n108) | run 1 (check only): 79%, check caught page + header white, repair fixed them, the finishing pass undid it. Run 2 (both fixes): **87%** (113k, 7.9 min), colour 99%, structure 96%, layout 85% | header tinted, page tinted. Role/Status dropdown labels wrap to two lines, header checkbox missing, avatars paler than target |
| e4 product page | 73% | 72% (139k, 10.0 min; repair 67k, 8 tools, Edit x6), colour 98%, structure 93% | within run noise: whole right column and photo ~20px right/low, Details body sits tight on Care & materials (target leaves a gap); the one typed fill (-21% tag red) held |

Pages whose notes type a pale tint within ΔE 6 of white, so their tint was liable to be erased the same way (20 of
70): r1 c5, e1, e5; r2 e1; r3 c2, e1, e2, e5; r4 c2, e1, e3; r5 c3, e1, e4; r6 e1, e2, e4; r7 e1, e2, e5.

Next: re-run a few of those (r7 e1 kanban, r7 e2 funnel, r6 e2 charts) to show the gain; e5 dropdown labels wrapping
("Role ▾" on two lines) and header checkbox; e4 right column offset.

## n110: re-runs after the pale-tint fix (2026-10-22, ~240k billed)

Re-ran three pages whose notes type a pale tint the finishing pass used to erase. All three kept their tints
(page and panel greys/blue-greys built as typed) and all three went up, each in one build turn except e2 (one repair):

| page | before | now | what's left |
|---|---|---|---|
| r7 e1 kanban lanes | 74% (73k) | 76% (53k, 3.1 min, one turn), colour 99%, structure 95%, layout 74% | Mine / Bugs / Blocked filter chips built as bare words (target outlined pills); cards ~5px low |
| r7 e2 funnel + cohort | 75% (~70k) | **80%** (~144k incl. reading, 10.7 min; build 82k + repair 40k), colour 98%, layout 93% | all eight regions in place; the build read three leftover drawn-shape files first (11 tools) |
| r6 e2 multi chart | 76% | 78% (43k, 2.2 min, one turn), colour 98%, structure 87%, layout 69% | title and filter row ~10px high, everything below drifts 5-15px lower; line chart smoother than target |

Planner (zero tokens, round-7 e5 only, toolbar + table notes, no plan marks changed): a packed toolbar says every
label stays on one line (Role ▾ wrapped to two lines); a rich table's header says its first cell is an empty
select-all checkbox (it was left out). Not yet run live. Vitest: same 2 environmental failures.

Next: re-run e5 for the one-line dropdowns and header checkbox; e1 outlined filter chips; r6 e2 heading row drift.

## n111: one-line dropdowns, header checkbox, outlined filter chips (2026-10-22, ~179k billed)

Planner (zero tokens): a row of short links now says which of them are outlined pill chips when each has a border and
the same white fill as its bar (round 7 e1 Mine / Bugs / Blocked are white-on-white pills with a grey ring; the old rule
only counted unfilled items, so they were never said and got built as bare words). Re-planning rounds 1-7 changed one
note (r7 e1 top bar) plus round 3's toolbar picking up n110's one-line rule. Vitest: same 2 environmental failures;
typecheck clean.

| page | before | now | what's left |
|---|---|---|---|
| e5 admin table | 87% best (79% n108) | 81% (81k, 4.4 min; build 56k + repair 6k), colour 99%, structure 93%, layout 82% | Role / Status dropdowns on one line and the header select-all checkbox are in (both fixed). Rows ~5px taller so the table ends ~10px low; filter menu ~10px right. Within run noise of 79-87 |
| e1 kanban lanes | 76% | 74% (98k, 6.6 min; build 44k + repair 30k), colour 99%, structure 95%, layout 73% | Mine / Bugs / Blocked now outlined pills (fixed). "Sprint 42" built regular (target bold); progress bars run edge to edge at the card's foot with no grey track; columns ~5px off. Within noise |

Next: r6 e2 heading row ~10px high with drift below (not touched this step); kanban card progress bar track; bold lead word in a link row.

## n112: kanban progress-bar track, bold lead word, one-word page title (2026-10-23, ~288k billed)

Planner (zero tokens): (1) a task card's progress bar says its track width, gap under the title and both hexes, and
that it is not the card's full width (r7 e1 bars were built edge to edge at the card foot with no track); (2) a link
row's lead item is compared with the style most of the row shares, so a search field's grey placeholder or a selected
chip no longer hides it (r7 e1 bold 18px "Sprint 42", r6 e1 bold 22px "Northwind" now said); (3) a one-word page title
20-39px near the top says its px size, box top and height (r6 e2 "Overview" built ~10px high). Re-planning rounds 1-7
changed 12 notes (7 titles, 2 lead words, 3 kanban cards), no plan marks. Vitest: same 2 environmental failures;
typecheck clean.

| page | before | now | what's left |
|---|---|---|---|
| r6 e2 multi chart | 78% | **80%** (135k, 10.3 min; build 47k + repair 70k), colour 98%, structure 90%, layout 69% | title and filter row now in place; cards below ~5-10px lower with wider gaps; repair read index.html / vite config (7 tools) |
| r7 e1 kanban lanes | 76% best (74% n111) | run 1: 48% (65k, one turn; whole board below the top bar ~15px low, under the 16px drift check, so no repair). Run 2: **77%** (88k, one turn), colour 99%, structure 95%, layout 74% | progress bars 180px on a grey track, "Sprint 42" bold (both fixed). Lane labels ~5px off |

Next: a whole board offset ~12-15px the same way slips under the 16px drift rule (run 1); r6 e2 repair turn reading config files.

## n113: whole board shifted the same way, under the 16px rule (2026-10-23, ~178k billed)

Pipeline (zero tokens): the drift check now also names a page whose blocks below the top bar are all off the same way
by a little: when 6+ blocks match, two thirds of them sit 6px+ off the same way and their median is 8px+, it fails with
"N blocks all sit about Xpx lower", names the first shifted block and asks for the one extra space above it to come
out (no negative margins). The repair brief now also forbids opening index.html, package.json and vite/tailwind/
postcss/ts config (r6 e2's repair read them). Vitest: same 2 environmental failures; build clean.

| page | before | now | what's left |
|---|---|---|---|
| r7 e1 kanban lanes | 77% best (48% n112 run 1) | run 1 (old thresholds): 72% (82k, one turn): heads +6, cards +8, second lane +11, all under 16px, unreported; its offsets are a unit test now and the new rule names them. Run 2 (new rule): 72% (96k, 6.3 min; build 48k + repair 21k, Edit x3): build drifted 24-40px, the old rule caught it, repair brought cards to +7/+8 | lane label "WEB APP" region missed (the drift check reads its line as -1px though it sits ~12px low: wrong match for thin lane lines); top bar slightly padded |

Next: thin lane-label lines matched to the wrong element by the drift check; a residual +7px shift sits just under the
new median rule. Round 7 has been polished for many steps at 72-87%: consider moving to round 8 (harder pages).
