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

## n129: planner learns glass stacks, sliced words, stripes, outlined runs, ruled index, halftone (2026-10-23, ~214k billed)

Planner (free): a frosted glass stack is said blob by blob and card by card (place, see-through fill, border, backdrop
blur, shadow, then each card's lines, bars, track and avatars); a word cut into bands is said band by band (strip size
and place, fill, ink, the word's relative left/top inside it, so each band windows one slice); repeating-linear-gradient
is said as stripes with each band's px and hex, never a blend; a stroked run with some filled words lists every word as
outlined or filled; a ruled index (top rule per row, label left, year right, mono) is said as such; a halftone disc
(radial dot grid with background-size) with solid shapes over it; a dashed border says dashes.

| page | before | n129 | what is still off |
|---|---|---|---|
| c1 sliced kinetic | 52% | 92% (kept) | CTA built as a pill (target square), badge text on one line, vertical caption reads the other way |
| c2 glass layers | 45% | 94% (kept) | nav links spaced wider; near-exact otherwise |
| c3 mask bento | — | 67% (first) | punch-hole tile and task list built as grey photo tiles; notch on all four corners; FLUX centred, caption lost |
| c4 halftone poster | — | 84% (first) | top bar built hugging the page top (target 36px down, rule under); CTA a pill |
| c5 vertical editorial | 64% | 66% (kept) | stripes and outlined marquee now right; quote not italic, body columns and drop cap lost, byline boxed, marquee in serif |

Next: square buttons said square (two pages built pills), c3 punch hole / notch corner / icon task list, c5 italic
quote, drop-cap columns, byline rule; then the five everyday pages' first builds.

## n130: square buttons, bento tiles, editorial columns; first everyday builds (2026-10-23, ~411k billed)

Planner (free): a filled or outlined button with radius 0-8px says its size and "square corners" / "barely rounded, NOT a
pill"; a bento tile that is more than a box is said whole (size, place, fill, corners, overflow hidden) with its special
part: a punched round hole filled with the page colour, ONE corner notched by its exact clip-path polygon, icon task
rows (icon size, radius, colour, label, bold count right, row pitch), a giant gradient clip-text word placed left;
side-by-side columns of running copy say column width, gap, type, and a ::first-letter drop cap; a heading-over-line
block says an italic line as italic; an outlined word run in a sans face says so on a serif page. Faint repeating
stripes (alpha < 0.3, a grain overlay) stay texture, not a striped picture (round 8 c1 regression caught on re-plan).
Earlier rounds re-planned: 8 button notes gain their corner words, nothing else changed.

| page | before | n130 | what is still off |
|---|---|---|---|
| c1 sliced kinetic | 92% | 93% | CTA now square; badge text on one line |
| c3 mask bento | 67% | 96% | hole, notch, task rows, FLUX all right |
| c4 halftone poster | 84% | 92% | button barely rounded, top bar inset with its rule: near-exact |
| c5 vertical editorial | 66% | 74% | italic quote, drop cap, two columns, sans marquee right; byline still boxed (target: top rule, two items spread), caption chip dropped, vertical title short and low |
| e1 spreadsheet | — | 40% (first) | grid, columns and rows right; title bar invented ("Sales Tracker"), header row fill, green growth, selected F4 outline, total-row rule lost; grid scaled small |
| e2 map listings | — | 22% (first) | top bar and search pill lost; listing cards became a text list (no photos); the map is a blank grey panel (no streets, water, park, price pins) |
| e3 thread chat | — | 74% (first) | sidebar, channel, thread right; thread replies lost avatars, "3 replies" link and composer boxes; sidebar order shuffled |
| e4 flight results | — | 44% (first) | filters built as filled blue bars (checkboxes, slider lost); results one card of text lines (no route lines, airline squares, Select buttons); search fields lost |
| e5 billing usage | — | 59% (first) | layout right; plan prices not big, "Current" badge taken as a head; meters as thin lines; invoice amount/status/PDF columns lost |

Round 9 complete: average **69%** over all 10 (creative 93 94 96 92 74; everyday 40 22 74 44 59). Creative pages are now
near-exact; everyday app pages are where the planner leaves most unsaid. Next: e2 map and listing cards, e4 checkboxes,
slider and result cards, e1 title bar and cell styles, e5 big prices, meters and pills, then re-run.

## n131: map pins, listing cards, checkbox filters, result cards, cell grids, plan cards, meters (2026-10-23, ~286k billed)

Planner (free): a drawn map is said shape by shape (ground hex, each street strip and water/park area with size and
place, then every price pin with its place, the picked one dark); listing cards say the grid, the gradient photo
block (angle, two hexes), the white badge chip, and each line under the photo (title with the rating at the far right,
grey line, price with the bold part); a filter panel says every section with real checkbox rows (square size, border,
filled when ticked, label, grey count at the right) and a range slider (track, filled span, two ringed knobs, end
labels); stacked or side-by-side cards say every part at card px (solid airline square, times, the route line with
the text above and below it and stop dots, big price over a filled Select button, a tag over the top edge, outlined
buttons, a "Current" pill); a spreadsheet grid says columns, cell size, header fill, right-aligned number columns, a
coloured column, the selected cell's outline and the rule over the total row, then every cell row by row; usage meters
say label, big value with a small grey "of N", and the track with its filled share. Rounds 1-8 re-planned: no change.

| page | before | n131 | what is still off |
|---|---|---|---|
| e1 spreadsheet | 40% | 51% (kept) | cells, header fill, green growth, selected cell and total rule right; title bar still invented ("Sales Tracker", no icon, Share pill), pushing the sheet down; column F tinted |
| e2 map listings | 22% | 81% (kept) | map, pins, cards, badges right; top bar (logo, search pill, Host link) replaced by an invented heading |
| e4 flight results | 44% | 75% (kept) | checkboxes, slider, result cards right; search fields built as bare text (target white chips, yellow Search button); sort tab underline lost |
| e5 billing usage | 59% | 46% (not kept) | plan cards, Current pill and meters now right; but the side nav built as a grey inset card with a heavy shadow, and the invoice table lost its amount, status pills and PDF columns |

Round 9 average now **79%** (creative 93 94 96 92 74; everyday 51 81 74 75 59). Next: top bars said part by part
(logo icon, title, menu, search pill, Share pill), a search bar of white field chips, a plain table's every column
with status pills, a side nav's flat fill; re-run e1, e2, e4, e5.
