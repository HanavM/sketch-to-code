# Round 8 (n114): harder than round 7, untuned first look

Creative: c1 depth stack (three gradient cards turned in 3D perspective, each further card fainter, a headline with one
hollow outlined word, two pill buttons, progress dashes), c2 orbit type (capital letters running round a dashed circle
around a solid red-orange disc, a word repeated four times fading out, a black ticker bar), c3 masonry stickers (eight
rounded tiles of different heights in four columns: mesh-glow, text, gradient and flat tiles; two round stickers with
hard shadows tilted across tile edges), c4 topo knockout (SVG contour lines and rings round a glowing pin, a giant
two-line headline filled with a lime-yellow-orange gradient, stats row), c5 diagonal duotone (yellow/blue split on a
diagonal, a 640px "8" that inverts colour where it crosses the split, fine diagonal grain, vertical side strip).
Everyday: e1 three-pane mail with an open compose window floating bottom right, e2 analytics with an open date-range
popover (presets + calendar with a highlighted range) over an area chart and a weekday x hour heat grid, e3 design
editor (layers panel, canvas frame, a selected pill button with four handles and a size badge, a collaborator cursor,
properties panel), e4 cinema seat map (12 x 11 seats with an aisle, taken/selected/recliner states, curved screen,
order summary with held-seat timer), e5 docs page (top bar with search, sidebar tree with active item, breadcrumb,
code block, callout, options table, "on this page" contents).

Measured: blank page scores 11-96% colour / 12-73% structure (c1, c4 dark). Dry draw: all 10 pages drawn through the
overlay with no failures; untouched pages score 0-5% likeness.

Untuned planner misses (from autoplan.txt; no rule changed this step):
- c1: the 3D card stack is read as a picture (would build a placeholder): its three cards, their perspective turn,
  gradients and fading unsaid; the hollow outlined word "depth" unsaid; headline breaks garbled ("depth , not");
  progress dashes have no note.
- c2: the orbit ring says "no outline" though a dashed circle runs round the letters; the echo word's fade per line
  (100/60/35/15%) unsaid; disc size unsaid.
- c3: six plain colour/gradient tiles are read as pictures; tile rounding unsaid; stickers' hard offset shadow unsaid.
- c4: the three contour rings round the pin are dropped (only the curves are said, 406 words); the stats row is read as
  "stat cards" with empty labels; the pin's glow ring unsaid.
- c5: the diagonal split says only "angled cut-out" (no corner points); the grain is read as an empty product-photo
  gradient; the left heading and copy get no note; the outlined "Get notified" button unsaid.
- e1: the compose window's dark header bar, shadow and float over the reader unsaid; rows' subject and preview lines
  unsaid; attachments dropped.
- e2: KPI labels and the red delta dropped; the area fill under the line unsaid; heat grid cells unsaid; the popover
  is read as "page numbers" (presets list, selected preset, calendar range ends unsaid) and its shadow/float unsaid.
- e3: the selected button says only "near-black": pill shape, blue selection outline and the four handles unsaid
  (handles are not marked at all); canvas frame read as a picture; text placeholder line has no note; active tool
  and blue Share button unsaid.
- e4: the seat grid has NO note (the whole point of the page): 12 x 11 seats, aisle gap, taken/selected/recliner
  colours; the hall card read as a picture; the curved screen read as "a progress bar"; stepper states unsaid;
  seat chips run together ("E4E5").
- e5: the article note drops the breadcrumb, body copy, code block and callout; inline code is read as "status pills";
  contents list's active item unsaid.

Worst gaps to fix first (planner, free): e4 seat grid, c1/c3 plain blocks read as pictures, e3 selection handles,
e2 popover calendar, e5 article blocks, c5 grain and left copy.

## n114: first live builds c1, c4, e4 (2026-10-23, ~224k billed, untuned planner)

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| c1 depth stack | 59% | 87k (build 41k + repair 46k) | the 3D card stack became one big flat grey picture box with a tiny "Q4 plan" tag; "depth" built solid white (hollow outline lost); a stray space ("depth , not"); page gradient runs to black at the bottom; progress dashes missing |
| c4 topo knockout | 91% | 65k (one turn) | gradient headline, contour curves, pin and label right; the three rings round the pin missing; stats built as small dark cards (target plain numbers) |
| e4 seat booking | 47% | 38k (one turn) | the seat grid is an empty grey panel (no note said the seats); row letters stop at J; summary lost poster, date line and seat chips (invented "Booking code E4E5"); recliner legend amber |

