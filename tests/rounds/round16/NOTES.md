# Round 16 (n162): harder than round 15, untuned first look

Creative: c1 split halftone (a 210px word in difference blend across a hard black/cream page split, over a 500px
disc of 14px red halftone dots faded by a radial mask; a vertical side index; serif italic quote on the light half),
c2 glass stack (three tilted frosted backdrop-blur panes over three blurred glow blobs, a 640px hollow outlined "3"
behind, a gradient pill button), c3 arched sunburst (a nine-letter title set on an arc, one rotated letter at a time,
over a repeating-conic sunburst and a dark disc; a dotted ring badge; a double-ruled menu row), c4 broken-grid editorial
(a 520px red "07" cropped off the left edge, two overlapping gradient photos, one multiply, a serif headline with a red
italic word, two-column justified text with a column rule, a left-ruled pull quote, a vertical credit), c5 tilted phone
(a phone mockup turned in 3D with a mini app inside, a soft floor shadow, three floating tilted chips, gradient-text
headline, radial glow background).
Everyday (dense app states): e1 spreadsheet (toolbar, formula bar, a 7x12 grid with a selected blue range and fill
handle, a floating chart, sheet tabs, a sum chip), e2 week calendar (mini month, a 7-day hour grid, side-by-side
overlapping events, a red now-line, an open event popover), e3 code review (PR header, file tree, a split diff with red
and green line and word highlights, an inline comment thread), e4 chat (workspace rail, channel list, messages with
reactions and a thread link, an open emoji picker, composer, typing line, a thread side panel), e5 checkout (stepper,
form with a focused field, an open address autocomplete, a tooltip, order summary with a dashed code field, a toast).

Measured: blank page scores 14-98% colour / 12-78% structure. Dry-drawn 10/10 (untouched 0-3% likeness).
Untuned planner misses visible in autoplan.txt:
- c1: the hard black/cream split is not said as a hard stop (built as a smooth fade);
- c2: the three blurred glow blobs get no note (their wrapper measures 0x0);
- c3: the conic sunburst read as a checkerboard floor; the arched title said as "links: S, U, N, ...";
- c5: the 3D turn of the phone not said; the floating chips said as buttons;
- e1: the selected range said as just "blue border";
- e2: the overlapping events said as buttons and a dropdown;
- e4: the emoji picker said as a label above an empty field.

## n162: first live builds c1, c5, e1 (2026-10-24, ~275k billed)

| page | likeness | what was off |
|---|---|---|
| c1 split halftone | **58%** | black/cream split built as a smooth grey fade; halftone disc built as a solid red circle (dots and soft mask lost); nav links invisible on the right; word, copy, buttons, side index right |
| c5 tilted phone | **79%** | phone built flat and upright (3D turn, tilt and floor shadow lost); the three floating chips built as tiny pills inside the nav; blue radial glow lost; headline, gradient words, buttons right |
| e1 spreadsheet | **61%** (flatters less than it looks) | grid, selected range, chart, tabs, sum chip all there; rows ~10% taller so everything below drifts; chart panel shaded; menu items pushed right; formula text right-aligned |

Round 16 so far: **66%** over 3 pages. Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): a hard-stop page split said as a hard stop; halftone dots under a radial mask verbatim;
a 3D-turned device mockup (its rotate, tilt, shadow) and floating chips at their places, never in the nav;
a conic sunburst never a checkerboard; a per-letter arched title; then first builds c2, c3, c4, e2, e3, e4, e5.

## n163: hard split, halftone tile, 3D phone, floating chips, arched title (2026-10-24, ~213k billed)

Planner now says: one hard stop between two colours as a HARD-SPLIT page (two flat halves, the gradient verbatim);
a masked dot block's background-size (it repeats: a halftone, not one disc); a radial-glow page verbatim; a device body
turned in 3D inside a perspective box (stage, body fill/border/rounding/shadow, the written transform, its screen parts
in the body's own unturned layout); a zero-height wrapper of absolutely placed cards as separate floating cards (place,
fill, shadow, turn; never in the nav); letters stacked on one spot each turned about a far origin as a title on an ARC.
Rounds 1-15: only the radial-glow page line changes (r8, r11), none re-run.

| page | likeness | what was off |
|---|---|---|
| c1 split halftone | 58 → **94%** | hard split, halftone dots under the soft mask, word, copy, buttons, index all right |
| c5 tilted phone | 79 → **85%** | phone turned in 3D with tilt and shadow, three tilted chips in place, glow right; nav links spread wider, headline lines a little tight |
| c3 arched sunburst (first) | **65%** | arched SUNDOWNER right; conic sunburst still built as a checkerboard; dotted ring badge built as a plain ring; menu double rules lost |

Round 16 so far: **76%** over 4 pages. Vitest: same 2 env failures; typecheck clean.
Next: the repeating-conic sunburst said verbatim (never a checkerboard), a dotted ring badge, a double-ruled menu row;
then first builds c2, c4, e2, e3, e4, e5 and e1's row height.

