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
