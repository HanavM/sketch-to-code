# Round 9 (n128): harder than round 8, untuned first look

Creative: c1 sliced kinetic (a 300px "MOTION" cut into three 100px horizontal bands, each band showing a different third
of the word at a different x offset: ink on cream, cream on a black band, red-orange on cream; a tilted round badge, a
mono index list, a vertical caption), c2 glass layers (three frosted translucent cards with blur and border over three
blurred colour blobs, a bar chart, a progress bar with avatar stack; a headline with one gradient-text word), c3 mask
bento (six tiles: gradient clip-text "FLUX" on ink, a tile with a punched round hole, a conic progress ring, a
diagonal-stripe tile with a pill cut-out, a purple tile with a clipped notch corner, a task list), c4 halftone poster
(a yellow dot-grid disc behind a solid sun, giant italic serif headline, dashed rotated stamp, info row), c5 vertical
editorial (a 150px serif title set vertically up the left edge, a horizontally striped "picture" with a caption chip, a
220px quote mark over an italic pull quote, two body columns with a drop cap, an outlined/filled marquee word row).
Everyday: e1 spreadsheet (title bar, rounded toolbar, formula bar, A-H column heads with F selected, 18 row numbers,
8 x 10 data grid with header fill, right-aligned numbers, green growth, selected F4 cell and a total row rule, sheet
tabs), e2 map + listings (search pill, filter chips, 2 x 2 listing cards with gradient photos and badges, a street map
with water, park and price pins, one active), e3 thread chat (plum sidebar with channels and DMs, a channel with
reactions and a "3 replies" thread link, an open thread panel with four replies), e4 flight results (dark search bar,
filter panel with checkboxes and a two-knob range slider, sort tabs, four result cards with a route line and stop dots,
price and Select button, a "Best value" tag), e5 billing (side nav, tabs, three plan cards with the current one outlined,
three usage meters with one red, an invoice table with Paid/Due pills).

Measured: blank page scores 20-98% colour / 12-65% structure (c2 and c4 are dark or saturated). Dry draw: all 10 pages
drawn through the overlay with no failures; untouched pages score 0-4% likeness.

Untuned planner misses (from autoplan.txt; no rule changed this step):
- c1: the sliced word says only `"MOTION", lines cream "MOTION", red-orange "MOTION"`: the three bands, their heights,
  the black middle band, the per-band offsets and the clipping (each band shows one third of the letters) are unsaid;
  the index list has no note; the badge's size unsaid.
- c2: the whole glass stack is read as "a contents list, no box": the three frosted cards (translucent fill, border,
  blur, shadow, positions), the colour blobs behind them, the bar chart, progress bar and avatars are all dropped.
- c3: the punch-hole tile and the task list are read as pictures; the stripe tile is read as a "near-black to white
  gradient" (diagonal stripes and the pill cut-out unsaid); the notched corner (clip-path) unsaid; FLUX's gradient
  fill unsaid (only "huge 200px bold title").
- c4: the halftone dot disc and the sun inside it get no note; the stamp's dashed border unsaid.
- c5: the vertical title's size (150px) and turn unsaid; the striped picture read as a "near-black to red gradient";
  the body columns and drop cap have no note; the marquee says only `"FIRE" left, "FIRE" right` (outlined words lost);
  the byline read as a bordered box.
- e1: the 80-cell grid is said as one long run of words: columns, header fill, right-aligned numbers, green growth,
  the selected cell outline and the total row rule unsaid; row numbers read as "page numbers"; the formula bar's
  "fx" put to the right.
- e2: listing cards said only as "list" (photos, badges, title/rating/price lines lost); the map says only "pale
  blue-grey": streets, water, park and the five price pins (one dark) all unsaid.
- e3: the thread panel's replies read as rows with time at the right; reactions and the thread link unsaid.
- e4: the filter panel is read as an inspector of filled field boxes (checkboxes and slider lost); the results list
  runs times and airports together and drops the route lines, airline squares and Select buttons.
- e5: plan cards' heads misread ("Current" taken as the second card's head); usage meters' bars unsaid; Paid/Due
  pills unsaid.

Worst gaps to fix first (planner, free): c2 glass cards, c1 band slicing, e2 map pins, e1 cell grid, c5 stripes and
marquee, c3 stripes/hole/notch, e4 checkboxes and slider.

## n128: first live builds c1, c2, c5 (2026-10-23, ~133k billed, untuned planner)

| page | likeness (v3) | what was off |
|---|---|---|
| c1 sliced kinetic | 52% | the word built as three whole stacked "MOTION"s (two hollow outlines, one red), small, at the left: no bands, no black middle strip, no slicing or offsets; the mono index list became an invented paragraph |
| c2 glass layers | 45% | headline, copy and button right; the whole glass stack (three frosted cards, colour blobs, bars, progress, avatars) missing: the right half is empty; a white strip above the page |
| c5 vertical editorial | 64% | vertical title, quote mark and quote right; the striped picture built as a smooth dark-to-red gradient with a large caption; pull quote not italic; drop cap lost; the outlined marquee shrank to two small "FIRE" words; byline boxed |

As in round 8, what the planner leaves unsaid is dropped or flattened. Next (planner, free first): glass cards over
blurred blobs as real cards, a word sliced into offset bands, repeating stripes vs a gradient, an outlined/filled word
run, a mono index list; then re-run c1, c2, c5 and first builds of c3, c4 and the five everyday pages.
