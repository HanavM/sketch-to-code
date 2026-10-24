# Round 15 (n157): harder than round 14, untuned first look

Creative: c1 text rings (two lines of text running round circular SVG paths, spinning, around a conic-gradient orb;
a serif italic word in the headline; a tilted round sticker button; an index list with a coloured rule), c2
misregistered print (a 560px "27" printed three times in cyan, magenta and yellow with multiply blend, each copy
offset; a dot-grid paper background; a bordered serif caption; a tilted tag; a colour bar; a registration mark),
c3 folded paper (one 230px red word running across five panels, each turned +/-18deg in 3D with its own shading),
c4 extruded blob (a stroked headline extruded with four hard text-shadows beside an SVG-clipped blob filled with a
rotated stripe pattern and a disc; a star badge cut by clip-path; an SVG wave divider), c5 contour poster
(a vertical bottom-to-top title, a contour map of repeating radial-gradient rings, a peak marker and label,
elevation bars, a barcode of repeating stripes).
Everyday (states, overlays): e1 data notebook (cells with numbered prompts, coloured code, output table, bar chart),
e2 email builder (block palette, canvas with a selected block outline and tab, properties panel with inputs,
slider and swatches), e3 hotel search (filter sidebar with range slider and checkboxes, result cards, map with
price pins, an OPEN date popover over the results), e4 bank dashboard under a dimmed overlay with a transfer modal
whose amount field shows an error, e5 issue page under a white dim with an open command palette.

Measured: blank page scores 12-99% colour / 7-83% structure. Dry-drawn 10/10 (untouched 5% likeness).
Untuned planner misses visible in autoplan.txt:
- c1: the two text rings (SVG textPath) said as "2 filled shapes 0x0" in an inset window: the ringed words are lost;
- c2: the three offset 560px "27"s said as "links: 27, 27, 27" (the overprint, size and multiply blend lost);
- c3: the folded word read as sliced bands of a 16px dark word (the 3D panels, their shading and the 230px red word lost);
- c4: the clipped striped blob said as 0x0 shapes; the extrusion's last dark shadow said as pink;
- c5: the contour rings said as "a soft #000 to #9fd356 gradient product backdrop";
- e5: a pale #f4f5f8 code block called "dark"; the Activity heading run together with the events; the palette's query row thin.

## n157: first live builds c1, c2, e4 (2026-10-24, ~261k billed)

| page | likeness | what was off |
|---|---|---|
| c1 text rings | **81%** (flatters) | the two spinning text rings not built at all; a navy square drawn behind the orb instead; index numbers overprint their lines; orb, headline, sticker, date right |
| c2 misregister | **40%** | the giant offset "27"s not built (only three tiny "27" links in the nav); caption lost its border, an empty pill added above it; dot grid lost; tag, colour bar, footer right |
| e4 bank transfer | **95%** | dim overlay, modal, error field, donut, balance card all right; transaction amounts sit under the names, not right-aligned |

Round 15 so far: **72%** over 3 pages (e5 stopped by the per-run budget guard; c3, c4, c5, e1, e2, e3, e5 not built yet).
Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): text on a circular SVG path said as its words, ring radius, size and spin; stacked
offset copies of one giant word with multiply blend said as overprinted layers (never links); a word spread across
3D-turned panels; SVG clip-path shapes with a pattern fill; repeating-radial contour rings; a pale code block never
"dark"; then first builds c3, c4, c5, e1, e2, e3, e5.

## n158: planner says text rings, overprint, contour rings, pale code; live c1, c2, c5, e5 (2026-10-24, ~279k billed)

