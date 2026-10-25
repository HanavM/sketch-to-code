# Round 22 (n224): harder than round 21, untuned first look

Creative: c1 split blend (a page split in two tones with a giant headline in difference blend, letters knocked off the
baseline, rotated and italic, a floating blob, a nav in difference blend), c2 isometric town (a CSS 3D isometric ground
with three towers built from top and side faces, a road, drifting clouds, floating labels), c3 glass aurora (frosted
glass cards and a glass pill nav with backdrop blur over three blurred, hue-shifting colour blobs and a grain overlay,
two tilted cards), c4 brutal spread (a ticker bar, a greyscale photo block under a multiplied, tilted orange block, a
giant masthead with an italic serif second word, a two-column article with a drop cap and text wrapped round a circle,
a rotated stamp), c5 riso halftone (two halftone dot screens, one a circle, one tilted, in multiply, misregistered
two-ink type, a yellow highlighter bar, dashed schedule rules, a multiplied star).
Everyday (denser apps): e1 kanban (two swimlanes, four columns, labelled cards with avatars, a WIP limit over its
count, a dashed drop zone, a tilted card being dragged), e2 product page (thumbnails, a gallery with a CSS-drawn
product, dots, price with strike and badge, swatches, a size grid with sold-out sizes struck through, rating bars),
e3 week calendar (mini month with this week shaded, day heads with today circled, an all-day bar, hour grid,
overlapping events side by side, a now line), e4 code editor (activity bar, file tree with git colours, tabs,
breadcrumbs, syntax-coloured code with line numbers and a current line, minimap, terminal with pass and fail lines,
status bar), e5 spreadsheet (title bar, rounded toolbar, formula bar, a frozen header row and first column, 26px rows,
conditional red and green fills, a total row, a selected range with its fill handle, sheet tabs).

Measured: blank page scores 15-97% colour / 16-71% structure. Dry run drew c1 (13 marks), untouched 2% likeness.

## n224: first live builds of all ten (2026-10-25, ~790k billed, 49.7 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 split blend | **89%** | split, difference-blend headline with its knocked letters, blob right; the nav's left half lost (blend over cream) |
| c2 isometric | **87%** | 3D ground, towers, road, labels right; the two clouds built as small nav buttons, cloud drift lost |
| c3 glass aurora | 77% | blobs, glass hero and tilted stat card right; nav built as a solid white pill, the app chip's glass card lost, heading set wider |
| c4 brutal spread | 80% | ticker, photo, masthead, stamp right; issue number "44" put inside the orange block (not multiplied), article one column, circle wrap lost |
| c5 riso halftone | 64% | dot screens and colours right; the pink circle screen built square, headline far too big and its pink offset lost, star lost |
| e1 kanban | 79% | lanes, columns, WIP count, drop zone, tilted card right; engineering lane label missed as a region, card labels thinner |
| e2 product page | 56% | buy box near-exact; the CSS-drawn shoe (a ::after shape) lost, thumbnails lost, gallery tinted, rating bars collapsed to one |
| e3 week calendar | **89%** | near-identical; the build threw "SubText is not defined" once (bench counts the page failed, picture still scored) |
| e4 code editor | 86% | tree, code, terminal, status bar right; syntax colours and activity-bar icons lost, minimap built as an outline list |
| e5 spreadsheet | 47% | toolbar, formula bar, tabs right; rows built ~50px tall (target 26), selection a blurry glass block, conditional fills lost |

Round 22: **75%** over 10 (round 21 started at 71 untuned). Vitest: same 2 env failures (1459 tests); typecheck clean.

Worst gaps, next: e5 a dense grid keeps its exact row height and its cell fills, and a selection is a 2px outline with a
pale fill (never glass); e2 shapes drawn by ::before/::after are said as shapes; c5 a halftone screen cut to a circle
keeps its circle, misregistered type says its offset shadow.

## n225: spreadsheet and product page (2026-10-25, ~216k billed)

- e5 spreadsheet **47 → 88%** (colour 100, structure 94, layout 97, all 6 regions). The planner took column A's 220px
  for every column and never said row height was fixed, so the build stretched rows to ~50px; the total row's 2px top
  rule read as "H8 selected"; cell fills were only said for whole rows; the selection (an rgba-tinted bordered box)
  read as "frosted glass". Now a div-grid sheet says each column's width, 26px rows that never stretch and where the
  grid ends, header and row-number inks, right/left alignment, the frozen rules, the total rule and every filled cell;
  a selected cell needs an outline or a thick border on all four sides; a selection box over a div grid says the cells
  it covers and its pale fill (never glass) and the handle's overhang.
- e2 product page **56 → 89%** (colour 99, structure 95, layout 89). The ::after shoe inside the gradient tile was
  said as "plain paint only"; now the tile says the shape (size, place, radius, turn, shadow) and its radial paint.
  Empty cards say their exact fill and the one with an outline; stacked like bars say each bar's fill (78/14/5/2/1%)
  and the big score beside them. Gallery dots still missed as a region.
- Re-planned rounds 1-21: r5 e5 (sheet words) and r16 e1 (selection handle overhang) change. Live r5 e5 86 (was 87:
  run noise, structure 95 vs 97; old run kept).
- Round 22: **83%** over 10 (82.8). Vitest same 2 env failures; typecheck clean.
