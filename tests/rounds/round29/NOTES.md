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