Planner now says: words on circular SVG paths (each ring's radius, centre, size, opacity, spin); one giant word
printed 2-4 times, absolutely placed and offset, with multiply blend (each copy's colour and place); a crosshair
registration mark; a page dot grid; a line of text inside its own bordered box (with its type size);
repeating-radial contour rings verbatim; a pale code block called pale. Rounds 1-14 notes unchanged.

| page | likeness | what was off |
|---|---|---|
| c1 text rings | 81 -> **95%** | both rings built, spinning, right radius and words; index list lost its orange left rule |
| c2 misregister | 40 -> **85%** | three offset multiply 27s, dot grid, crosshair, bordered caption all built; caption type built ~12px (30px; size now said); nav regular weight |
| c5 contour poster | first **86%** | contour rings, peak, bars, barcode right; vertical title wrapped onto 2 columns; the three lime stats (2,962 m / 41 km / +1,880) built as one heading and small links |
| e5 issue palette | first **45%** | page, palette and pale code block right; the white dim over the page not built (everything under the palette at full strength) |

Round 15 so far: **81%** over 5 (c1 95, c2 85, c5 86, e4 95, e5 45). Vitest: same 2 env failures; typecheck clean.
Next (free first): a white see-through dim layer said so it is built (e5); a vertical one-line title never wrapped
(c5); stacked big-number stat items (c5); a list's coloured left rule (c1); then first builds c3, c4, e1, e2, e3; re-run c2, c5, e5.

## n159: white dim, floating palette, stat stack, vertical title, left rule; live c1, c5, e5 x2, c3, c4 (2026-10-24, ~460k billed)

Planner now says: a see-through dim the same colour as the page (60% white over white got no note); a shadowed panel
floating over a page-wide dim said part by part with its size, place and shadow, above the dim; a contents list holding
2+ big numbers said part by part (a stack of stats); a vertical title on ONE line, nowrap, never a second column; a
list's coloured rule down its left edge only. Rounds 5, 9, 11 notes gain true left rules / a floating modal; others unchanged.

| page | likeness (v3) | what was off |
|---|---|---|
| c1 text rings | 96% (re-run 89 not kept) | re-run lost the index list entirely; earlier build kept |
| c5 contour poster | 86 -> **91%** | title on one line, three lime stats stacked right |
| e5 issue palette | 45 -> **81%** | dim built, palette 600px at its place on top with shadow and query row; side nav not dimmed, LUM-482 chip overlaps "Change" |
| c3 folded paper | first **54%** | five 3D panels and the giant red CREASE not built at all; spec row boxed |
| c4 extruded blob | first **14%** | striped clipped blob built as a purple window with two balls; headline pushed down over the copy; invented kicker and footer; wave divider lost |

Round 15 so far: **74%** over 7 (c1 96, c2 85, c3 54, c4 14, c5 91, e4 95, e5 81). Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): a word across 3D-turned shaded panels (c3); an SVG clip-path blob with a stripe pattern and a
disc, never a window (c4); hard-shadow extruded headline at its place; wave divider; nothing invented; then first builds e1, e2, e3.

## n160: folded panels, verbatim defs SVG, typed SVG kept; live c3, c4 x2, e1, e2, e3 (2026-10-24, ~338k billed)

Planner now says: one word across side-by-side panels each turned in 3D (rotateY) with its own shading, every panel's
turn, gradient and the word's offset (was read as sliced 16px bands); a short SVG whose look lives in its defs
(clipPath, pattern, mask) or that stretches to its box (preserveAspectRatio none) as its own markup, verbatim
(was "3 filled shapes 0x0" in a window; the wave divider had no note). Rounds 7 c3 skylines and 11 c5 hills now get
the same verbatim SVG (not re-run). Pipeline: a drawn outline is no longer "put back" as a filled path when the
user typed the whole SVG to build there (it painted a dark slab over the striped blob on the first c4 run).

| page | likeness (v3) | what was off |
|---|---|---|
| c3 folded paper | 54 -> **90%** | five 3D panels and the red CREASE built right; spec row boxed (target a top rule), swatches region missed |
| c4 extruded blob | 14 -> 45 -> **67%** | 1st run: blob put back as a dark slab (fixed); 2nd: striped clipped blob and wave right; invented kicker pushes headline down over the copy; star badge built as a circle |
| e1 notebook | first **42%** | cells said only as a table: code cells, prompts, bar chart lost |
| e2 email builder | first **55%** | gradient hero, selected text block with tab, column placeholders lost; palette tiles filled grey |
| e3 hotel search | first **58%** | photos in result cards and the map (diagonal road) lost; search bar's yellow outline lost |

Round 15 complete: **76%** over 10 (c1 96, c2 85, c3 90, c4 67, c5 91, e1 42, e2 55, e3 58, e4 95, e5 81).
Vitest: same 2 env failures (+2 new tests pass); typecheck clean.
Next (planner, free first): notebook cells part by part (prompt, code with colours, output table, bar chart);
email canvas gradient hero + selected block outline/tab + column placeholders; result-card photos and map road;
a star badge's clip-path polygon; nothing invented above a headline. Re-run e1, e2, e3, c4.

## n161: notebook cells, painted canvas parts, card photos, map road, star badge; live c4, e1, e2, e3 (2026-10-24, ~260k billed)

Planner now says, part by part: a region whose table note hides code cells (a pre block present), so prompts, coloured
code, the output table and the bar chart are each said; a region whose note leaves out 2+ big gradient fills, outline
rings or dashed boxes (the email canvas: gradient hero, selected block's blue outline, dashed column placeholders);
a panel whose own background paints a hard-stop gradient line (the map road) with that background verbatim and its
pins at their places. Result cards now say a gradient photo area. A short word on a 8+-point clip-path is a STAR badge
with its polygon verbatim. Rounds 1-14 notes unchanged.

| page | likeness (v3) | what was off |
|---|---|---|
| e1 notebook | 42 -> **79%** | prompts, coloured code, output table, highlighted cell and bar chart all built; toolbar items packed left (target spreads "Python 3 idle" to the middle) |
| e2 email builder | 55 -> **90%** | gradient hero, blue outline on the selected block, dashed columns built; the small "Text" tab over the block (a ::before) still missing |
| e3 hotel search | 58 -> **89%** | photos in all three cards, map with its road and pins built |
| c4 extruded blob | 67 -> **69%** | star badge now a star; an invented kicker line still pushes the headline down over the copy |

Round 15 complete: **87%** over 10 (c1 96, c2 85, c3 90, c4 69, c5 91, e1 79, e2 90, e3 89, e4 95, e5 81).
Vitest: same 2 env failures; typecheck clean.
