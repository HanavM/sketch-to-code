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

## n210: words that give the exact CSS shape beat the drawn outline (2026-10-25, ~170k billed)

Pipeline (scaffold): below the trace rung, a drawn shape whose words already give it as an exact CSS construction
(a `clip-path: polygon/circle(...)`, a CSS border triangle, a rule "exactly 1px thick", a sized box with
border-radius 50%, plain bars "not strokes" with sizes) no longer gets a "the user's strokes, keep them" outline
component: the build makes it from the words. Before, the outline won (the shard an unclipped box, the triangle a box,
the rules thick and wavy, the disc outlined, bar lines on a grey slab). Unit tests added (scaffold.test.ts).

| page | before | after | what changed |
|---|---|---|---|
| c3 mask reveal | 86% | **90%** | shard cut slanted with its amber sun, triangle a real triangle (effects 100%); an invented nav row, the CTA rule thick |
| c4 swiss orbit | 66% | **74%** | rules 1px and straight, bars plain, ring and dots right; the disc still from a drawn component (slight shade), meta missed as a region |

Round 21: **78%** (was 77). Vitest same 2 env failures (1459 tests); typecheck clean.
Next: c2 depth stack (51) parts keep their own y; c4 disc still a drawn component; c3 invented nav row.

## n211: parts that keep their own y, the soft floor shadow, both shadow offsets (2026-10-25, ~130k billed)

Planner (words only): a short run of small absolute parts in one left column (copy, a button, tags) under a lead, with
one gap far bigger than the rest, says each part's exact page top-left and the empty space above it (round 21 c2: copy,
button and tags had been pulled up under the headline); a textless ellipse painted by a radial gradient that fades to
transparent is said as a SOFT floor shadow with its size, place and gradient (c2: no note had said it, so it was lost);
a hard shadow whose two offsets differ says both (c2 button "0 12px 0" had been said "offset 0px down left").
Re-planned rounds 1-21: the own-y words reach round 5 c4, 9 c1, 12 c5, 16 c1, 21 c1/c2 only (app panes, tables and lanes
are left out by the rule); the shadow wording changes round 4 c1, 15 c4, 18 c3, 21 c2. No marks changed.

| page | before | after | what changed |
|---|---|---|---|
| c2 depth stack | 51% | **86%** | copy, button and tags at their own y, floor shadow back, 3D stack right; tags outlined (target filled white pills) |

A first run scored 85% with the left column right but the 3D stack built as one flat gradient panel (codegen variance;
its notes are unchanged), kept as c2-depth-stack-n211a-cmp.png; the second run is kept.
Round 21: **81%** (was 78). Vitest same 2 env failures (1459 tests); typecheck clean.
Next: c4 swiss orbit (74) disc still a drawn component and meta missed; c5 neon grid (77) stripe-cut sun, centred title.

## n212: a stripe-cut mask, centred display words and signs, a button's own edge and glow (2026-10-25, ~81k billed for c5)

Planner (words only): a mask with a repeating-linear-gradient stripe layer is said as hard STRIPES (how many, below
which %, the mask verbatim and its mask-composite) instead of a fade (round 21 c5's sun had a solid top layer plus a
stripe layer; the top layer's single stop read it as "fading out"); a one-line display word of 100px or more centred on
the page says CENTRED with where its letters run (c5 "NIGHTDRIVE" was only said for multi-word 40-99px lines); a neon
sign centred in a wide box says CENTRED with its letters' x span, not the box's "top-left at 0,480"; a filled bordered
button says its own coloured border and its glow verbatim (c5 "PLAY NOW": cyan edge and halo lost), and an outline
button its glow. Re-planned rounds 1-21: centring reaches round 4 c2, 12 c3, 13 c4, 16 c1, 17 c3 headlines; glow round
14 c5 and 17 c3 buttons; border round 7 c4 labels; stripe wording round 17 c3. No marks changed.

| page | before | after | what changed |
|---|---|---|---|
| c5 neon grid | 77% | **84%** | sun cut into stripes below its middle, title and "the new album" centred, button edge and glow back (effects 100%, mask kept); the title's pink glow lost, the page's purple band at the horizon lost, title box a little right |

Next: c5 title drop-shadow glow and the page gradient's middle stop; c4 disc still from a drawn component, column heads'
letter-spacing; c2 tags filled pills.

Check of c2 depth stack (notes unchanged since n211, ~87k billed): n211 recorded c2 at 86%, but its kept run record
scores **65%** on the v3 measure (colour 93, structure 77, layout 88; the stack sits ~170px left of the target,
over the headline). A fresh run scored 41%: the same left-shifted stack plus an invented dark slab behind it (kept as
c2-depth-stack-n212-cmp.png; the 65% run stays the kept build). Round 21 corrected: **80%** over 10 (89, 65, 90, 74,
84, 76, 86, 75, 79, 81), not the 81 written after n211 (which used 86 for c2).
Next for c2: the 3D stack's own page x (it is built ~170px left, over the headline) and no slab behind it.

## n213: 3D faces keep their own place inside the group (2026-10-25, ~70k billed)

Planner (words only): the faces of a CSS 3D object that sit at their own left/top inside the turned group (round 21 c2:
four 340px cards at 110,150 in a 560x640 group) now say that place per face; before, every face was said "at the group's
top-left (left 0, top 0, the group's own size)", which moved the whole stack about 170px left, over the headline (and
once grew a dark slab). Faces at 0,0 keep the old wording. Re-planned rounds 1-21: only round 21 c2 changes.

| page | before | after | what changed |
|---|---|---|---|
| c2 depth stack | 65% | **91%** | 3D stack in its own place right of the headline, no slab (colour 97, structure 97, layout 90); tags still outlined (target filled white pills), button a little small |

Round 21: **83%** over 10 (89, 91, 90, 74, 84, 76, 86, 75, 79, 81; was 80). Vitest same 2 env failures (1459 tests);
typecheck clean.
Next: c4 swiss orbit (74) disc still from a drawn component, column heads' letter-spacing; c5 title glow and horizon band;
c2 tags as filled translucent white pills.
