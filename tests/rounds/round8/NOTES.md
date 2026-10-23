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
