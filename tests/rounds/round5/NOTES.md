# Round 5 (n58): harder than round 4, untuned first look

Creative: c1 masked reel (drifting multi-glow gradient faded out by a mask, hollow outline "AFTER" over
overlay-blend "DARK", play ring, scrub track), c2 variable type (one family at thin / heavy italic / wide-spaced,
spinning circular-text badge, scrolling marquee bar), c3 scroll reveal (frosted sticky header, four gradient cards
staggered down and fading in, last one bleeding off the edge), c4 outline stack (giant hollow "SUMMER" twice
bleeding both edges, tilted photo with hard shadow, multiply-blend photo, grain, three tilted pills), c5 bento
(asymmetric tiles: glow hero, big stat, conic progress ring, quote, bar chart, code card, gradient CTA).
Everyday: e1 kanban board dimmed under a "New task" modal, e2 heatmap analytics (7x12 shaded grid, filters,
table), e3 3-pane team chat with thread, e4 notification settings (tabs, toggle rows, danger zone, toast),
e5 spreadsheet (formula bar, 8x24 grid, selected cell, sheet tabs).

Measured: blank page scores 17-98% colour / 17-82% structure; dry draw likeness 0-6% (all 10 drawn, none failed).
Effects read off the targets: c4 9 techniques, c1 5; variable weight and masks are not yet among the 17.

Untuned planner misses (to fix next, rounds 1-4 plans must not change):
- e3: the whole messages pane is dropped (a container holding the composer mark, only a right border, so it is
  skipped as a wrapper), with all its copy.
- e5: the grid note is a dump: every cell quoted in one run, column/row headers read as "pale grey button"s;
  the selected cell and formula bar ("D4", "=SUM(B4:C4)") unsaid.
- e2: the heatmap's 7x12 shaded cells are unsaid (only the day labels); active filter and table columns vague.
- e4: toggle on/off states and sub-lines unsaid; danger card copy and red "Mute all" button unsaid.
- e1: backdrop said as a solid dark navy block (it is a 55% dim over the board).
- c5: conic ring (72%) said as "near-black block"; quote and code copy garbled or missing; CTA called "cards".
- c2: thin weight of "Weight" and wide spacing of "Slant" (0.13em) unsaid; circular spinning badge unsaid;
  marquee copy unquoted.
- c3: frosted header has no note; card fade (opacity .75/.45/.2) unsaid.
- c4: hard shadow on the main photo and grain unsaid; bordered pill said as "pill input".
- c1: the mask fade at the bottom and the scrub track's orange fill unsaid.

## n59: planner fixes for the everyday misses (free)

- e3: chat messages read as their own structure (avatar, bold name, time, message, reaction chip, "3 replies");
  the messages pane is now drawn and said even though its composer is a mark of its own; the thread pane too.
- e5: spreadsheet grid said as one: column letters, row numbers, cell size, each used row by cell, empty rows,
  selected cell (D4, blue outline); the formula bar says the name box and the formula.
- e2: heatmap said as rows of 0-9 strengths of one colour; div-row table said with every row; active filter said.
- e4: toggle rows say name, sub-line and on/off; danger card says its red title, grey line and red button;
  the selected tab is said.
- Rounds 1-4: only two notes change, both additions (round 2 e3 and round 4 e5 say their selected tab).
- Still open: c1-c5 creative misses above, e1 backdrop dim.

## n60: first live builds of the everyday pages (2026-10-21, ~150k tokens)

| page | likeness (v3) | tokens | what was off |
|---|---|---|---|
| e2 heatmap analytics | 71% | ~47k | near-identical; "Peak hour" card content centred down instead of top; title/filters regions just missed |
| e3 team chat | 77% then **83%** | ~40k, 33k | first build drew the workspace rail as a crossed-out X and invented channels ("3 more"); fixed below |
| e4 notification settings | 46% | 31k | near-identical by eye (toggles, danger card, toast all right); rows a little taller, white not off-white page; score low for how close it looks |
| e5 spreadsheet | 61% | 31k | grid, formula bar, selected D4, sheet tabs all right; green "Budget 2027" title and green Q1 tab built black, header row tint lost, a red "Over" invented |

Side-by-sides: built/<id>-cmp.png (e3 after the fix: built/e3-team-chat-fix-cmp.png).

Fixes (planner, rounds 1-4 plans only gain list items):
- A filled block holding only small textless tiles (icons) is said as a block with its tiles ("dark plum block (no picture),
  3 small rounded squares (40px) stacked down from its top 14px apart: first white, the rest faint white"), not a picture.
- Lists of up to 8 short items are said in full (was 4 + "N more", which codegen filled with invented items).
- Colours "dark plum" (#3f0e40, was "deep purple", built indigo) and "dark brown" (#431407, was "near-black").
