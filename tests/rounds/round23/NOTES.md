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

## n234: chat rail, list badges, composer; invoice settings cards (2026-10-26, ~194k billed)

- e3 chat threads **74 → 87%** (colour 99, structure 96, layout 77; regions 10/11, message-2 missed). Planner:
  - a narrow column of like filled square tiles, each with a letter or sign, is now a RAIL OF TILES said tile by tile
    (fill, ink, rounding, gap, first-tile inset); it was a "bar of words" and the tiles were lost. Only rails whose
    tiles all hold text (icon-only rails keep the old "small rounded squares" wording).
  - a thumbnail list row with a filled count pill at its right no longer reads the count as the line under the name
    (previews "Priya: final copy..." were lost, "4" and "12" set as sublines); the pill is said at the far right and a
    ::after presence dot on a thumb is said with its ring.
  - a bordered list head is a search field (size, fill, border, rounding, inset) with its placeholder.
  - a bordered text field with one small filled corner child says its box and the send button's place; a flex line with
    ::before/::after rules says them as a day divider. Composer and send button built; the invented extra message gone.
- e5 invoice editor **74 → 83%** (colour 99, structure 90, layout 92; regions 4/4). Result cards:
  - cards of different heights each say their own (all were said 270px, activity card cut off);
  - a bordered box holding words is a field-box part (selects built bordered);
  - a toggle track says its ::after knob and which end it sits at; a ringed swatch says its box-shadow;
  - a text part with a ::before dot and ::after stem says both (timeline dots built) and its text x after padding.
  - Still off: the top bar's Preview and Download PDF built as bare words (unbordered), Draft pill fill lost.
- Re-planned rounds 1-22: only r9 e3 composer and r12 e3 rail change.
- Round 23: **87%** over 10 (86.8). Vitest same 2 env failures (1459); typecheck clean.

## n235: CRT screen bezel, scanline veil, status panel (2026-10-26, ~144k billed)

- c5 CRT terminal **84 → 93%** (colour 100, structure 98, layout 80; regions 7/9). Planner:
  - a big rounded radial-gradient block ringed by box-shadow spreads is a framed SCREEN said with its exact background
    and box-shadow (bezel rings and the inset glow); it was "dark navy to black gradient block", built a flat navy box
    with no bezel, rounding or glow.
  - see-through stripes keep their alpha (rgba 0.4, was "#000000", built opaque), and a big veil of them is said with its
    own box and rounding, laid over what it covers (was "overlapping the upper left of the screen").
  - a bordered box whose filled child is a full-width strip at its TOP is no longer the "message box with a send button
    in its bottom-right corner"; a panel topped by a title strip with segmented meter bars is said part by part (title
    strip, each label and each bar with its 8px-on/2px-off stripes).
- Pipeline (scaffold.ts wordsGiveCss): one sized div said with its exact box-shadow or repeating stripes, and a titled
  meter panel, skip the drawn-outline component: in the first run (81) the scanline outline was mounted as a green slab
  over the screen. Unit test added.
- Re-planned rounds 1-22: only r10 c3 scanlines change; live r10 c3 92 → 95 (kept; round 10 stays 88).
- Still off: knobs built small and orange (target 44px olive grey), footer ~10px high.
- Round 23: **88%** over 10 (87.8). Vitest same 2 env failures (1460); typecheck clean.

## n236: shard collage button, gold glow, shifted line; trading desk volume, order book, tabs (2026-10-26, ~204k billed)

- c1 shard collage **83 → 91%** (colour 100, structure 97, layout 79; regions 9/10, nav missed). Planner:
  - a short filled button cut by a 3-6 corner clip-path says its box, place and the polygon verbatim (built square);
  - a single radial-gradient cut-out says its exact CSS (the gold shard was a vague 'soft yellow to amber', built as a pale linear fade);
  - a left-aligned display line set further right than the first says where it starts ('& KEPT' 260px in, built flush);
  - a small vertical label turned 180deg says so (read top-down); rounds 3, 4, 9, 16 labels gain it;
  - a wrapped loose text run keeps its whole copy and wraps at its block's width (the caption was cut at 70 letters and its tail said as a 'first bold' run).
- e4 trading desk **83 → 90%** (colour 98, structure 85, layout 89). Planner:
  - bars in two colours in no fixed turn say each bar's colour and the see-through alpha (volume said as 31 bright green bars);
    r10 e4 volume changes the same way (not re-run);
  - a panel of price rows with right-anchored ::before depth bars is an ORDER BOOK said row by row (columns, inks, bar width and rgba fill), with its mid price line;
  - a tab row above a table is said before it, with the active tab's inset underline.
  - Still off: the pair header was built over the timeframes (run noise, its note unchanged); order form fields built as bare lines.
- Round 23: **89%** over 10 (89.3). Vitest same 2 env failures; typecheck clean.

## n237: top-bar buttons and pill, signup field button, nav lead face, faint grain (2026-10-26, ~357k billed)

- e5 invoice editor **83 → 84%** (colour 99, structure 91, layout 92). Planner:
  - a top bar whose note listed its boxed buttons and filled pill as bare `lines` ("Draft", "Preview", "Download PDF")
    is now said part by part (the Draft pill fill and both outlined buttons built right);
  - a filled bar part that also has a border of another colour says that border (an outlined white button).
  - result-card words are quoted up to 40 letters ('Created from quote Q-0391' was cut at 20 and built with an invented number).
  - First run 80 (bar right, stamp and invented activity line off), second 84 kept. Still off: company name lines lost, stamp built filled.
- c3 orbit badge **84 → 91%** (colour 99, structure 97, layout 84). Planner:
  - a one-line field whose only child is a filled worded button at its right end is said as a FIELD with its pill
    shape, shadow, placeholder and the solid button inside (Subscribe was built as bare grey words);
  - a nav lead in its own face says italic and serif ('Orbit' italic Georgia built upright sans);
  - a contour/grain texture keeps its faint alpha (3% ink said as 'transparent').
  - Still off: circular text built small and repeated.
- Re-planned rounds 1-22: r14 e4, r15 e2, r19 e3 top bars and r15 card words change. Live r15 e2 90 → 93, r19 e3 85 → 90.
- Round 23: **90%** over 10 (90.1). Vitest same 2 env failures; typecheck clean.
