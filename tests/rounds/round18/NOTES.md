# Round 18 (n178): harder than round 17, untuned first look

Creative: c1 liquid chrome (a 208px title filled by a chrome gradient clipped to the letters, a spinning conic blob with
a blurred dark core, a stack of three frosted cards turned in 3D and floating, a vertical mono ticker scrolling up, a glowing
gradient pill), c2 brutal grid (a bordered asymmetric 4-column grid, a 300px hollow "26" bleeding off its cell, yellow and
blue stat cells, a hatched cell with a hard-shadow card, a wobbling round sticker, a white circle in difference blend),
c3 isometric city (a plane turned rotateX(60) rotateZ(-45) with a grid and roads, four extruded blocks of three faces each,
drifting clouds, a bobbing speech-bubble pin), c4 duotone split (a cream panel cut diagonally over a scan-lined duotone
glow, a 230px italic word in difference blend across the split, vertical nav, a hollow plate number, an animated SVG
progress ring), c5 paper collage (lined paper, a torn-edge red sheet by a 24-point clip-path, a script word turned on a
serif headline, a tilted polaroid, tape strips, a hand-drawn SVG arrow, a bobbing sticky note, a perforated stamp).
Everyday (denser apps): e1 kanban with swimlanes (WIP over-limit column, label bars, points, avatars, a dashed drop slot,
a tilted dragged card), e2 code editor (activity bar, file tree with git marks, tabs, breadcrumb, syntax-coloured code with
gutter marks and a current line, minimap, autocomplete popup, terminal with a failing test, status bar), e3 analytics
dashboard (KPI cards with sparklines, an area/line chart with a dashed series and a hover marker, donut, funnel, table with
paging, an open date-range picker over the page), e4 email client (three panes, label chips, reading pane with attachments,
a floating compose window), e5 map booking (search pill, filter chips, listing cards with photo dots, an SVG map with water,
parks, roads, price pins, a selected pin and its popup card, zoom control).

Measured: blank page scores 15-97% colour / 8-63% structure. Dry-drawn 10/10 (untouched 0-3% likeness).

## n178: first live builds c1, c3, e5 (2026-10-24, ~348k billed)

| page | likeness | what was off |
|---|---|---|
| c1 liquid chrome | **82%** | chrome title, nav, lede, footer right; the blob built as a thin conic ring (its blurred dark core read as a hole), glass cards opaque white, both CTA buttons lost, an invented kicker and paragraph, the side ticker built as a zigzag line |
| c3 isometric city | **58%** first → **70%** | first: the scene was said as "a 3D cube" of seven #000000 faces at 0,0, so only a bare tilted plane was built. Planner now says an isometric scene of extruded blocks: the plane's grid and rim, the roads, and each block's footprint, height and three faces with their colours, origins and folds. Rebuilt: city near-identical; a dark box now sits behind the scene, the pin's white bubble lost |
| e5 map booking | **73%** | top bar, filters, listing cards right; the map said only as "pale blue-grey" (SVG water, parks, roads, six other pins and the search pill all lost), popup card has no white fill |

Also: a there-and-back animation (0%, 100% equal, 50% apart) is now said as bobbing or wobbling, not scrolling or
spinning (c3 pin, c5 sticky note, c2 sticker). Rounds 1-17 plans re-generated: unchanged.

Round 18 so far: **75%** over 3 pages (latest build each). Vitest: same 2 env failures; typecheck clean.
Next: an SVG map's water, parks and roads and pins said as shapes; a conic blob's blurred core is a soft shade, not a
hole; frosted cards' see-through fill; a 3D scene's wrapper has no fill; a speech-bubble pin; then first builds c2, c4,
c5, e1, e2, e3, e4.

## n179: scene maps, blurred blob middles, gradient buttons, vertical ticker, speech bubbles (2026-10-24, ~251k billed)

| page | likeness | what changed |
|---|---|---|
| e5 map booking | 73% → **90%** | the map is now said as its own SVG copied verbatim (water, parks, roads) with the search pill and six price pins placed one by one over it; the popup's white fill, rounding and shadow said (a page-coloured card lifted by a shadow is still a card). Left: the yellow tram line and some thin streets |
| c1 liquid chrome | 82% → **90%** | the blob's blurred, half-see-through dark middle is said as a soft shade (not a hole), with its lumpy radius; the glass cards' see-through gradient stops and backdrop blur said; both CTAs said as buttons with gradient and glow; the side ticker said as one vertical line of mono text scrolling up. Left: an invented kicker line over the title, cards turned the other way |
| c3 isometric city | 70% → **88%** | the pin is said as a white speech bubble with its tail, shadow and bob. Left: a see-through grey box still sits behind the scene; the cloud is not built |

Rounds 1-17 plans re-generated: round 11 card numbers no longer said bold (they are regular), round 16's
dark tooltip now said as a bubble with its tail; nothing else moved.

Round 18 so far: **89%** over 3 pages (latest build each). Vitest: same 2 env failures; typecheck clean.
