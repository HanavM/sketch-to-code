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
