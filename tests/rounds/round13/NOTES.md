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
