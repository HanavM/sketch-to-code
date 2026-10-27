# Round 29 (n262): harder than round 28, untuned first look

Creative: c1 riso festival (a halftone-dot disc multiplied over an offset yellow disc, a dot-grain page, a misregistered
pink line in a stacked headline, a ruled date band, a notched tilted ticket with a hard offset shadow, a multiply star),
c2 brutal grid (a 4x3 hairline grid, a black vertical index set in writing-mode, a 420px solid numeral over a 420px
outlined one, a lime card, a tag turned 90° about its corner, a ruled mono work list, barcode stripes, a hard-shadow
button), c3 iso city (an isometric block: a diamond lot and road, three buildings each of three clip-path faces, trees,
clouds, frosted stat cards), c4 deco cinema (a repeating-conic sunburst, a double-line arch with an inner ::after arch,
gold clipped-gradient Didot type, a fan, gold column stripes, a hexagon-cut gradient button, two outlined show cards),
c5 deep sea (two blurred turned light beams, SVG wave layers, a dashed depth scale, a glowing jellyfish with ::after
tentacles, bubbles, a frosted depth card with a gradient progress bar).
Everyday (denser tools): e1 spreadsheet (title bar, toolbar, formula bar, a 10-column grid with selected column heads, a
selected range, a current cell, conditional colours, status chips, a comment with a pointer, an SVG bar chart with a
target line, sheet tabs), e2 Gantt (grouped task list with owner avatars, week grid with a shaded week, bracket group
bars, progress bars, diamond milestones, dependency wires, a Today line), e3 support inbox (app rail, ticket list with
tags and unread dots, chat bubbles, attachment, dashed internal note, typing dots, composer, customer panel with orders and
a satisfaction bar), e4 design tool (layers tree, phone frame with a gradient card under a selection box with handles,
size tag and guides, a named cursor, an inspector with a colour picker, hue slider, gradient stops and swatches), e5
trading desk (ticker bar, SVG candlesticks with volume and a moving average, price axis and last-price tag, order book
with depth bars and a depth chart, positions table, order form with a diamond-step slider).

## n262: first live builds of all ten (2026-10-27, ~0.92M billed, ~61 min run time)

| page | likeness | marks | words | draw s | read s | build s | tokens | what was off |
|---|---|---|---|---|---|---|---|---|
| c1 riso festival | 73% | 13 | 655 | 60 | 157 | 205 | 81k | halftone disc built over the yellow disc (offset lost), date-band rules lost, lineup set as a mixed-case grid, ticket notches lost, an invented sub-line |
| c2 brutal grid | **62%** | 18 | 550 | 72 | 115 | 383 | 108k | lime card said as 'code lines', built black with yellow mono text; vertical index built sideways and cut; tag turned 45° not 90° about its corner; button fill and hard shadow lost; invented lines over the work list |
| c3 iso city | **89%** | 10 | 854 | 48 | 59 | 213 | 69k | buildings, lot, trees right; clouds lost; a faint frame invented round the stage |
| c4 deco cinema | **90%** | 13 | 671 | 66 | 85 | 369 | 108k | gold type, button, columns right; sunburst built as a round glow, arch double line and inner arch lost, fan lost |
| c5 deep sea | 83% | 14 | 527 | 61 | 74 | 322 | 85k | light beams said as 'product-photo backdrops' (clear stop read black), built upright hard panels; waves flattened to bands; depth labels stacked at the top; jellyfish tentacles and card progress bar lost |
| e1 spreadsheet | 74% | 11 | 1,278 | 78 | 94 | 305 | 99k | grid, chart, comment near exact by eye; status chips lost (plain text), fill handle lost, tab underline lost; score held down by small column shifts |
| e2 Gantt | **93%** | 4 | 1,451 | 54 | 38 | 241 | 78k | near exact |
| e3 support inbox | **95%** | 4 | 1,770 | 64 | 44 | 255 | 83k | near exact |
| e4 design tool | **95%** | 4 | 1,281 | 54 | 54 | 345 | 101k | near exact (cursor tilt lost) |
| e5 trading desk | **89%** | 5 | 1,572 | 62 | 84 | 226 | 103k | candles said as 'a grid of thin lines, nothing inside' (the SVG unsaid), order book card said 'null (#000000)' |

Round 29 first look: **84%** over 10 (84.3; round 28 started at 82). Ease, first look: ~10 marks, ~1,060 words,
~62 s drawing, ~80 s to the reading, ~286 s build, ~92k tokens a page, 0.4 repair turns a page.

The everyday pages are now near solved on first try (93-95% on three of five); the creative ones are where the tools
still fail, mostly on how a block's FILL vs its INK is said, and on painted pseudo-parts (::after tentacles, inner arch).

## n262 planner fixes (each a rule, not a page patch; not yet re-run live)

