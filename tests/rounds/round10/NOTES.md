# Round 10 (n134): harder than round 9, untuned first look

Creative: c1 extruded checker (two 230px words extruded by eight stacked hard text-shadows plus a stroke, over a
repeating-conic checkerboard floor, a spinning clip-path star, a tilted tag, a hard-shadow ticket card), c2 skewed panels
(three full-height clip-path gradient panels overlapping at a slant, a 380px difference-blend circle across two of them,
numbered giant words per panel), c3 CRT terminal (a glowing bordered window with title-bar dots, a 120px glowing mono
headline with a blinking block cursor, log lines with OK chips, a box-drawing ASCII frame, scanlines over everything),
c4 Bauhaus tiles (an 8 x 6 grid of 48 tiles: quarter circles, half discs, circles, triangles, stripes and squares in
five colours, under a bordered title panel), c5 arch blend (a gradient arch picture with a sun, a 150px serif headline
crossing it in difference blend, a vertical rule, a spinning outlined badge, an underlined link).
Everyday: e1 video call (3 x 2 gradient tiles with avatars, name chips, mute dots and an active-speaker outline, round
control buttons with a red Leave pill, a white chat side panel), e2 pull-request diff (title, Open pill, tabs with count
chips, file tree, a unified diff with red/green rows and two line-number columns, an inline review comment), e3 music
playlist (black nav, gradient header with cover and 72px title, play/heart actions, a track table with the playing row,
a player bar with controls, progress and volume), e4 trading desk (ticker bar, 25 candles with wicks over grid lines,
volume bars, an order book with depth bars, buy and sell forms), e5 onboarding wizard (a dark stepper rail with done
checks and connectors, two-column fields, radio cards, a dashed drop zone, a toggle, Back/Continue footer).

