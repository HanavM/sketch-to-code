# Round 24 (n238): harder than round 23, untuned first look

Creative: c1 letterpress poster (three stacked copies of a 250px headline: red fill, a 3px outlined hollow copy offset
14px, a blue multiplied copy offset the other way; a halftone dot grain over the paper; a vertical italic serif label;
a turned black ribbon of words with star separators; a boxed date; a turned seal ringed by inset box-shadows),
c2 paper hills (a conic-striped sun, three SVG hill layers each with its own drop-shadow, a 3D-extruded headline made of
stacked text-shadows, a turned ticket with two notches cut by a radial mask and a dashed tear line), c3 shape grid (a 4x5
grid of twenty tiles: quarter circles, half discs, triangles and a diamond by clip-path, rings by thick borders, a turned
square, stripes at 90 and 45 degrees, a dot pattern; an italic serif headline over it in difference blend; a turned
asterisk), c4 scrapbook (three turned polaroids with gradient photos and handwritten captions, tape strips, a sticky note,
a word circled by an SVG ellipse, a dashed SVG arrow with a head, a dashed round stamp, ruled notebook lines),
c5 glitch signal (a headline split into a pink top clone and a cyan bottom clone by clip-path, offset and screen-blended;
a noise band, REC badge and timecode, two marquee rows, an SVG progress ring with a dash, a conic spinner cut to a ring).
Everyday (denser tools): e1 task database (sidebar, breadcrumb, view tabs, a grouped table with checkboxes, coloured tag
pills, avatars, progress bars, status pills with dots), e2 ride map (a map drawn with CSS street bars, a turned avenue,
parks, an SVG river, a blue route with start and end pins, a car and an ETA chip; a search box and a ride-choice sheet),
e3 video call (a shared screen with a bar chart, speaker tile with a green ring, muted badges, self view, round control
bar, chat panel with tabs and own bubble), e4 repo page (header with counts, tabs, file list under a last-commit bar,
README, topics, a script-built 7x18 commit heatmap, a segmented language bar), e5 checkout flow (stepper with done checks,
card form with a brand chip and an error field, a toggle, radio delivery cards, an order summary with quantity badges,
promo field, discount line and a pale disabled pay button).

Measured: blank page scores 13-98% colour / 3-69% structure.

## n238: first live builds of all ten (2026-10-26, ~828k billed, 55.8 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 letterpress poster | 82% | three headline layers, seal, date box right; ribbon star separators lost, vertical label low and cut, layer offsets smaller |
| c2 paper hills | 51% | headline extrude, sun, nav right; all three SVG hill layers lost (page a bare gradient), an invented "Routes worth the climb" row, ticket notches and tear line lost |
| c3 shape grid | 68% | headline blend, asterisk, about half the tiles right; quarter-circle and half-disc corners, rings, diamonds, the dot tile and 45 degree stripes built as plain squares or the wrong shape |
| c4 scrapbook | 83% | polaroids, tape, note, circled word, arrow, stamp right; photos placed a little off |
| c5 glitch signal | **90%** | split clones, ring, marquees right; headline 16px left |
| e1 task database | 60% | table rows, pills, bars right; sidebar fill lost (white), view tabs run together, title and rows too big (blank page already scores 98% colour here, so small misses cost a lot) |
| e2 ride map | 66% | search box and ride sheet right; the map itself lost: streets, parks, river and the blue route not built, only pins and the car |
| e3 video call | 84% | share, tiles, controls, chat right; call header missed as a region |
| e4 repo page | **90%** | near-identical, heatmap built cell by cell |
| e5 checkout flow | 74% | card form, error field, delivery cards right; stepper check circles lost, item thumbnails grey, pay button lost |

Round 24: **75%** over 10 (74.8; round 23 started at 78 untuned). Vitest: same 2 env failures (1460 tests); typecheck clean.

