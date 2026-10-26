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