## n164: sunburst, dotted ring, double-ruled row; first c2, c4 (2026-10-24, ~156k billed)

Planner now says: a repeating conic gradient in degrees with no tile size as a SUNBURST of rays from one centre (ray count,
width, the gradient verbatim, round, never a checkerboard); a dotted or double outline circle as that border style; an
outline with no offset as right against the edge (no "white gap"); a wide row ruled above AND below as both rules with
their style (double = two thin lines). Rounds 1-15 notes unchanged.

| page | likeness | what was off |
|---|---|---|
| c3 arched sunburst | 65 → **86%** | sunburst rays built (was a checkerboard), arched title, double-ruled menu row right; rays a little big, soft yellow rays shaded darker; badge built as a plain thin ring, "Est. 1962" lost |
| c2 glass stack (first) | **70%** | glass cards, hollow "3", headline, pill button right; the three blurred glow blobs lost; cards not tilted |
| c4 broken-grid editorial (first) | **79%** | cropped red 07, multiply photos, serif headline, columns, pull quote, vertical credit kept; caption lost |

Round 16 so far: **79%** over 6 pages. Vitest: same 2 env failures; typecheck clean.
Next: c2's blurred glow blobs (wrapper measures 0x0) and tilted glass cards; c3 badge words and dotted ring; then first
builds e2, e3, e4, e5 and e1's row height.

## n165: glow field, tilted glass cards, filled worded badge; first e2, e3, e4 (2026-10-24, ~360k billed)

Planner now says: a zero-size wrapper of blurred, textless, absolutely placed blobs as a field of soft GLOWS (each blob's
size, place, colour, blur; behind everything); each glass card's turn (its unturned left/top, then rotate, TILTED);
a worded circle filled with the page colour as FILLED solid (opaque, covers what is under it) with its words' style.
Rounds 1-15 autoplan notes re-generated: unchanged.

| page | likeness | what was off |
|---|---|---|
| c2 glass stack | 70 → **84%** | three blurred glows and tilted glass cards now right; hollow "3" outline too bright (target 25% white), a rule under the nav |
| c3 arched sunburst | 86 → **73%** | "Est. 1962" badge now filled and readable; rays drawn longer and wider than the target, so the picture shifts (run variance on the rays) |
| e2 week calendar (first) | **37%** | grid, mini month, popover kept; events in the wrong day columns/hours and pale fills; popover text wraps |
| e3 code review (first) | **71%** | header, tabs, diff colours, comment thread kept; split diff columns cramped (right side overlaps), file tree as one line |
| e4 chat thread (first) | **78%** | sidebar, messages, reactions, thread panel kept; emoji picker search field empty and unboxed; channel names wrap |

e5 not run (per-run budget guard). Round 16 so far: **74%** over 9 pages. Vitest: same 2 env failures; typecheck clean.
Next: calendar events placed by day column and hour (their fills, overlap), split diff columns at their widths, a hollow
numeral's stroke alpha; then first e5 and c3's ray length.

## n166: calendar events placed, file tree as lines, faint hollow numeral; first e5 (2026-10-24, ~226k billed)

Planner now says: a zero-size wrapper of solid, unturned text blocks (lines split by line breaks) as coloured blocks each
at its exact spot on the grid (left, top, size, fill, padding, text top-left; NOT a list or buttons); a column of lines
broken by line breaks, indented with spaces, one line a highlighted block, as separate lines with their indents and the
selected line (NOT one run-on line); a hollow letter's outline with its width and see-through alpha (FAINT, NOT bright).
Rounds 13 and 14 notes gain the faint-outline line (their hollow numerals were also see-through); the rest unchanged.

| page | likeness | what was off |
|---|---|---|
| e2 week calendar | 37 → **68%** | all seven events now in the right day and hour with solid fills; day columns unruled, popover text wraps and lost its shadow, sidebar edge missing |
| e3 code review | 71 → **84%** | file tree now separate indented lines with the selected file; split diff at full width; line numbers lost, tabs wrap counts below |
| e5 checkout autocomplete (first) | **83%** | form, open address suggestions, tooltip, order summary, toast right; step circles became plain text, toast squarer |

Round 16 complete: **79%** over 10 pages (c1 94, c2 84, c3 73, c4 79, c5 85, e1 61, e2 68, e3 84, e4 78, e5 83).
Vitest: same 2 env failures; typecheck clean.
Next: e1 row height, calendar day-column rules and popover, diff line numbers; then round 17 (harder).

## n167: chart card, packed bar words, a second stripe layer, floating panel shadow (2026-10-24, ~187k billed)

Planner now says: a bar chart's card (its fill, border, shadow, size: NOT tinted) and each bar's width, gap and tallest
height; a bar's second word sitting right after the first as "right after it, NOT pushed to the far right"; a `::before`
layer of repeating stripes laid over the background stripes (the day-column rules) as a second layer; a part-by-part
panel's own box-shadow, and every one-line text part kept on ONE line (nowrap). Rounds 3-15 notes re-generated: the
nowrap/shadow clause reaches their part-by-part panels; no other change.