Worst gaps, next: c2 full-width SVG path layers (hills) must be said as built shapes with their fill and drop-shadow, and
nothing invented below the button; e2 a map drawn from many thin street bars, blobs and an SVG river plus a route path;
c3 a grid of mixed shape tiles said tile by tile (radius corners, clip-path, border rings, rotate, stripes, dots).

## n239: paper hills and ride map (2026-10-26, ~213k billed)

- c2: each hill is a full-width svg of ONE filled path with a CSS drop-shadow filter; no rule took it, so it got no note
  and the build made a bare gradient (and invented a "Routes worth the climb" row). A wide svg of one filled or stroked
  path is now said verbatim with its filter and its place in the paint order, nothing added under it.
- c2 ticket: the admission-ticket rule needed a sideways stub; a plain upright price stub right of a dashed tear line now
  takes it too: main part width (untransformed), tear line, stub, and the radial-gradient notch mask verbatim (was said
  top to bottom with an invented 301x190 block).
- e2: a big region of many absolutely placed parts (3+ long thin bars, round blocks, an svg, small labels) is now a MAP
  said part by part in paint order: each street bar with its edge ring and turn, parks, the river svg verbatim, labels.
  The full-page route svg (one stroked path) is said verbatim too.
- Re-planned rounds 1-23: only r15 c4 and r20 c5 wave notes gain the paint-order line (not re-run).

| page | before | after | what changed |
|---|---|---|---|
| c2 paper hills | 51% | **91%** | three hills with soft shadows, notched ticket with tear line, nothing invented; headline face built orange-ish and smaller, sun halo lost |
| e2 ride map | 66% | **84%** | streets, turned avenue, parks, river, blue route built; search box gained invented Pickup/Destination labels, ride thumbnails got car icons |

Round 24: **81%** over 10 (80.6). Vitest: same 2 env failures; typecheck clean.

## n240: shape grid and task database (2026-10-26, ~134k billed)

- c3: the tile-grid rule knew only plain squares, up-triangles, single quarter circles, domes and vertical stripes, so 8 of
  20 tiles were said wrong: a corner clip-path and a diamond said as up-triangles, rings made by thick borders said as
  plain circles, ::after shapes (a quarter circle over black, a turned diamond, a dome, a half bar, a ring) lost, a dot
  pattern said empty, 45 degree stripes said vertical, two-corner radii said square. Every tile now also says its exact
  CSS in brackets (fill or gradient with size, radius, clip-path, border, turn) plus each ::before/::after part with its
  box and paint, and the build is told to copy those brackets, never a look-alike shape.
- e1: the table said every body row 42px (the first body row is a taller group heading); the usual row height is now
  said (37px), with the group rows and header row their own. The sidebar's first "heading" with a red square icon is a
  BRAND row (icon + bold name, its links under it with no heading), and the real group headings say their size and ink
  (was built as small grey capitals). A run of 3+ side-by-side worded parts with one even gap says that gap (view tabs
  were built touching). A 20-39px one-line title says font-size exactly and, in a padded box, where its words start; a
  one-line 11-16px text in a padded box says its size and start (the description was built ~18px).
- Re-planned rounds 1-23: the even-gap line reaches tab and nav rows on ~40 pages, the exact title size ~16 (not re-run).

| page | before | after | what changed |
|---|---|---|---|
| c3 shape grid | 68% | **92%** | all 20 tiles right: corner cuts, diamond, rings, ::after shapes, dots, diagonal stripes; one ring a little thick |
| e1 task database | 60% | **78%** | brand row with icon, title and description at size, tabs spaced, rows 37px; sidebar rows tighter than target, status dots lost, avatars gained invented initials |

Round 24: **85%** over 10 (84.7). Vitest: same 2 env failures; typecheck clean.

## n241: checkout flow and letterpress poster (2026-10-26, ~380k billed)

