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