Exactly the misses the plan readout predicted: what the planner leaves unsaid is dropped or turned into a placeholder.
Next (free first): seat/grid maps cell by cell with states, a perspective card stack as cards (turn, gradients, fade),
a hollow word inside a heading, contour rings, stats rows without cards; then re-run c1, e4 and first builds of the
other seven.

## n118: planner learns seat maps, 3D card stacks, hollow words (2026-10-23, ~146k billed)

Planner (zero tokens): a seat/cell map is said cell by cell (12 x 11, cell size, gaps, rounded corners, aisle
columns, each kind's fill and border, one digit per seat per row with row letters); a pale panel with drawn parts on
top is a panel, not a picture (e4 hall, e3 canvas frame); a curved screen arc is not a progress bar; filled chips are
said apart (E4, E5) and a poster picture leading a card is said; a 3D card stack is said card by card (perspective,
turn, gradient, opacity, front card's dot and label); a hollow outlined word inside a heading is said; flat dash
indicators are said; a word split across elements no longer gains a space ("depth, not"). Rounds 1-7 plans unchanged
except round 4 e3's file preview thumbnail, now said.

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| e4 seat booking | 47% -> 73% | 47k (one turn) | every seat right (kinds, aisle, row letters); stepper pills lost their fills, timer moved up under the chips, legend swatches tiny, date line invented |
| e3 design editor (first build) | 49% | 51k (one turn) | layers/properties panels right; canvas frame placed too low and narrow, the near-black selected pill built blue with invented "Get started" text and an invented heading, handles lost, property fields unfilled |

Next: e3 selected pill (near-black, handles, no text), property fields as filled boxes, stepper pill fills; re-run
c1 with the 3D stack note; first builds of c2, c3, c5, e1, e2, e5.

## n119: selected layer, inspector fields, stepper pills; c1 and c2 live (2026-10-23, ~240k billed)

Planner (zero tokens): a textless filled pill with a selection outline or corner handles is said as an empty pill
(exact size, border-radius 999px, no text, not blue) with its outline ring and each small square handle on its corners;
an inspector panel (small caps headings over filled field boxes) is said section by section, every field a filled
rounded box with its value (and a colour swatch where there is one); a row of filled pills in different states is said
as a stepper, pill by pill with fill and ink and the separator. Rounds 1-7 plans unchanged.

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| c1 depth stack | 59% -> 79% | ~70k | 3D card stack built card by card with the turn, gradients and fade; "depth" hollow; dashes right. Page background navy at the top (target near-black with a soft glow) |
| c2 orbit type (first build) | 77% | ~55k | headline, copy, date and ticker right; the four SOUNDs all solid (fade per line lost); ring letters tiny and only part way round, dashed circle lost; the disc built as a shaded 3D ball with small FM26 |
| e3 design editor | 49% -> 69% | ~60k | fields filled, handles and selection outline right, no invented heading; the pill built square-cornered; grey text line built as a sentence; hero square-cornered; canvas frame a bit right and wide; active tool and Share not blue |
| e4 seat booking | 73% -> 54% | 45k | stepper pills now filled right; but the whole seat grid built ~45px low (its top-left place ignored), timer moved under the chips, row letters and screen label read as missed; position noise, not the stepper |

Next: e4 grid place (say its top as a margin from the screen, not only page coordinates); c2 echo word fade per line,
ring text size and full circle with the dashed ring, flat disc; e3 pill corners kept, a bare grey bar is not text;
then first builds of c3, c5, e1, e2, e5.

## n120: tiles, grain, orbit ring, echo fade, flat disc, seat grid place; c3 and c5 first builds (2026-10-23, ~364k billed)

Planner (zero tokens): a rounded flat colour or gradient tile is a plain tile with its size, rounding and hex, not a
picture; a rounded filled tile holding only copy says the tile fill and the ink apart; a sticker says its hard offset
shadow; faint repeating stripes are a grain texture laid over the page, not a product photo; a heading over a line or
an outlined button (no box) is said part by part with sizes and inks; big ring letters say their size, weight, radius,
that they run all the way round, and the dashed circle round them; a word repeated line by line says each line's
opacity; a big flat disc with a word says its size, hex and the word's type, no shading; an empty selected pill says
fully round ends; a thin rounded textless bar is a placeholder line, not text; a seat map says its top as a gap under
the screen label and inside its panel. Rounds 1-7 plans unchanged except round 3 c2's reel tile and round 5's yellow
quote tile (both now say tile, hex and rounding).

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| c3 masonry stickers (first build) | 72% | 81k (one turn) | tiles, gradients and stickers with hard shadows right; the near-black "2.4M" tile built with no fill (huge white text on cream); quote ink pink and sans; violet tile's glow lost; lime read mint; tiles gained soft shadows |
| c5 diagonal duotone (first build) | 86% | 95k (one turn; one earlier try timed out reading the drawing, ~0k) | split, inverting 8, grain, left and right copy, outlined button, side strip right; the yellow half turned into a yellow-to-orange gradient with the pen's scribble strokes left visible over the 8; 8 a little wide |
| c2 orbit type | 77% -> 94% | ~38k (one turn) | ring letters big and all the way round, dashed circle, fading SOUNDs, flat disc all right; ticker letters not spaced out |
| e3 design editor | 69% -> 69% | ~75k (build + repair) | pill round, hero rounded, grey line a plain bar now (looks much closer); layer rows taller, canvas ~12px low, so the layout part still misses the small labels |
| e4 seat booking | 54% -> 62% | 47k (one turn) | grid now starts right under the screen; row letters sit tight to the grid (target ~20px further left), timer and Continue not pinned to the card bottom, date line invented, screen flat |

Next: c3 dark text tile (heading in a filled tile) and radial glow on a coloured tile; c5 cut-out painted flat
(no gradient) and scribble strokes never kept; e4 summary items pinned to the card bottom, row-letter column place;
then first builds of e1, e2, e5 so round 8 has all 10.

## n121: date picker, shaded heat grid, KPI cards, docs article, compose window; e1, e2, e5 first builds (2026-10-23, ~130k billed)

Planner (zero tokens): an open date-range picker is said as a floating panel with its shadow, the preset column (the
chosen one bold and coloured), the month grid (empty lead cells, cell size), the range ends as filled rounded cells and
the days between as a pale band, and its two buttons (it was "page numbers"); a heat grid in several shades of one hue
is said cell by cell as shade numbers per row with the shade hexes; a KPI card whose label is its own bare text says
label, big number and the delta in its own colour; a line chart says its soft area fill, its grid lines and which way
each line runs (path points now count); a docs article is said block by block (breadcrumb, title, paragraph with inline
code chips, dark code block line by line with syntax colours, callout with its coloured left edge, ruled table with
every cell); a floating window with a dark title bar (compose) says its size, place, top-only rounding, shadow, the bar,
each field row and the send pill. Rounds 1-7 plans unchanged.

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| e1 mail compose (first build) | 68% | ~29k build (one turn) | compose window right (bar, fields, Send pill, shadow); mail rows lost their subject and preview lines; reader's second paragraph and attachments dropped; Compose button white (target lavender) |
| e2 date-range analytics (first build) | 61% | ~37k build (one turn) | popover presets, range ends and band, Cancel/Apply, heat grid shades, KPI labels and coloured deltas right; popover ~40px wide/right, calendar cells spread wide; table rows invented; line shape smoother |
| e5 docs page (first build) | 68% | ~35k build (one turn) | article right block by block (breadcrumb, inline code, code block colours, callout, ruled table); sidebar items after the first four invented and active item pink; contents list big dark text with invented items |

Round 8 now has all ten pages built: average likeness 75% (creative 84, everyday 66). Everyday misses are now the
items a note summarises ("5 more", "4 rows") and a build invents: say every list item and table row.

## n122: every list item and table row said; e1, e2, e5 re-run (2026-10-23, ~213k billed)

Planner (zero tokens): a side nav with small headings says each heading over its own links, every link, none moved
to another group; a stacked list of short items is said in full up to 12 (was 4 then "5 more"); mail rows that open on
the sender (sender, time, subject, preview) are said as mail rows with the full preview (a sender longer than a time,
"Ravi, me (3)", had dropped them to a bare list of senders); a table says every body row and its bold caption; an
opened message says every paragraph and each attachment chip side by side (tool buttons are not attachments); a
boxless contents list says its heading, every link, their size and ink, and the current one's colour. Rounds 1-7 plans
gain the same detail on 7 pages (r1 e5 and r3 e1 tables, r2 e2 filters, r4 e1 deals, r5 e2 table, r6 e3 mail rows,
r7 e3 file tree); no marks changed.

| page | likeness (v3) | tokens | what changed |
|---|---|---|---|
| e1 mail compose | 68% -> 74% | ~50k (one turn) | every mail row has its bold subject and preview; reader's second paragraph and both attachment chips built; Compose still white (target lavender), a faint grey wash over the page |
| e2 date-range analytics | 61% -> 66% | ~98k (build + repair) | table rows exact, "Top pages" caption; popover, heat grid and KPIs held; chart card ~10px low and taller, heat grid partly under the popover |
| e5 docs page | 68% -> 71% | ~65k (one turn) | side nav three groups with the right links, contents list small grey with "Overview" blue; nav rows a little taller than the target, article ~12px low |

Round 8 average now 76% (creative 84, everyday 68). Next: everyday layout places (cards a few px low, row heights),
Compose button fill; carried creative misses (c3 dark text tile and glow, c5 flat yellow half).

## n123: filled lead buttons, highlighted rows' ink, flat cut-outs, one-glow tiles, copy tiles; e1, c3, c5 re-run (2026-10-23, ~189k billed)

Planner (zero tokens): a filled button heading a list (the mail "✎ Compose") says its size, hex, rounding and ink, and
that the fill must show; the highlighted list item says its own fill and ink; a flat-filled cut-out says its one hex,
no gradient or texture, and that the drawn strokes are only its edge; a rounded tile lit by one soft glow says its base
hex, the glow's hex and place, its size and rounding (one glow over a fill now counts as a glow); a tile holding 30px+
copy is said as a filled tile with its ink apart (it went to the heading branch and lost its fill). Rounds 1-7 plans
gain the highlighted item's fill and ink on 7 pages, the Compose button's fill on 2 and flat cut-out hexes on 3; no
marks changed.

| page | likeness (v3) | tokens | what changed |
|---|---|---|---|
| c3 masonry stickers | 72% -> 89% | ~51k (one turn) | near-black "2.4M" tile filled with cream type; violet tile's lilac glow; quote dark serif; sticker words on one line (target two), pink tile paler at the top |
| c5 diagonal duotone | 86% -> 90% | ~93k (one turn) | yellow half one flat colour, no scribbles kept; the 8 built in a squared heavy face (target round Helvetica), side strip dark blue (target near-black) |
| e1 mail compose | 74% -> 79% | ~45k (one turn) | Compose lavender, Inbox row pale indigo with indigo text; mail rows a little taller than the target |

Round 8 average now 79% (creative 89, everyday 69). Next: everyday layout places (e2 chart card low and tall, heat grid
under the popover; e5 nav rows tall, article low), c5's 8 letter shape and strip ink, c3 sticker line breaks.

## n124: side nav spacing, article block tops, jagged lines, poster glyph face, cut-out side; e5, e2, c5 re-run (2026-10-23, ~330k billed)

Planner (zero tokens): a side nav says its row pitch and row height, where its first heading starts, its width and the
thin rule down its right edge, and the highlighted row's edge and ink; a docs article says each block's top below the
article's top (breadcrumb flush at 0); a straight-segment line chart says every point's height (and that it zigzags,
not smoothed); a poster-size glyph says its exact font family and weight; a dark bar holding light text says its exact
hex; a flat cut-out says its clip polygon and which side it covers. Rounds 1-7 plans gain the same on 19 pages (nav
spacing, line points, dark hexes, display faces); no marks changed.

| page | likeness (v3) | tokens | what changed |
|---|---|---|---|
| e5 docs page | 71% -> 84% (kept) | ~59k (one turn) | nav rows 30px apart from the right start with its edge rule, article blocks in place; top bar a little short, nav rule stops early |
| e2 date-range analytics | 66% -> 35% (not kept) | ~106k (build + repair) | line now a true zigzag, but KPI cards built tall and narrow, pushing chart, heat grid and table ~100px down; range band lost. A second try ran out of time (12.5 min) and was discarded. Picture: e2-date-range-analytics-n124-regressed-cmp.png |
| c5 diagonal duotone | 90% -> 31%, then 83% (not kept) | ~69k + ~96k | the 8 now round Helvetica and the strip near-black, but the first try mirrored the yellow half (the clip polygon is now said, side named); the second kept the halves but drew the 8 as a wave-shaped outline. Pictures: c5-diagonal-duotone-n124-cmp.png, -n124b-cmp.png |

Round 8 average now 80% (creative 89, everyday 72). Builds of record stay the best ones for e2 (66%) and c5 (90%).
Lesson: on long, dense pages extra detail can shift the layout; e2 needs its cards' sizes said (KPI 280x90 at y 90,
chart from y 200), and the poster glyph must be said as live text, never a drawn shape.