Measured: blank page scores 5-97% colour / 7-73% structure. Dry draw: all 10 drawn through the overlay, no failures;
untouched pages score 0-15% likeness (c4's grid is what a blank page half-matches).

Tool fix found by this round (free): the planner crashed on e3 (a progress bar with no label beside it, under icon
buttons, was read as a usage meter with no text). A bar with no label is no longer a meter. No other rule changed.

Untuned planner misses (autoplan.txt):
- c1: the extrusion (stacked text-shadows + stroke) unsaid; the checker floor read as a "near-black to pale yellow
  gradient"; the star's "JUN 12" text dropped.
- c2: panels, blend circle and words all said; the "01 /" mono numbers have no note.
- c3: the headline read as a "picture with BOOT_" (glow, size, cursor and its blink lost); log lines, OK chips and the
  ASCII frame have no note; the scanlines' transparent band said as "null"; the window's title bar unsaid.
- c4: the whole 48-tile grid has NO note (one plain box); the title panel's red second line unsaid.
- c5: nearly all said; the sun's colour named pink.
- e1: tiles said only as a list (gradients, avatars, mute dots, active outline lost); the control bar read as a picture.
- e2: the diff (rows, colours, line numbers) and the PR header have no note; "Files changed" taken as a search field.
- e3: the player bar read as a picture; the track table says only its header and the playing row.
- e4: the candles are only "repeating stripes" (25 candles lost); bids side, depth bars and both order forms dropped.
- e5: the form region (fields, labels, toggle) is never drawn; stepper connectors unsaid.

## n134: first live builds c1, c3, c4 (2026-10-23, ~185k billed, untuned planner)

| page | likeness (v3) | what was off |
|---|---|---|
| c1 extruded checker | 40% | words, star, tag and card placed right; no extrusion (flat letters), the checkerboard became a grey gradient band, star text lost, CTA became a link |
| c3 crt terminal | 87% | dark page and buttons right, so the score flatters it: the glowing BOOT headline became a tiny box, the log lines and ASCII frame were replaced by invented paragraphs, no title bar, no glow, pill buttons |
| c4 bauhaus tiles | 27% | the 48-tile shape grid is missing entirely (a white bordered panel fills the page); headline one line, not red |

Round 10 so far: **51%** over 3 pages, the lowest first look since round 2: everything the planner leaves unsaid is
dropped, as before. Also: c3 shows likeness v3 rewards a dark page with the right palette even when its content is
wrong; worth a content check for dark pages. Next (planner, free first): a tile grid said tile by tile (shape kind,
colour, rotation), extruded type as stacked hard shadows, a checker floor as conic squares, a glowing mono headline with
a block cursor, terminal log lines and box-drawing frames as live text; then re-run c1, c3, c4 and first builds of
c2, c5 and the five everyday pages.

## n136: planner says tile grids, extrusion, checker floors, terminal parts (2026-10-23, ~329k billed)

Planner (free): a gap-free grid of 12+ text-free shape tiles is said tile by tile (quarter circle and which corner,
half-disc dome, inset circle, up-triangle, stripes, square, empty; hex each); stacked hard text-shadows are said as an
extrusion with every step, plus a text stroke when the note doesn't already say outline; a repeating-conic floor is a
checkerboard with both hexes and the square size; a big mono line with a solid empty child is live text with its glow
and a blinking block cursor; <br> lines ending in filled chips are said line by line; white-space: pre box-drawing
text is quoted line by line; a window's title bar (ring dots, rule, title) is added to its box note; clear stripe bands
say "clear" instead of "null". Rounds 1-9 re-planned: no change (the seat map and hollow words were caught and guarded).

| page | before | now | what was off |
|---|---|---|---|
| c4 bauhaus tiles | 27% | **93%** | all 48 tiles built in one turn (35k); title's red second line still unsaid |
| c1 extruded checker | 40% | **87%** | extrusion and checkerboard right; no text stroke, star text and pink CTA button lost |
| c3 crt terminal | 87% (flattered) | **82%** | real content now (headline+cursor, log lines with OK chips, ASCII frame, title bar); window built full-page not inset, buttons pills, dark box behind headline |
| c2 skewed panels | — | **31%** | first build: the three slanted gradient panels never showed (page left near-black); notes say no corners or place |
| c5 arch blend | — | **81%** | first build: most parts right; arch gradient missing |

Round 10 so far: **75%** over the 5 creative pages (everyday not built yet). Next: say a slanted cut-out panel's corners
in page px and its place (c2), an inset window's size and place, square buttons on a mono page, then first builds of
the five everyday pages.

## n137: planner says gradient panel corners, labels over big words, coloured heading lines, button cards, inset windows (2026-10-23, ~248k billed)

Planner (free): a gradient cut-out now says its corners in page px, its box and clip-path against that box, and that it
sits absolute behind the words (full page height when it is); a small label just above a 40px+ heading is said with its
size, face, colour, spacing and place (c2 "01 /", round 1 c5 "ESSAY"); a card heading broken into lines says each line's
colour (c4 red "fun."); a short card line that is itself a filled button says its fill, size, corners and border (c1 pink
"Get tickets →"); a bordered button with square corners says so; a window with a title bar inset from the page edges says
its size and top-left. Rounds 1-9 re-planned: only round 1 (c5 ESSAY label moved into the headline note, e-page "BROWSE
PLANTS" square corners), not re-run.

| page | before | now | what was off |
|---|---|---|---|
| c2 skewed panels | 31% | **90%** | all three slanted gradient panels, labels and blend circle right; RUN built smaller, SWIM larger |
| c3 crt terminal | 82% | **92%** | window inset, square buttons; dark box still behind the glowing headline |
| c1 extruded checker | 87% | **90%** | pink square CTA right; star text "JUN 12" and the letter stroke still lost |
| c4 bauhaus tiles | 93% | **94%** | red second line right |
| c5 arch blend | 81% | 81% | not re-run (arch gradient missing) |

Round 10 creative pages: **89%** average (was 75). Next: first builds of the five everyday pages (video call, PR diff,
playlist, trading desk, onboarding wizard), then c5's arch gradient and c1's star text.

## n138: weak regions said part by part; first builds of the five everyday pages (2026-10-23, ~447k billed)

Planner (free): one general rule instead of five page-specific ones. Every region now carries its parts: each painted
or worded element inside it (and its own loose text lines), with page-px size and top-left, fill / gradient / border
(dashed, which sides) / outline or inset ring / rounding / opacity, and text with size, weight (regular said for 20px+),
face and colour. A region is said part by part when the other rules leave it weak (no note, "picture with" one word, a
bare word list, a field name, a chart said only as stripes), when its note quotes under 60% of its own words (the rest
would be dropped or invented), or when it is a frame whose own fields are drawn nowhere (e5 form: a no-fill box).
Rounds 1-9 re-planned: 23 notes on 12 pages gain parts (r2 shop cards, r1 blog posts, r6 calendar hours, r7 minimap...),
none re-run.

| page | likeness (v3) | what was off |
|---|---|---|
| e1 video call | **86%** | tiles, avatars, name chips, mute dots, active outline, round controls and Leave pill all right; chat panel built as an inset rounded card, input lost |
| e2 pr diff | **70%** | header, tabs, file tree, every diff row and the comment right; title built bold over "#4127" (re-run with "regular" said: 68%, title fixed but comment copy invented; first kept) |
| e3 playlist | 73% then **82%** | first build had 2 of 7 nav items and only the playing track; the under-60% rule added them: all tracks and nav in; inset rounded panels lost |
| e4 trading desk | **96%** | 25 candles, depth bars, both order forms right; panel borders lost, volume bars all green |
| e5 wizard | **87%** | the whole form (fields, plan cards, drop zone, toggle) now built; stepper checks and connectors, radio circles lost |

Round 10 complete: **87%** over all 10 (creative 91 90 92 94 81; everyday 86 70 82 96 87). Untuned everyday first
builds averaged 84%, against 48% for round 9's untuned everyday first builds. Next: c5 arch gradient, c1 star text,
e2 card border and invented comment copy, e5 stepper checks; then write round 11.

## n139: arch, words on a shape, letter stroke, steppers, radio corners, whole card lines (2026-10-23, ~185k billed)

Planner (free): an arch says its exact box, place and top corners as one plain CSS block with its gradient written out
(not an SVG traced from the ink); short words laid over the middle of a textless shape are said on that shape, upright
(c1 star "JUN 12"), unless another note already says them; the letter stroke is said even when the note mentions an
outline elsewhere; a vertical stepper is said step by step (marker fill, ring, glyph, title, sub-line, connector line and
colour); option cards with a radio circle in a corner say each circle and which ring is the chosen one; an info card's
lines are quoted whole up to 110 characters (e2 comment copy was cut, then invented). Rounds 1-9 re-planned: only round 4's
two arches gain the box note, not re-run.

| page | before | now | what was off |
|---|---|---|---|
| c5 arch blend | 81% | **86%** | smooth arch with the full gradient; badge text set round the ring, index type serif |
| e2 pr diff | 70% | **79%** | title regular, comment copy exact; title still runs into "#4127" |
| c1 extruded checker | 90% | 89% | star text and letter stroke now right; same within run noise (kept: content is right) |
| e5 wizard | 87% | 76% (not kept) | stepper checks, green connectors and radio circles all right, but the form built ~15px low and taller, so layout scored worse; first build kept |

Round 10: **88%** over all 10 (creative 89 90 92 94 86; everyday 86 79 82 96 87). Next: write round 11, harder than 10.
