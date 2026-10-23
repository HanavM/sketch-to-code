# Round 12 (n145): harder than round 11, untuned first look

Creative: c1 isometric city (a grid plane turned rotateX(60) rotateZ(-45) with four towers lifted by translateZ, a
gradient-clipped headline, a glass chip, a tilted marquee ticker, a star-dot field), c2 blend poster (a 330px word in
mix-blend-mode: difference over a red disc and a tilted blue bar, vertical side label, a dashed spinning ring), c3 aurora
glass (a spinning conic-gradient aurora blurred 90px, grain, a thin headline with an italic serif word, a gradient-border
pill, three backdrop-blur glass cards with the middle one lifted), c4 diagonal split (two clip-path polygon panels, a
520px hollow outlined "09" across both, an uppercase headline, a rotated round sticker, an animated scroll hint), c5
halftone magazine (a serif masthead over a 6px rule, a halftone dot photo and a blue leaf shape in multiply blend, an
italic serif headline, two-column body with a drop cap, a tilted hard-shadow sticker).
Everyday: e1 design tool (toolbar with active tool and avatars, layers tree with a selected layer, canvas frame with a
selected button, corner handles and a size badge, a properties panel of X/Y/W/H fields, fill and stroke swatches), e2
Gantt timeline (Day/Week/Month segmented control, grouped task list with owner dots, week columns, bars, a progress bar,
a milestone diamond, a dependency hook, a Today line), e3 team chat (workspace rail, channel sidebar with unread
badges, messages with a mention chip, reactions, a code block and a thread link, a composer with a format bar, a thread
pane), e4 checkout (breadcrumb steps, focused field, a checkbox, a segmented Ship/Pick up/Locker control, floating-label
fields in 1/2/3 columns, an order summary with quantity badges, a discount field and totals), e5 users admin (side nav,
filter chips, a dark bulk-action bar, a table with selected rows, status pills, an expanded detail row, pagination).

Measured: blank page scores 15-98% colour / 11-74% structure. Dry draw: all 10 drawn through the overlay, no failures,
untouched pages score 0-7%.

Planner fix needed to plan the round (free): e5's filter chips matched the filter-panel detector with no checkbox row
and crashed the planner; a panel with no checkbox row is no longer a filter panel. No earlier page changes.

Untuned planner misses (autoplan.txt):
- c1: the isometric plane said as a "3D cube" whose four faces are #000000 (the towers' colours live on their child
  <i>, the plane's own fill and grid lines unsaid);
- c3: the conic aurora said as "a 900px donut chart, cyan 100%"; the glass cards said as three plain stats (no glass,
  no border, no blur, no lifted middle card); the italic serif "listens" unsaid;
- e1: the canvas said as loose lines (frame, gradient hero, selected button, handles all lost);
- e3: the @mention chip and reactions said "under" the message instead of inside / below it in a row.

## n145: terminal said line by line; round 12 written; first live builds c1, c2, c3 (2026-10-23, ~332k billed)

Planner: a `pre` block of several lines inside a region said part by part is ONE part, said line by line with its
coloured words in place, its line height and padding (round 11 e1's terminal output was collapsed into one run with its
✓/✗ marks placed apart, and came out scrambled). Rounds 1-11 re-planned: only round 11 e1 changes.

| page | likeness (v3) | billed | what was off |
|---|---|---|---|
| r11 e1 code editor (re-run) | 92 -> **95%** | ~101k | terminal output line by line with green/red marks, file tree in order, blue status bar: all right |
| c1 isometric city | 87% | ~80k | headline, chip, glow, ticker right; the isometric plane and towers built as one flat black polygon (no grid, no colours); ticker words invented. The score flatters it |
| c2 blend poster | 58% | ~72k | difference blend works (word inverts over disc and bar); the headline ~100px low and the blue bar runs through the copy |
| c3 aurora glass | 64% | ~79k | headline, copy, pill right; the aurora built as a teal rectangle (read as a donut chart), glass cards lost to plain stats, italic serif word upright |

Round 12 so far: **70%** over 3 pages (c1 87, c2 58, c3 64). Round 11 final: **83%** (e1 kept at 95).
Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): an isometric plane said as its CSS (size, fill, grid, the turn) with each tower's lift and
colour read from its child; a conic gradient said as a conic gradient (blurred, spinning), never a donut chart; glass
cards said as cards (fill alpha, border, backdrop blur, lifted middle); an italic serif word inside a heading; check why
c2's headline sits low. Then first builds c4, c5, e1-e5.
