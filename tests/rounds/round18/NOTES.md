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

## n180: first builds of the other seven pages (2026-10-24, ~701k billed)

| page | likeness | what was off |
|---|---|---|
| c2 brutal grid | **50%** | the yellow "84" and blue "12" stat cells were never tagged in the target, so never drawn: an invented text cell took their place; headline built small and mono (target heavy sans), hollow "26" small, hatching on the case card's border instead of its cell, list arrows on their own lines, the CTA button lost, grid short |
| c4 duotone split | **72%** | split, giant italic words, lede right; vertical nav built as a line over the logo, the glows a hard-edged box, the plate number not hollow, the progress ring an empty square, scan lines lost |
| c5 paper collage | **69%** | torn red sheet and headline right; polaroid a plain grey box with no photo, stamp unfilled, arrow a rectangle, sticky note empty, the lede card lost (text near invisible), tape and lined paper lost |
| e1 kanban swimlanes | **61%** | cards right; the dragged card's tilt went onto the whole first lane and the card itself was lost, column counts above names, avatar group lost, an invented "Load more" row instead of the collapsed "Growth" lane |
| e2 code editor | **95%** | near-identical |
| e3 analytics dashboard | **87%** | open date picker, KPIs, chart, donut, funnel, table right; hover marker, table paging and the bottom Settings link lost |
| e4 email client | **55%** | three panes near-identical; the floating compose window was pushed off the bottom (should stand 420px tall at the right), an invented tagline under the logo |

Targets fixed (no tokens): c2's two stat cells and c3's two clouds now carry region tags, so they are drawn and
planned; re-measured and re-planned (only c2, c3 plans changed; refs unchanged).

