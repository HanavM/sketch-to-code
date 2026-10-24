# Round 14 (n153): harder than round 13, untuned first look

Creative: c1 variable wave (a word whose seven letters each have their own size and weight 100-900 on one baseline,
bobbing in a stagger, set in difference blend over a band of hard vertical stripes; a serif lede with a red italic
word; a weight dial ring; a mono axes row; a hard-shadow square button), c2 masked collage (a 330px word filled with
layered radial and hard-stop gradients through clip-text; torn clip-path cut-outs, one tilted gradient sheet, a
multiply disc, two see-through tape strips; a highlighted phrase; a tilted ring stamp), c3 ticket carousel (five
notched tickets on a 3D preserve-3d ring with translateZ, a perspective grid floor, glow, hollow pink word, pager),
c4 scroll story (three skewed parallax layers, a sun cut by a ring-shaped radial mask, an outlined marquee between
layers, a progress rail with chapter list, serif headline with an italic peach word), c5 neon tiles (a 3x3 glyph grid,
each tile its own weight, colour, glow, one filled, one hollow, one italic; a tilted sticker over the grid; a tilted
pink ticker; glowing outline button).
Everyday (dense multi-panel apps): e1 kanban with a detail drawer, e2 database console (table tree, numbered SQL with
colours, result tabs and grid with a selected row, status bar, schema panel), e3 product page (thumbs, image, buy box
with swatches and a size grid with sold-out size, ratings bars, feature columns), e4 observability (filter chips, four
sparkline KPI cards, a stacked area chart, a log table with level pills, an alerts column), e5 support inbox (app rail,
ticket queue with segmented filter and priority dots, conversation with agent bubble and dashed internal note,
composer, customer panel with tags and orders).

Measured: blank page scores 12-94% colour / 4-69% structure. Dry-drawn 10/10 (untouched 0-3% likeness).
Untuned planner misses visible in autoplan.txt:
- c5: the 3x3 glyph grid said as one word "AgR&QeS7?" on ONE line (tiles, per-tile colour, glow, filled and hollow tiles lost);
- c2: the clip-text word said as a "stripes card holding null CUT" (gradient-filled type lost), the highlighted phrase as a button;
- e4: the stacked area chart said only as its title and legend (the chart itself lost); log rows said as "name left, time right" (level pills lost);
- e3: the product image's radial disc said as a plain gradient;
- c4: the parallax layers' skew said as rotate; the ring-cut mask as a soft fade; the progress rail as one word; nav grey called "lavender";
- c3: tickets built as a 3D ring (good) but their notches (mask) not said.

## n153: first live builds c2, c3, c5, e4 (2026-10-23, ~272k billed)

| page | likeness | what was off |
|---|---|---|
| c2 masked collage | **43%** | "CUT" built as black type on a diagonal-striped card (gradient clip-text lost); highlight built as a block under the line, copy has a gap; footer run together; tape squared, not tilted |
| c3 ticket carousel | **61%** | real 3D ring built, but turned to SAT (front ticket not FRI), tickets un-notched, ring sits left; floor, glow and headline right |
| c5 neon tiles | **77%** (flatters) | the 3x3 glyph grid built as one white word on one line; no tiles, no glow, no filled or hollow tile; stats lost their big numbers |
| e4 observability | **83%** | KPI cards, sparklines, log pills and alerts right; the stacked area chart built as green bar chart; filter chips lost their boxes |

Round 14 so far: **66%** over 4 pages (c1, c4, e1, e2, e3, e5 not built yet). Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): a glyph tile grid said tile by tile (box, letter, weight, colour, glow, filled / hollow tile);
gradient-filled clip-text said as its gradient layers on the word (never a striped card); an inline highlighted phrase
said inside its sentence; a stacked area chart said as its SVG paths (never bars); a 3D ring's front face named and
ticket notches as a mask; filter chips as boxed chips; then first builds c1, c4, e1, e2, e3, e5.

## n154: planner fixes, live re-runs c2, c5, e4 (2026-10-24, ~330k billed)

Planner now says: a glyph tile grid tile by tile (box, border, letter, weight, italic, colour, glow, filled tile, hollow
letter); a giant word filled with layered gradients through clip-text, with its exact layers on the letters (the
computed clip of a layered background reads "text, text, text", so it was never seen as clip-text before); a stacked
area chart card as its exact SVG paths (never bars); an inline highlighted phrase in place inside its sentence.
Re-planning rounds 1-13 changes nothing.

| page | before | after | what changed / still off |
|---|---|---|---|
| c2 masked collage | 43% | **86%** | "CUT" built with its gradient layers inside the letters; still off: highlight laid over the line, tapes square not tilted. A second run (84%, not kept) put the highlight in place in the sentence but laid the green cut-out over the orange one and ran the footer together |
| c5 neon tiles | 77% | **89%** | the 3x3 glyph grid built tile by tile, glow, filled Q, hollow S, italic g all right; still off: stats lost their big numbers, ticker too thick |
| e4 observability | 83% | **87%** | stacked area chart built as its three filled hills; still off: filter chips unboxed, logo lost, alerts column has no panel |

Round 14 so far: **81%** over 4 pages (c3 61 untouched). Vitest: same 2 env failures; typecheck clean.

## n155: planner fixes, c3 re-run, first builds c1, c4, e1, e2, e3, e5 (2026-10-24, ~452k billed)

Planner now says: a 3D ring of cards as a ring (the group's own 200x300 box at its place in the scene, NOT inset 0;
the rotateY(0) card named as the one facing the viewer; each face's rounding, padding, top-left two-line text and the
shared ticket-notch mask written out); a see-through tape strip's top-left before the turn, its rotate() and dashed
torn ends, above everything; overlapping cut-outs in paint order; a ruleless row of 3-4 items pushed apart; stat items
as stacked number-over-label lines; a top bar of boxed filter chips part by part, with bare text such as a logo
glyph; a region said part by part also says its own panel (fill, border or top rule only, rounding).
Re-planning rounds 1-13: notes gain a panel line on 29 pages, layer order on 7, tape place/turn on 3; none re-run.

| page | before | after | what changed / still off |
|---|---|---|---|
| c3 ticket carousel | 61% | **86%** | ring centred, FRI facing, notched tickets, sub-lines; still off: pink glow behind the ring lost, arrows ~120px low |
| c1 variable wave | first | **69%** | stripes, blend, dial, serif lede, button right; letters packed into the middle (target spread across 1200px), axes rule lost |
| c4 scroll story | first | **86%** | sun ring, skewed layers, outlined marquee right; progress rail labels set vertical (target horizontal, lit segment), body copy invented |
| e1 kanban + drawer | first | **84%** | board right; drawer lost its status/priority pills, description box, progress bar and checkboxes |
| e2 database console | first | **90%** | |
| e3 product page | first | **78%** | buy box, sizes, ratings right; logo lost, product disc on the image lost, stars and rating text overprinted |
| e5 support inbox | first | **82%** | three panes right; rail dark grey (target purple), composer a grey band with purple Send (target white box, black Send) |

Round 14 complete: **84%** over 10 (c 69 86 86 86 89; e 84 90 78 87 82). Vitest: same 2 env failures; typecheck clean.