- e5 stepper: each step is a round marker then its label, but the steps rule said "✓ Cart", "3 Payment" as bare words
  (built as plain text). Each marker is now said with its size and exact paint (filled green circle with a white check,
  outlined indigo or grey number circles), the label's size and ink, and each joining line its own colour.
- e5 order summary: thumbnails are gradients (said with no paint, built grey): each now says its exact gradient. The
  pale filled "Pay $289.44" block was said as a grey label/amount row (lost): a filled one-line block under the rows is a
  FILLED button with box, paint and centred words; a lone centred line is a small caption; a row whose whole ink differs
  from the other rows (green WELCOME10) says so.
- c1 headline: three copies of one word laid over each other were said "first/second/third of 3 stacked lines" by height,
  so the blue multiplied copy was built UNDER the red (no purple overprint). Copies on nearly the same spot now say their
  exact paint (colour, text-stroke, blend, opacity) and their paint order, the last on top.
- c1 ribbon: the red "✺" after each word (an ::after) was never seen: a sign drawn after each item is now said, with
  its colour, margin, item gap, type size and weight. A tilted band bleeding off both edges says it turns about its own
  centre (built turned about its top-left, ~70px high). A 25-59px vertical label now says its column, run and exact ink
  (was only "vertical"). A disc ringed by spread-only inset box-shadows says them verbatim (seal ring lost).
- Re-planned rounds 1-23: the ribbon-centre line reaches 7 pages (r3, r7, r16, r17, r19, r20); r16 stepper and r20
  overprint copies change (not re-run).

| page | before | after | what changed |
|---|---|---|---|
| c1 letterpress poster | 82% | **89%** | blue overprint on top, red stars in the ribbon, ribbon in place, seal ring, em dash; first two runs 65 and 66 (an invented tagline, ribbon turned about its corner); the kept run hit the time limit after the page was built, so its token count is undercounted; info line still garbled by an old note bug, date wraps |
| e5 checkout flow | 74% | **89%** | stepper circles, gradient thumbnails, green discount row, pay button; first run 78 (step labels small) |

Round 24: **87%** over 10 (87.0). Vitest: same 2 env failures; typecheck clean.

## n242: task database and scrapbook (2026-10-26, ~253k billed)

- e1 status pills paint a 7px dot of their text colour with ::before: never seen, built without. A table pill with such a
  dot now says "and dot", and the dot's size, paint and gap are said once after the rows. A table avatar with no letters
  now says it is a plain circle with NO initials (built with invented "A", "L"). A short lighter count after a bold group
  title ("▾ Design" + grey regular "3") is said apart (was built bold black, run into the title).
- e1 sidebar: rows were said 28px apart but the gaps are not even (more room after the brand row and above each heading),
  so the build packed them. A brand-led side nav now says each line's text top from the nav's top.
- c4 sticky note: its #fff27a fill was said as a colour word before "22px text", so the build painted the WORDS yellow on
  no paper. A lone block of copy on a filled box (100px+ tall, not a marquee) now says its ink, italic/serif, and that the
  box itself is filled edge to edge at its own size. A round dashed outline (border-radius 50%) now says ROUND (the stamp
  was built square). A word ringed by a hand-drawn SVG laid over it (the "photos" ellipse) is said verbatim, placed on the
  word's own span (never said before; lost).
- Re-planned rounds 1-23: round stamps and rings on 6 pages (r9, r12, r13, r17, r20, r23) now say ROUND (not re-run).

| page | before | after | what changed |
|---|---|---|---|
| e1 task database | 78% | **83%** | status dots, plain avatars, grey counts, sidebar spacing right; first run 77 (table ~10px low, Filter/Sort outlined) |
| c4 scrapbook | 83% | **86%** | yellow sticky note, circled "photos", round stamp; note not tilted, stamp words small, ruled-paper lines still lost |

Round 24: **88%** over 10 (87.8). Vitest: same 2 env failures; typecheck clean.