Round 18, all 10 built: **76%** (c1 90, c2 50, c3 88, c4 72, c5 69, e1 61, e2 95, e3 87, e4 55, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n181: floating window, a card turned on its own, trailing counts, an unsaid lane (2026-10-24, ~307k billed)

| page | likeness | what changed |
|---|---|---|
| c2 brutal grid | 50% → **73%** | its two stat cells now tagged and drawn: yellow 84, blue 12 built. Left: headline built small and mono (target heavy sans), hollow 26 small and high, list arrows on their own lines, the hatched cell's case card and the CTA button lost, the grid frame short |
| e1 kanban swimlanes | 61% → **73%** | the dragged card is now said as one card turned on its own (size, top-left, shadow, contents; lanes stay straight): built tilted over the board, right where it belongs; column heads said name left, count right (the trailing count had been read as the head); the collapsed "Growth" lane said (was unsaid, an invented "Load more" row). Left: the top bar's search and chips wrapped under the title |
| e4 email client | 55% → **71%** | the compose window (a light title bar on a white card) is now said as a floating window with its exact top-left: built in place, full height, with its To chip, subject row, body and Send button. Left: rows a little tight, the To chip unfilled |

Rounds 1-17 plans re-generated: round 8's compose window now also says its top-left; round 2's three unsaid message rows are now said part by part; nothing else moved.

Round 18, latest build each: **81%** (c1 90, c2 73, c3 88, c4 72, c5 69, e1 73, e2 95, e3 87, e4 71, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n182: paper pieces, a line drawing and a ring said whole, a hollow plate number at its own size (2026-10-24, ~183k billed)

| page | likeness | what changed |
|---|---|---|
| c5 paper collage | 69% → **90%** | each piece of paper is now said as ONE card with its size, place, fill, edge, shadow, exact turn and motion, then what is on it word for word: the polaroid (white card, a three-band photo, caption in its deep bottom margin), the blue stamp with its perforated edge, the lede card (dark words on cream; had been said as cream words), the bobbing sticky note with its two lines (had been said empty). The hand-drawn arrow is copied as its own small line drawing (had been built as an empty rectangle). Left: the two tape strips and the lined paper (not tagged in the target) |
| c4 duotone split | 72% → **83%** | the "29%" progress ring is copied as its own drawing with its text style and its filling animation (had been an empty square); the hollow "07" is said at its own 110px upright size on its own line above "of twenty-four" (had been said "same size as the rest", built 16px); glows soft. Left: vertical nav built at the top (target centred down the left edge), the scan lines over the photo |

Rounds 1-17 plans re-generated: only round 14's hollow glyph tile picks up its own size; nothing else moved.

Round 18, latest build each: **84%** (c1 90, c2 73, c3 88, c4 83, c5 90, e1 73, e2 95, e3 87, e4 71, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n183: big type in another face, rows pushed apart, a shadowed card on stripes, a square button, vertical nav (2026-10-24, ~197k billed)

| page | likeness | what changed |
|---|---|---|
| c2 brutal grid | 73% → **80%** | the "84" and "12" are now said as 120px heavy Impact (built big and heavy, were small mono); the services are said as four rows with the name left and the arrow at the far right, each ruled under (built right; had been one word per line); the case card is said as its own cream card with a 4px border and a hard 12px shadow ON the stripes (built right); START A PROJECT said as a dark button with its orange offset shadow (built right); the hollow 26 now said BELOW the headline (was "above the rest"). Left: the headline is still built small and mono though said as 64px heavy Impact on 5 lines; the grid's outer frame short |
| c4 duotone split | 83% → **69%** | the side nav is now said as three vertical words at their own spots and is built right, centred down the left edge. But this run lost what n182's run had: the two glows came out as one hard-edged box and the progress ring as an empty square (same notes as before: run noise, not this change) |

Rounds 1-17 plans re-generated: only round 14's hollow glyph tile changes (now said below its label, which is where it is); nothing else moved.

Round 18, latest build each: **83%** (c1 90, c2 80, c3 88, c4 69, c5 90, e1 73, e2 95, e3 87, e4 71, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n184: a big headline's own face, a glow block's dark base and box, a copied drawing with no frame (2026-10-24, ~162k billed)

| page | likeness | what changed |
|---|---|---|
| c2 brutal grid | 80% → **72%** | the headline is now said as 64px heavy Impact on 5 lines (the hollow "26" being said in Impact had hidden it); built big and heavy at last, though in lower case (now also said in capitals). But this run dropped the grid's 30px margin, so the whole grid sits up and left and its outer frame is lost: layout 57% (run noise; the frame was said as before) |
| c4 duotone split | 69% → **82%** | the glow block is now said with its own dark gradient under the glows and its exact size and place (the full right side); a copied drawing is said with no border or frame round it. Built right: both glows soft across the right side, the 29% ring a real ring. Left: the scan lines over the photo |

Planner also: a cursive face is said as handwritten (was "sans-serif"; round 18 c5 "on purpose", the polaroid caption). Rounds 1-17 plans re-generated: only the copied-drawing wording moved (rounds 7, 11, 15).

Round 18, latest build each: **84%** (c1 90, c2 72, c3 88, c4 82, c5 90, e1 73, e2 95, e3 87, e4 71, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n185: a grid set inside the page keeps its margin and frame; long copy kept whole; a To chip (2026-10-24, ~265k billed)

| page | likeness | what changed |
|---|---|---|
| c2 brutal grid | 72% → **86%** | the ruled grid had been said as "filling the page edge to edge", so it was built flush top-left. It is now said as set inside the page with its 30px margin, its exact width and top-left, and a 4px outer frame on all four sides. Built right: margin, full frame, and the headline in capitals at last. Left: the hollow "26" spills past the bottom of its cell (target clips it); the header bar is inset a little |
| e4 email client | 71% → **73%** | a two-line paragraph was cut at 70 letters and the build invented the rest; any wrapped block of two lines or more now keeps its whole copy, and the compose body is said word for word with its line breaks. The "To" name is said as a small grey pill chip. Built right: the reading pane and compose words now match the target exactly, chip right. Left: message rows a little tight |

Rounds 1-17 plans re-generated: long two-line copy now kept whole on a few pages (rounds 8, 9, 12, 15, 17); no other grid plan changed.

Round 18, latest build each: **85%** (c1 90, c2 86, c3 88, c4 82, c5 90, e1 73, e2 95, e3 87, e4 73, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n186: a hollow word clipped by its block; a top bar said part by part with its avatar stack (2026-10-24, ~209k billed)

| page | likeness | what changed |
|---|---|---|
| c2 brutal grid | 86% → **87%** | the hollow "26" spills past its cell, which clips it; it is now said that the block CLIPS it (overflow hidden) and its bottom 28px is cut off flat at the cell's bottom edge. Built right: the "26" stops at the cell, no longer over the footer. Left: this run's header bar sits flush at the top (the frame's top edge lost), the footer's two small lines stacked |
| e1 kanban swimlanes | 73% → **87%** | the top bar had been said as "white card ... list:", so it was built as a heading with its chips wrapped under it over the column names. A bar note that is a word list with two or more boxed chips is now replaced by the part-by-part bar note (56px tall, each part at its own x, all on one line), and an empty group of small filled circles is said as an overlapping avatar stack. Built right: one-line bar, search box, four avatars, chips. Left: the Done cards' struck-through titles built plain and wrapped |

Rounds 1-17 plans re-generated: unchanged.

Round 18, latest build each: **87%** (c1 90, c2 87, c3 88, c4 82, c5 90, e1 87, e2 95, e3 87, e4 73, e5 90).
Vitest: same 2 env failures; typecheck clean.

## n187: a struck title said struck; scan lines over a block said as their own overlay (2026-10-24, ~208k billed)

| page | likeness | what changed |
|---|---|---|
| e1 kanban swimlanes | 87% → **91%** | the Done cards' titles are set in an inner struck-through element, which the planner never looked at; any struck text part is now said STRUCK THROUGH. Built right: all three Done titles struck and faded. Left: two of them still wrap onto a second line (said one line) |
| c4 duotone split | 82% → **82%** | the photo's scan lines are painted by a pseudo-element laid over it (a repeating stripe gradient, multiply-blended) and were never said; a stripe overlay over a whole block is now said with its exact gradient and blend. Built right: fine scan lines across the whole photo, glows showing through. Left: the photo's own slanted left edge (a dark wedge between the cream and the glows), the cream shape's bottom edge kept wavy from the drawing |

Rounds 1-17 plans re-generated: struck words now said on round 7 (old price, sold-out sizes), round 14 and round 17 (a done task); nothing else moved.

Round 18, latest build each: **87%** (c1 90, c2 87, c3 88, c4 82, c5 90, e1 91, e2 95, e3 87, e4 73, e5 90).
Vitest: same 2 env failures; typecheck clean.
