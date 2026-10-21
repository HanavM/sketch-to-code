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

## n62: row lead items, tab colours, near-white page (2026-10-21, ~79k tokens)

Planner fixes (free): a row of links whose first item is set apart (bold, bigger or another colour) says it first
("bold 17px green \"Budget 2027\" first, then links: ..."); a selected tab says its letter colour when the rest share
another; a wide filled bar says its colour ("pale grey bar"); a neutral near-white page (#fafafa, #f8fafc) is said
as off-white (white cards vanished on a white build). Rounds 1-4: 7 notes gain words, none lose any.

| page | before | after | tokens | what changed |
|---|---|---|---|---|
| e4 notification settings | 46% | **65%** | 51k | off-white page built, gap above the danger card kept |
| e5 spreadsheet | 61% | 59% (flat) | 28k | green title and green Q1 tab now right, no invented red "Over"; menu and formula bars built ~half their drawn height, so the grid sits high |

Side-by-sides: built/e4-settings-toggles-n62-cmp.png, built/e5-data-grid-n62-cmp.png.

## n63: bar heights and stat-card lines (2026-10-21, ~79k tokens)

Planner fixes (free): a full-width filled bar of links says its height ("pale grey bar 52px tall across the page"),
and so does the formula bar; a short info card's lines say a big figure's size ("big 44px bold") and a coloured
line's colour ("green"), and "all at the top of the card, empty below" when the content fills under 55% of a tall card.
Rounds 1-4: one note gains words (round 1 contact card "all at the top"); round 5: e1 top bar, e5 bars, c3/c5 cards, e2 peak.

| page | before | after | tokens | what changed |
|---|---|---|---|---|
| e5 spreadsheet | 59% | **87%** | 24k | menu, formula and tab bars built at their drawn height; grid sits where drawn, near-identical by eye |
| e2 heatmap analytics | 71% | 69% (flat) | 41k | "Peak hour" card now right (big figure at top, green delta); whole content column built ~10px low/right, title and filters regions just missed; table deltas coloured green/red (target plain) |

Side-by-sides: built/e5-data-grid-n63-cmp.png, built/e2-heatmap-analytics-n63-cmp.png.

## n61: planner fixes for the creative misses (free)

- c5: the conic progress ring is said as a ring ("140px progress ring: green arc 72% of the way round, bold \"72%\" in the
  middle"), not a near-black picture; the pull quote is quoted; the code card says its lines as set and which tokens are
  coloured (light pink keywords, bright green strings); the CTA says its heading, a full-width white button, "both at the
  bottom of the card"; the hero says soft colour glows and where (was "indigo to pink gradient").
- c2: "Weight" is said thin (hairline weight), "Slant" wide-spaced (display type from 0.1em); the badge is a spinning
  ring of letters round a 200px circle (drawn as a circle now); the marquee quotes its repeated copy.
- c3: the frosted header says "frosted glass bar 68px tall across the top, thin line under: bold \"Layer\" left, links right";
  the cards say "faded to 75/45/20% opacity".
- c4: the main photo's hard brown shadow (24px down right) and the page grain are said; the three pills are pill labels
  with their 2px border and bold copy (was "pill input" and "block").
- c1: the reel says its glows and "fading out into the page toward the bottom (solid until 55%)"; the nav says logo left,
  links right; the scrub track is a 36% orange progress bar.
- e1: the backdrop is "see-through dark navy layer (55% opaque) ... everything under it still shows, dimmed".
- Colours: "bright green" (#4ade80, was cyan) and "light pink" (#f472b6, was coral).
- Rounds 1-4: no mark kinds change. Notes change in 14 places, all richer: navs say logo left / links right, hard shadows say
  colour and offset, two blurred blobs say their fade, #f472b6 is light pink. Dry draw c1-c5, e1: all drawn, none failed.

## n65: first live builds of the round-5 creative pages (2026-10-21, ~450k tokens)

| page | likeness (v3) | what was off |
|---|---|---|
| c1 masked reel | 57% | all parts placed (outline AFTER, overlay DARK, play ring, scrub); glows built purple/blue-dominant, target is one big orange glow (background-size 200% enlarges them); scrub track built 6px, target 2px |
| c2 variable type | 56% then **72%** | the 28px red dot was said "big vivid red circle" and merged into the ring: built a 190px red disc. Fixed below |
| c3 scroll reveal | 74% | close first try |
| c4 outline stack | 52% then **58%** | both gradient photos kept the picture X as drawn lines; main photo lost its gradient (only its shadow kept). Fixed below. Still: the second "SUMMER" merged into the first (one line built), "Shop summer" link built as a dark pill button |
| c5 bento | 57% | near-identical content; hero's big "Prism 2" swapped with its subline, CTA tile lost its indigo gradient, tiles ~20% short; conic ring region just missed |
| e1 board modal | not built | budget per invocation stopped it |

Fixes:
- Planner: a textless circle under 60px is a "small Npx ... dot" (was "big ... circle"). Plan diffs: r3 two dots, r4 one, r5 c2.
- Scaffold: the two corner-to-corner strokes of a crossed picture box are dropped from the "keep these strokes" component
  (a lone diagonal stays). Codegen contract: the X only marks a picture, never build its lines; a note's look fills the box.

Side-by-sides: built/<id>-cmp.png (first build), built/<id>-n65-cmp.png (after the fixes).

## n66: repeated heading, underlined link, display title, one-hue gradient, lost strokes (2026-10-21, ~186k tokens)

Planner fixes (free): two headings with the same word say "the first/second of 2 separate stacked lines of the same word";
an `<a>` with only a bottom rule is "bold link ... with a 3px underline (no box, not a button)"; a titled card with a
display title says "huge 76px bold title, starting 40% down"; a gradient between two shades of one hue (indigo to deeper
indigo) is said ("indigo to darker indigo gradient block", was nothing). Rounds 1-4: 4 notes gain words (two mastheads,
one underlined link, one 3D plane title), no mark kinds change.

Pipeline fix: verification now fails when a scaffold's drawn stroke is no longer drawn in place. The first c4 re-run
(52%) built the main photo as a solid dark brown block: codegen made the hard shadow as a translate(24,24) copy of the
photo outline and dropped the outline itself, and every check passed. The repair message says to put the path back.

| page | before (n65) | after | tokens | what changed |
|---|---|---|---|---|
| c4 outline stack | 58% | 52%, then **65%** | 86k + ~50k | both "SUMMER" lines built, "Shop summer" an underlined link; photo gradient back (second run). Photo still paler than target (peach, target vivid orange) |
| c5 bento | 57% | **78%** | ~50k | "Prism 2" big over its subline, CTA indigo gradient, ring and tiles placed; near-identical by eye |

Side-by-sides: built/c4-outline-stack-n66-cmp.png (52%), built/c4-outline-stack-n66b-cmp.png, built/c5-bento-n66-cmp.png.
