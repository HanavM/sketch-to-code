# Round 23 (n232): harder than round 22, untuned first look

Creative: c1 shard collage (three clip-path polygon shards, one striped and multiplied and drifting, a tape strip, a
vertical label, a difference-blend headline with an italic serif second line, hollow outlined number, a slanted
clip-path button), c2 folding cube (a spinning six-faced CSS 3D cube in perspective with a dashed orbit ring and floor
shadow, gradient-clipped headline words, a stats row), c3 orbit badge (a conic-gradient ring cut to a donut, circular
text on an SVG path spinning round a core disc, grain overlay, a pill signup field, tilted mono tag), c4 bento grid (a
dark grid of seven mixed tiles: gradient hero number with a glossy orb, a toggle, bars with one highlighted, avatar
stack, an SVG area chart, a light code tile, a conic tile with a ring score), c5 CRT terminal (a rounded bezel screen
with scanlines and inner glow, ASCII logo, glowing output lines with a yellow warning and blinking cursor, a status
panel with dashed bars, an F-key menu, knobs).
Everyday (denser tools): e1 design tool (toolbar, layers tree with selected row, dot-grid canvas, frame with selection
handles and a size badge, a collaborator cursor, properties panel), e2 flight search (search bar, filters with
checkboxes and range sliders, sort tabs, four result cards with route lines and stop dots, a BEST badge), e3 chat
threads (workspace rail, conversation list with unread counts and online dots, messages with reactions, a file card,
own bubble, thread side panel), e4 trading desk (ticker, pair header, candlestick chart over a grid with volume bars,
price axis and last-price line, order book with depth bars, open orders table, buy/sell order form), e5 invoice editor
(an invoice paper with parties, meta strip, line items with an edited cell, totals and a tilted UNPAID stamp; a
settings column with toggles, colour swatches and an activity timeline).

Measured: blank page scores 4-96% colour / 6-71% structure. Dry run drew c1 (14 marks).

## n232: first live builds of all ten (2026-10-26, ~931k billed, 59.9 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 shard collage | 83% | shards, tape, blend headline, hollow 09 right; nav missed as a region (spread wider), button lost its slanted cut |
| c2 folding cube | **91%** | headline, buttons, ring, shadow right; cube built as flat stacked face slabs (no perspective turn), stats as boxed cards |
| c3 orbit badge | 84% | ring, circular text, core, tag right; signup button lost its dark fill, nav missed, grain lost |
| c4 bento grid | **92%** | all seven tiles; orb a hard white disc (soft radial lost), toggle and avatar stack lost |
| c5 CRT terminal | 84% | ASCII, output, menu right; bezel and its glow lost (screen flat navy), status panel bars lost, scanlines lost |
| e1 design tool | 28% | panels, frame, shape, cursor right; the dot-grid canvas built as a grey-to-black gradient (blank page here already scores 89% colour, so this costs most), selection handles, avatar, selected layer lost |
| e2 flight search | **91%** | near-identical; Search button moved left, route stop dots lost |
| e3 chat threads | 74% | list, messages, thread right; workspace rail tiles lost, day divider and file card mis-placed, an invented extra message |
| e4 trading desk | 78% | ticker, header, book, table, form right; candlesticks lost (chart empty), volume bars bright, axis and last-price line missed, positions tabs lost |
| e5 invoice editor | 74% | paper, table, edited cell, stamp right; activity dots and toggles' knobs lost, selects unbordered, meta strip unboxed |

Round 23: **78%** over 10 (78.0; round 22 started at 75 untuned). Vitest: same 2 env failures (1459 tests); typecheck clean.

Worst gaps, next: e1 a radial-gradient dot grid is a dot pattern on a flat fill (never a gradient wash); selection
handles and the selected tree row; e4 candles drawn by script must be said as built parts (the reading only saw an
empty chart); c5 a rounded bezel with ring box-shadows and an inset glow, repeating-line scanlines; e3 a rail of tiles.

## n233: design tool canvas, layers and selection; trading chart candles (2026-10-26, ~254k billed)

- e1 design tool **28 → 90%** (colour 100, structure 98, layout 79; regions 11/12, zoom chip missed). Three gaps closed in
  the planner:
  - the canvas `radial-gradient(#c8c8c8 1px, #0000 1px)` tiled at 20px was said as a "#c8c8c8 to #000000" wash (the
    see-through stop read as black) and built grey-to-black. A radial gradient tiled by a small px background-size is now
    a DOT-GRID canvas: flat fill, dot colour and size, spacing and the exact CSS.
  - the layers tree fell back to a loose word list (two section heads, Layers and Assets, and the flex "◆ name" rows
    broke the tree check), so the order scrambled and the selected row was lost. A tree may now hold section heads
    between its rows (said in place with their rule), and a leading glyph span is read on its row's line.
  - a block with small square handles on its corners now says its selection outline and each handle's page place
    (run after the whole-note passes, which used to overwrite it).
  - the tree tail "a trailing letter (M, U) stays..." is said only when a row has one (it invented "Product shot M").
- e4 trading desk **78 → 83%** (colour 96, structure 77, layout 78). The candles were drawn by a script into an untagged
  layer, so the reading saw an empty grid. Script-drawn candlesticks over a chart block are now said candle by candle
  (page x, pitch, wick and body y, up/down colour): all 31 built. Still off: volume bars all green and too bright,
  timeframes and price axis missed as regions, order book depth bars and the positions tabs lost.
- Re-planned rounds 1-22: only r11 e1 explorer changes (the M/U tail dropped, it had no such row).
- Round 23: **85%** over 10 (84.6). Vitest same 2 env failures (1459); typecheck clean.
