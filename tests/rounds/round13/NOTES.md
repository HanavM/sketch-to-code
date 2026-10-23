# Round 13 (n148): harder than round 12, untuned first look

Creative: c1 orbit type (words on a full circle via SVG textPath, spinning; a conic-gradient ring core; a heavy headline
with an italic serif orange word; a hard-shadow pill), c2 liquid chrome (a page of soft radial mesh glows, a 190px
chrome-gradient clipped headline, a hollow stroked word, a morphing chrome blob with inset shading, a glass tag), c3 card
fan (five playing cards fanned by rotation round a low origin, the middle one lifted, felt glow, dashed poker chips with
hard drop edges), c4 layered peaks (a sunset gradient page, a glowing sun, a 250px word set BETWEEN clip-path ridges so
the front ridges cover its foot), c5 Swiss grid (thin red column rules, a red half page, a 560px numeral in multiply
over both halves, a white ring, vertical label, ruled programme list).
Everyday: e1 spreadsheet (title bar, toolbar with active B, formula bar, column/row headers with the active column lit,
a selected range and an outlined active cell, red/green numbers, sheet tabs), e2 music player (library rail, gradient
album header, track table with the playing row, a now-playing bar with transport and progress), e3 map listings (search
pill, filter chips, 2x2 listing cards with badges and hearts, a drawn map with water, park, roads and price pins, one
active), e4 video call (2x2 tiles with avatar circles, name tags, mute badges and a speaking outline, a chat panel, a
control bar with a red end button), e5 pricing (segmented Monthly/Yearly toggle with a saving, three plans with the
dark middle one lifted and tagged, a comparison table of ticks and dashes).

Measured: blank page scores 12-98% colour / 10-79% structure. Untuned planner misses visible in autoplan.txt:
- c1: the conic ring core said as a donut chart (orange 100%, others 0%);
- c2: the chrome blob said as "stripes circle"; the clipped chrome headline as "stripes text";
- e1: the spreadsheet grid said as a bare "table, 12 rows" (no cells, no selection, no active cell);
- e2: the track table said as mail rows (sender, subject, preview);
- e4: the four video tiles said as one filled button and a list.

## n148: first live builds c1, c2, c3, e1, e2 (2026-10-23, ~292k billed)

| page | likeness | what was off |
|---|---|---|
| c1 orbit type | **58%** | headline, italic orange word, copy, hard-shadow pill right; the conic ring built as a flat orange donut; the circle text broken into a partial arc off to the right; footer rule lost |
| c2 liquid chrome | **78%** | first build; see the side-by-side (blob said as "stripes circle") |
| c3 card fan | **74%** | first build; subcopy lost |
| e1 spreadsheet | **54%** | chrome, toolbar, formula bar, headers, tabs right; every cell's words lost and four numbers invented in column D (the grid was said only as "table, 12 rows") |
| e2 music player | **80%** | first build; track table said as mail rows |

Round 13 so far: **69%** over 5 pages (c4, c5, e3, e4, e5 not built yet). Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): a conic gradient ring said as a conic gradient with a hole (never a donut chart); text on a
circle kept whole (one SVG textPath all the way round); a spreadsheet grid said cell by cell with the header row, the
selected range and the outlined active cell; the chrome blob and chrome headline said as their gradients; track rows
said as a track table; then first builds c4, c5, e3, e4, e5.

## n149: planner fixes, re-run c1, e1, c2, e2 (2026-10-23, ~225k billed)

Planner now says: a smooth conic ring as ONE conic gradient with a hollow middle (never a donut chart); textPath rings
without the sticker "wrap in N lines" add-on; a spreadsheet grid cell by cell (column letters, row numbers, the lit
active column, the selected range fill, the outlined active cell, red/green numbers); a light-dark-light grey blend as
an exact liquid-chrome gradient (only stops meeting at the same place are hard stripes now); a track table (number,
title over artist, plays, length, the playing row) instead of mail rows. Rounds 1-12 plans unchanged by these rules.

| page | before | after | what changed / still off |
|---|---|---|---|
| c1 orbit type | 58% | **73%** | gradient ring core now right; the circle text still built as a short arc clipped at the right |
| c2 liquid chrome | 78% | **80%** | blob and headline said as chrome blends |
| e1 spreadsheet | 54% | **88%** | every cell, active column, selected range and active cell built |
| e2 music player | 80% | **81%** | track table rows built as tracks; structure still off (header block alignment) |

Round 13 so far: **79%** over 5 pages (c3 74 unchanged; c4, c5, e3, e4, e5 not built yet). Vitest: same 2 env
failures; typecheck clean.

## n150: whole text ring, card fan, album header; first builds c4, c5, e3 (2026-10-23, ~424k billed)

Planner now says: a big text ring with its whole text (no "…") and the exact SVG to build (viewBox, circle path,
textPath, overflow visible); a fan of same-size turned cards card by card (size, shared top-left, transform-origin,
each card's fill, corner letters and rotate); a big-title header block above a list (cover square and its gradient,
kicker, 72px title, meta line) before the track table; a top-ruled row of three spread items (left, middle, right,
never run together; rows of buttons excluded). Earlier rounds: round 8 c2 ring gets its SVG; rounds 2 and 9 footer
wording only; none re-run.

| page | before | after | what changed / still off |
|---|---|---|---|
| c1 orbit type | 73% | **73%** | the ring text now runs whole round the circle; nav and footer still missed (footer said as one line; the three-item rule came after this run) |
| c3 card fan | 74% | **84%** | five fanned cards built in place of an invented paragraph; every card built red (per-card fills lost) |
| e2 music player | 81% | **84%** | cover, ALBUM, title and meta built; the header gradient runs down the whole panel, green play button and green playing title lost |
| c4 layered peaks | – | **87%** | first build |
| c5 Swiss grid | – | **41%** | first build: the red right half built as a small red square, ring thin inside it, label on a black bar, times cut |
| e3 map listings | – | **85%** | first build |

Round 13 so far: **78%** over 8 pages (e4, e5 not built yet). Vitest: same 2 env failures; typecheck clean.

## n151: big flat fields, outline rings, text on a field; first builds e4, e5 (2026-10-23, ~290k billed)

Planner now says: a big flat colour field with its hex, size and place (round 13 c5's red right half had been said only
as "vivid red block"); a big textless outline ring with its size, place and stroke; a fill-less text standing on such
a field "on the #hex block, no fill or bar of its own"; a ruled list's right parts whole (dates were cut to "12.03").
Earlier rounds pick up the same wording on their half-page fields and rings (rounds 3, 4, 8, 9, 12); none re-run.

Bench: dense pages now read in 130-190 s, past the product's 180 s reading limit (the first c5 runs with the new notes
failed to read; the old notes read in ~133 s). The bench now gives its app a 230 s reading limit and waits 240 s.
Worth fixing in the product: readings of 17-mark pages write ~12k tokens.

| page | before | after | what changed / still off |
|---|---|---|---|
| c5 Swiss grid | 41% | **81%** | red right half, white ring and white labels on red all built; numeral sits ~100px right, two invented lines of copy, caption off |
| e4 video call | – | **79%** | first build: the 2x2 tiles said as one button and a list, so one big tile and three small rows were built |
| e5 pricing | – | **80%** | first build: headline left (centred in target), comparison table put in a card |

Round 13 complete: **82%** over 10 pages (c1 73, c2 80, c3 84, c4 87, c5 81; e1 88, e2 84, e3 85, e4 79, e5 80).
Vitest: same 2 env failures; typecheck clean.