- A filled turned card whose text is vertical (writing-mode) says so, and that a 180° turn reads it bottom to top (c2 index).
- A card whose heading is set in a non-mono face is not 'code lines' (c2 lime card).
- A blurred linear gradient fading to clear is a LIGHT BEAM: its exact background (clear stop said transparent, not black),
  blur, box before the turn, rotate() and hinge (c5 light rays).

Re-planned rounds 1-28: no notes change.

## Still open (next step)

c2 lime card and SAY HI button: fill vs ink (fill said as the text colour); side tag turn and hinge; e5 candle SVG unsaid
and 'null' card fill; c5 depth scale (absolute labels said as wrapped lines), jellyfish ::after tentacles, card progress
bar, waves; c4 arch double border and inner ::after arch, sunburst; c1 offset discs and ticket notches; e1 status chips.

## n263: planner fixes, re-run live (2026-10-27, ~295k billed)

| page | was | now | marks | words | draw s | read s | run s | tokens | what changed |
|---|---|---|---|---|---|---|---|---|---|
| c2 brutal grid | 62% | **81%** | 19 | 678 | 82 | 106 | 221 | 73k | lime card filled lime with dark text, black SAY HI button with lime letters and red hard shadow, NEW WORK tag a quarter turn about its corner, index reads bottom to top |
| c5 deep sea | 83% | **93%** | 14 | 852 | 94 | 151 | 538 | 132k | dashed depth scale with labels spread down it, jellyfish tentacles, three ringed bubbles, gradient progress bar in the depth card |

(c5 was also run once on the older notes: 86%, ~90k, light beams right from the n262 rule.)
Round 29 now **87%** (c1 73, c2 81, c3 89, c4 90, c5 93, e1 74, e2 93, e3 95, e4 95, e5 89).

Planner rules (each a rule, not a page patch):
- A filled block holding a heading plus its own loose copy names the block and says its fill and text ink apart (c2 lime card was said 'vivid yellow' and built black with yellow text).
- A filled text block 300px or narrower (a button) says its fill, ink, size, place and hard shadow (c2 SAY HI was said 'big heavy yellow').
- A quarter turn hinged on a corner says rotate(90deg), the hinge and the box before the turn (c2 tag was said 'diagonal').
- A narrow unfilled div with a left rule and short labels spread down it is a SCALE (c5 depth labels were said as wrapped lines).
- An empty ringed circle with a soft radial highlight is a BUBBLE (was 'pill input').
- A painted ::before/::after hanging out of its block is said with its box, gradient and mask (c5 tentacles).
- A progress bar whose fill is a gradient is now found and said inside its card (c5 depth bar).
Re-planned rounds 1-28: only round 21 c4's -90° numeral note gains its rotate() value.

Still open: c2 barcode fills its whole cell and the lime heading came out mono; c5 waves flat and the jellyfish a pill not a dome;
c4 arch double line, inner arch, sunburst; c1 offset discs and ticket notches; e5 candle SVG and 'null' card fill; e1 status chips.

## n264: planner fixes, re-run live (2026-10-27, ~284k billed)

| page | was | now | marks | words | draw s | run s | tokens | what changed |
|---|---|---|---|---|---|---|---|---|
| e5 trading desk | 89% | **95%** | 5 | 2,121 | 80 | 276 | 102k | candlesticks, volume bars and the moving-average line drawn (SVG handed over); timeframe tabs, price axis and last-price tag kept; order book no longer said 'null (#000000)' |
| e1 spreadsheet | 74% | 70% | 11 | ~1,330 | 79 | 300 | 85k + 97k | status chips now filled rounded pills (were plain text); first re-run 65% (chips made rows taller), second 70% with the chip height said; by eye closer than the 74% build, the layout part of the score (75%) is held down by small column shifts |

Round 29 now **87%** (87.4: c1 73, c2 81, c3 89, c4 90, c5 93, e1 70, e2 93, e3 95, e4 95, e5 95).

Planner rules (each a rule, not a page patch):
- A pane painted as a line grid that holds words or a drawing keeps them: the grid is said as its background only (the r29 e5 candle pane was said 'a grid, nothing inside', throwing away tabs, candles and axis).
- A chart drawing inside a pane (12+ rects/lines, 8+ filled bars, no text, up to 5,000 characters) is one of its parts, its SVG copied verbatim at its place.
- An unfilled stacked-area chart card says it has no fill (was 'null (#000000)').
- A spreadsheet cell whose words sit in a filled rounded span is a status CHIP: fill, rounding, padding, size and exact height, so the row keeps its height.
Re-planned rounds 1-28: no notes change.

Still open: e5 order form (segmented Buy/Sell, boxed inputs, diamond slider simplified) and ticker labels overlapping; e1 tab underline and sum box; c4 arch double line, inner arch, sunburst; c1 offset discs and ticket notches; c2 barcode and mono lime heading; c5 waves and jellyfish dome.

## n265: planner fixes, re-run live (2026-10-27, ~424k billed)