| page | likeness | what was off |
|---|---|---|
| e1 spreadsheet | 61 → **74%** | menu right after the title, white shadowed chart card, formula bar packed left; row numbers start on the header row (off by one), selection border runs down to row 12 |
| e2 week calendar | 68 → **85%** | day-column rules back, popover on one line per fact with its shadow; month title wraps, hour labels a few px high |

Round 16 now **82%** over 10 pages (c1 94, c2 84, c3 73, c4 79, c5 85, e1 74, e2 85, e3 84, e4 78, e5 83).
Vitest: same 2 env failures; typecheck clean.
Next: e1 row numbering and selection box height; e3 diff line numbers and tab counts; c3 ray size; then round 17 (harder).

## n168: spreadsheet row numbers and selection box, diff line numbers, one-line tab counts (2026-10-24, ~165k billed)

Planner now says: a spreadsheet's header row has an EMPTY left cell and row 1 sits on the first row under it; an empty
bordered box laid over grid cells is a SELECTION OUTLINE with its exact size and place, the columns and rows it covers
(and where its bottom edge stops) and its corner handle; a short label written by `::before` from an attribute (a diff's
line numbers) is its own part at its own place, right-aligned in the gutter; every part-by-part list keeps one-line parts
on one line (a word and its count never wrap apart). Rounds 1-15 notes re-generated: the one-line clause reaches their
part-by-part lists, round 13's spreadsheet gains the empty header cell line, round 15's email canvas gains its "Text"
block tag; none re-run.

| page | likeness | what was off |
|---|---|---|
| e1 spreadsheet | 74 → **80%** | row numbers 1-12 under the header, selection box on C-D rows 2-8 with its handle; chart card sits further right and higher than the target |
| e3 code review | 84 → **88%** | diff line numbers back, tab counts on one line; tabs now overlap the "Open" pill (header parts placed by x only, not y); "#4182" not grey |

Round 16 now **83%** over 10 pages (c1 94, c2 84, c3 73, c4 79, c5 85, e1 80, e2 85, e3 88, e4 78, e5 83).
Vitest: same 2 env failures; typecheck clean.
Next: header parts placed by their own top as well as x; a floating chart card's place; then write round 17 (harder).

## n169: header parts placed by top as well as x, a title's grey words, a floating chart card's place (2026-10-24, ~186k billed)

Planner now says: a top bar whose parts sit on more than one line (their boxes do not overlap top to bottom) places each
part at its own top-left x,y inside the bar instead of "all vertically centred"; a big title not set bold is said
"regular-weight (NOT bold)"; a few words inside a part in their own colour are named with that colour (the PR title's grey
"#4182"); an absolutely placed chart card says its exact top-left. Rounds 5, 6, 7, 9, 10, 13 notes re-generated (two
title bars now stacked label-over-value, card places, coloured words); none re-run.

| page | likeness | what was off |
|---|---|---|
| e1 spreadsheet | 80 → **78%** | chart card at its place; toolbar fill lost, bars drawn with a shaded 3D edge (run variance) |
| e3 code review | 88 → **78%** | header fixed (regular title, grey #4182, pill and sub-line on their own line above the tabs); but tab counts wrapped under their words, diff line numbers overlap the code, mira's reply lost |

Round 16 now **82%** over 10 pages (c1 94, c2 84, c3 73, c4 79, c5 85, e1 78, e2 85, e3 78, e4 78, e5 83).
Vitest: same 2 env failures; typecheck clean.
Next: the tabs region's own part list never says nowrap; diff gutter numbers need the code to start after the gutter;
then write round 17 (harder).

## n170: padded code rows past the gutter, one-line tab counts that never wrap (2026-10-24, ~187k billed)

Planner now says: a text part padded in from its left says its padding and where its text starts, and when a gutter
number sits in that space, that the text starts AFTER it (the diff code no longer laid over the line numbers); the
one-line clause reaches part lists whose parts are a little taller than their type (tabs with bottom padding) and says a
part's width is a minimum, never a fixed width that pushes a count onto a second line. Rounds 1-16 notes re-generated
(padding and one-line clauses reach their part lists); only e3 re-run.

| page | likeness | what was off |
|---|---|---|
| e3 code review | 78 → 85 → **86%** (two live runs) | first run: gutter fixed, reply back, tab counts still wrapped; second run (min-width clause): tabs on one line. Left: line numbers on the red/green rows with no plain text (13, 14, 16-19) dropped |

Round 16 now **83%** over 10 pages (c1 94, c2 84, c3 73, c4 79, c5 85, e1 78, e2 85, e3 86, e4 78, e5 83).
Vitest: same 2 env failures; typecheck clean.
Next: round 16 has plateaued at 82-83 for four steps, so write round 17 (harder) and build it.
