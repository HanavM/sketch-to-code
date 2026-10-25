# Round 21 (n208): harder than round 20, untuned first look

Creative: c1 kinetic type (three full-bleed marquee rows moving in opposite directions, one solid, one outline-only
text stroke, one lime; a spinning text-path badge round a dot; a counter), c2 depth stack (four cards stacked in a 3D
perspective scene with translateZ layers, an eight-step extruded serif headline, a floating lit orb, a floor shadow),
c3 mask reveal (a conic gradient clipped into giant type, a circular clip-path window of diagonal stripes, a duotone
clip-path shard in multiply with a sun inside, a grid faded out by mask-image, a CSS border triangle), c4 swiss orbit
(a ruled 3-column Swiss grid, a giant numeral rotated 90 degrees bleeding off the left, a red disc inside a spinning
orbit ring with three dots, a vertical label, staggered bar lines), c5 neon grid (a sun cut into stripes by a mask, a
perspective neon floor grid, a chrome gradient title with glow, a flickering neon script, a glowing outline button,
scanlines).
Everyday (denser apps): e1 mail client (folder sidebar with labels, search bar, message list with tabs, unread rows and
a selected row, reading pane with attachments and reply buttons), e2 analytics (header with range picker, filter chips,
four KPI tiles with sparklines, a two-series line chart with area fill, a donut with legend, a top-pages table with
share bars), e3 gantt (header with a segmented view switch, grouped task list, week columns, progress-filled bars,
dependency elbows, milestone diamonds, a today line), e4 music player (nav and library cards, album view with gradient
hero, controls and track list with a playing row, player bar with scrubber and volume), e5 team settings (settings
sidebar, tabs with a count, members table with role selects and a pending pill, toggle rows, a danger zone).

Measured: blank page scores 14-97% colour / 4-72% structure. Dry run drew all 10, untouched pages 0-3% likeness.

## n208: first live builds of all ten (2026-10-25, ~734k billed, 47.7 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 kinetic type | **89%** | three marquee rows, outline row, badge, CTA right; lime built as amber-yellow, the counter's big "214" lost (one mono paragraph) |
| c2 depth stack | 51% | 3D card stack, extruded headline and orb right; copy, button and tags pulled up under the headline (their own y lost), floor shadow lost |
| c3 mask reveal | 46% | gradient type right (but linear, not conic); circle window built square, shard un-clipped and solid blue, the mask-faded grid became a black box over the caption, the border triangle a black box |
| c4 swiss orbit | 48% | title, meta, red disc, ring, vertical label, columns right; the giant "07" NOT rotated, the two vertical grid rules lost, rules thick, orbit dots lost, bar lines one black block |
| c5 neon grid | 77% | floor grid, chrome title, nav, score right; the sun's stripe mask lost, title and script left-set (target centred), button glow lost |
| e1 mail client | 76% | three panes, list, reading pane right; Compose button lost, labels heading moved to the top of the folders, attachment previews grey |
| e2 analytics | 86% | near-identical; range picker lost its box, chart card a little taller |
| e3 gantt | 75% | bars, today line, milestones, dependency elbows right; task names clipped under their colour dots, finished-part shading inverted (pale), week heads centred |
| e4 music player | 79% | hero, track list, player bar right; library thumbnails grey (one kept), pills moved to the bottom, track title/artist merged on one line, transport buttons bunched |
| e5 team settings | 81% | all six regions right |

Round 21: **71%** over 10 (round 20 started at 75 untuned): the creative half is clearly harder (c2-c4 under 52).
Bench: "failed: 0", all 10 built and scored. Vitest: same 2 env failures; typecheck clean.

Worst gaps, next: shapes made by clipping or masking (clip-path circle and polygon, mask-image fades and stripe cuts,
border triangles) are said as those shapes, never as plain boxes; a rotated giant numeral says its rotation; thin
full-height grid rules are said (and stay 1px); parts placed down the page keep their own y instead of stacking under
the headline; a centred title is said as centred.

## n209: shapes made by cutting, a quarter-turned numeral, ring dots, the page's own hairlines (2026-10-25, ~265k billed)

Planner (words only, one new pass that reads facts the main pass skipped): a block cut by clip-path circle() is said as a
CIRCLE window with its paint; a textless block cut by clip-path polygon() says the polygon verbatim, its gradient, its
blend and its ::after layer; a zero-size box drawn only by its borders is said as a solid TRIANGLE with its point, size
and exact borders; a block whose background is two 1px gradients on a tile is said as a GRID OF THIN LINES with its mask
fade; big words turned a quarter (rotate ±90deg) say the turn, the origin and the box before and after (no longer
"diagonal"); a ring with small round children says its thin border and each dot; unmarked hairline rules straight on the
page (round 21 c4 grid lines, round 4 c-page column rules) are said in the whole-page note. Notes already handling a cut,
a tilt or a 3D plane are left alone (round 4, 7, 12, 14, 17 shapes and floors unchanged). Re-planned rounds 1-21: only
round 4 (its page rules) and round 21 change.

| page | before | after | what changed |
|---|---|---|---|
| c3 mask reveal | 46% | **86%** | striped circle window round, faded line grid right (layout 96); the shard still built un-clipped with no amber sun, the triangle a red box, an invented "NOW" kicker |
| c4 swiss orbit | 48% | **66%** | "07" turned and bleeding off the left, both full-height hairlines, thin ring with its three dots; horizontal rules drawn thick and wavy (sketch line kept), disc given a dark outline, bar lines on a grey slab, meta and the two rules missed as regions (layout 71) |

Round 21: **77%** (was 71). Vitest same 2 env failures (1456 tests); typecheck clean.
Next: the shard and triangle are still built from the drawn shape component (clip and point lost): say the drawn strokes
are only the outline; c4 rules said as 1px divs, never the drawn line; disc with no outline; c2 parts keep their own y.