| page | was | now | marks | words | draw s | run s | tokens | what changed |
|---|---|---|---|---|---|---|---|---|
| c1 riso festival | 73% | **92%** | 13 | 742 | 64 | 199 | 59k | yellow disc at its own offset place under the halftone disc, ruled date band, lineup one capitals paragraph with pink stars in place, ticket notched both sides (mask clips the shadow, as in the target) |
| c4 deco cinema | 90% | **95%**, then **96%** | 13 | ~850 | 69, 71 | 519, 393 | 128k, 104k | sunburst fans up from the bottom middle, arch double gold line and inner ::after arch, half-disc gold fan; second run: show cards filled (columns no longer show through) with outlined SCREEN tags |
| e5 trading desk | 95% | 93% | 5 | ~2,150 | 78 | 382 | 133k | order form now right by eye (segmented Buy/Sell, boxed inputs, five diamond steps); score down on a lighter page fill and small layout shifts |

Round 29 now **90%** (89.7: c1 92, c2 81, c3 89, c4 96, c5 93, e1 70, e2 93, e3 95, e4 95, e5 93).

Planner rules (each a rule, not a page patch):
- A see-through flat disc 200px+ says its own box and place, apart from a disc it overlaps (c1 yellow disc was 'big vivid yellow circle').
- A text block with thick rules above and below is a RULED BAND: both rules, its full width and box (c1 date band).
- Running text whose inline spans differ only in colour is ONE paragraph that wraps, said line by line, capitals kept (c1 lineup was measured as boxes and built mixed-case in a grid). Not for <br> lines, mono, or big type.
- Round notches cut by a radial-gradient mask are said: each bite, its side, the exact mask and that it clips the shadow (c1 ticket).
- An outlined nav pill is not a 'selected underline' and stays on one line (c1 Get tickets wrapped, underlined).
- A conic sunburst says where its rays meet (c4: bottom middle, built as a round glow at the top) and square corners; a half-disc fan says round top, flat bottom; FAINT only when a painted stop is faint.
- An arch says its own border (double line) and an unfilled ::after outline inside it (c4 inner arch).
- A card said only by '<colour> border "words"' says its box, opaque fill and outlined tags (c4 show cards).
- A small form said as 'button "Buy Sell"' plus a list, with 2-3 empty bordered input boxes, goes part by part (e5 order form).
Re-planned rounds 1-28: r16 c3 hours row now said ruled above and below with double lines; r23 e4 order form part by part; r24 e5 delivery options part by part; outlined nav pills one line, no underline (r18 c1, r25 e4, r26 c3, r28 e4); r25 c5 price badge no longer called faint; sunburst notes say no outline (r16, r19, r24). None re-run.

Still open: e1 spreadsheet layout shifts (70); c2 barcode and mono lime heading (81); c3 clouds and invented frame (89); e5 slider track line and page fill.

## n266: planner fixes, re-run live (2026-10-27, ~173k billed)

| page | was | now | marks | words | draw s | run s | tokens | what changed |
|---|---|---|---|---|---|---|---|---|
| e1 spreadsheet | 70% | **83%** | 11 | ~1,620 | 89 | 269 | 86k | every column at its own width (Region wide, number columns narrow, the last column wide), so column edges, numbers and chips line up with the target; comment card lost its shadow |
| c2 brutal grid | 81% | **85%** | 18 | ~735 | 83 | 211 | 87k | barcode its own 260x220 block inset in its cell (was filling the cell), lime card heading heavy Helvetica on two lines over bold mono copy, work list bold with 2px rules |

Round 29 now **91%** (91.4: c1 92, c2 85, c3 89, c4 96, c5 93, e1 83, e2 93, e3 95, e4 95, e5 93).

Planner rules (each a rule, not a page patch):
- A spreadsheet grid whose columns differ in width says each column's exact width (table-layout fixed, colgroup); it was said as '9 equal columns about 170px'.
- An empty block painted only with repeating stripes, said with no size, says its own box and place and that it does not fill its cell (c2 barcode).
- A filled block's heading over loose copy says the heading's own size, weight and face when it differs from the copy's, and its <br> line breaks; the copy says its weight and face (c2 lime card heading was built mono, one line).
- A ruled index list says bold and its rule width (c2 list was said 1px regular for 2px bold).
- Giant type of 300px+ placed absolutely says its tight line-height and letter-spacing, so the letters sit at the top of their box (c2 numerals sat about 40px low; planned, not re-run).
Re-planned rounds 1-28: tight line-height on giant numerals r2, r3, r4, r5, r8, r12, r13, r16, r20, r21, r26; stripe boxes r14, r16, r25, r28; heading faces r1, r20, r27; ruled list r13. None re-run.

Still open: c2 numerals sit low and NEW WORK tag text small (85); c3 clouds and invented frame (89); e1 comment card shadow and sheet tab pill (83); e5 slider track line.
