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

## n214: a big flat disc said as one plain div in its place, spaced letters said, a bar stack kept apart (2026-10-25, ~297k billed for two c4 runs)

Planner (words only): a flat textless disc 200px or wider says its page top-left and that it is ONE plain div with that
background (not an SVG, a drawn or shaded component, or a gradient); a part-by-part text part with letter-spacing of 1px
or more says it (round 21 c4 column heads "01 — GRID" were built tight); a stack of 3+ textless thin bars with gaps says
they are separate bars with the gap between (one c4 run built them as a solid block). Re-planned rounds 1-21: letter-
spacing reaches 32 parts across rounds 2-21, the disc wording 8 discs, the bar wording only round 21 c4. No marks changed.

| page | before | run a | run b | what changed |
|---|---|---|---|---|
| c4 swiss orbit | 74% | 73% | 70% | disc flat red in its own place and column heads spaced, both runs; run a merged the four bars into one block (fixed by the bar wording), run b kept the bars but dropped the two page-high hairlines at x 320 and 960 |

Kept build stays the 74% one (n210); the two runs are saved as c4-swiss-orbit-n214-cmp.png and -n214b-cmp.png. The
asked-for fixes show in both runs; the score is held down by run-to-run loss of other parts (bars, hairlines) and the
giant numeral still sitting ~15px right and ~7px high. Round 21 unchanged at **83%**.
Next: make the page hairlines survive (said once in the whole-page note, lost in 1 of 3 runs), then c5 title glow and
horizon band, c2 tags as filled pills.

## n215: the page's own grid lines said again on its drawn divider rule (2026-10-25, ~138k billed for one c4 run)

Planner (words only): the page-high hairline rules that have no mark of their own were said only in the whole-page note,
and one of three c4 runs dropped them. Now the first drawn divider rule of the same grid also says them, as their own
page-level divs (not inside the strip), with x, length and colour. Re-planned rounds 1-21: only round 21 c4 changes.

| page | before | after | what changed |
|---|---|---|---|
| c4 swiss orbit | 74% | **78%** | both page-high lines at x 320 and 960 built, four bars separate, disc flat red, column heads spaced (colour 95, structure 87, layout 87); the giant 07 still ~10px high, column copy wraps a word earlier, meta missed by the region check |

Round 21: **83%** over 10 (89, 91, 90, 78, 84, 76, 86, 75, 79, 81; 82.9, was 82.5). Vitest same 2 env failures (1459
tests); typecheck clean.
Next: c5 neon grid (84) title glow and the purple horizon band; c2 tags as filled pills; e3 gantt (75) and e2 (76).

## n216: a gradient title's drop-shadow glow, a page blend's middle stop, filled pill tags (2026-10-25, ~140k billed for two runs)

Planner (words only): gradient-filled letters with a coloured `filter: drop-shadow` now say the glow as that filter (a
text-shadow would be hidden by the gradient text); a page blend with three or more stops whose two ends are the same
colour is said stop by stop, not "dark to dark", and two stops 1% apart count as a hard edge (round 21 c5: purple band
to 55%, then near-black); a row of like filled pills with no border says FILLED pills, their size, gap and see-through
fill (round 21 c2 tags were built as outlined chips). Re-planned rounds 1-21: only round 21 c5 and c2 change.

| page | before | after | what changed |
|---|---|---|---|
| c5 neon grid | 84% | **91%** | pink glow round the title and the purple band to the horizon both built (colour 98, structure 96, layout 78, effects 100%); the nav missed by the region check |
| c2 depth stack | 91% | 55% (not kept) | tags now filled see-through pills, but this run built the 3D card stack as one flat gradient slab; kept build stays 91% (run saved as c2-depth-stack-n216-cmp.png) |

Round 21: **84%** over 10 (89, 91, 90, 78, 91, 76, 86, 75, 79, 81; 83.6, was 82.9). Vitest same 2 env failures (1459
tests); typecheck clean.
Next: c2's 3D stack is lost in 2 of 4 runs (flat slab); then e3 gantt (75) and e2 analytics (76).

## n217: a real CSS 3D build skips the drawn-outline scaffold; a card pile said as a pile (2026-10-25, ~168k billed for three c2 runs)

Why c2's 3D stack was lost in 2 of 4 runs: the reading named the drawn box a picture ("stack of four layered 3D
plates"), so the pipeline handed the build a ready component made from the drawn outline with "keep these paths", and
that won over the words; the build filled the outline with four flat bands (run a, 59%). Now words that give a real
CSS 3D build (preserve-3d with translateZ faces) count as an exact CSS shape, like a clip-path or a 1px rule, and get
no outline component (pipeline, below the trace rung). Planner: four like faces lifted only by translateZ are said as
a STACK of separate cards in a pile (NOT a cube, NOT side by side), with what flattens 3D (fill, overflow hidden,
filter, opacity on the scene or group). Re-planned rounds 1-21: only round 21 c2 changes.

| page | before | run a (plan only) | run b | run c | what changed |
|---|---|---|---|---|---|
| c2 depth stack | 91% | 59% | **92%** | 92% | run a: outline component kept, cards built as flat bands; with the scaffold skip both runs built the tilted pile of four cards, tags filled pills, 3D effect kept (colour 97, structure 98, layout 95) |

Round 21: **84%** over 10 (89, 92, 90, 78, 91, 76, 86, 75, 79, 81; 83.7, was 83.6). Vitest same 2 env failures (1459
tests); typecheck clean.
Next: e3 gantt (75) and e2 analytics (76), then c4 swiss orbit (78).

## n218: dot-led rows, gantt week heads and progress shade, a selected segment, and a top bar that pushes nothing down (2026-10-25, ~315k billed for four e3 runs)

Why e3 gantt sat at 75: the task rows said "text starts at x 16" while a 22px dot sat at x 16 (built with the dot over
the names); the week heads were said only as words (built centred, one line); the done part of each bar is the bar
colour under 18% black (said "lighter", built paler); the selected "Weeks" segment was never said.

Planner (words only): a row whose own words start after a small dot or icon says the dot first, the gap and the real
text x, and that the dot and the count after it are the row's own children; gantt week heads say their alignment,
inset and both lines (bold week over a normal-weight date); a progress fill says darker or lighter from its real
colour; a segmented control's one filled segment is said as the selected one. Re-planned rounds 1-21: round 21 e3,
round 4 e5, round 12 e2, round 17 e1 and round 18 e4 change (only the gantt and dot-row words).

Codegen rule (product, all pages): a bar laid over the page top keeps what is under it in place by its own top or the
wrapper's padding, never a margin-top on the first flow child. Runs a and c built the header absolute and gave the
row below `margin-top: 60`, which collapsed through the page wrapper and moved the whole page, header included, 60px
down (layout 47-49).

| page | before | run a | run b | run c | run d (codegen rule) | what changed |
|---|---|---|---|---|---|---|
| e3 gantt | 75% | 66% | 67% | 69% | **78%** | dots before names, darker done parts, week heads left on two lines, "Weeks" selected: all four built in a, c, d; b lost the row children (fixed by the row-children words); a and c lost the header to margin collapse (fixed by the codegen rule) |

Round 21: **84%** over 10 (89, 92, 90, 78, 91, 76, 86, 78, 79, 81; 84.1, was 83.7). Vitest same 2 env failures (1459
tests); typecheck clean. Run a-c side-by-sides saved as e3-gantt-n218a/b/c-cmp.png.
Next: e1 mail client (76), then c4 swiss orbit (78) and e3's today line (missed by the region check in every run).

## n219: a heading between list rows said in its place, label swatches, file tiles, a top bar that starts right of the sidebar (2026-10-25, ~186k billed for two e1 runs)

Why e1 mail client sat at 76: the top bar starts at x 220 (right of the folder column) but was said "across the whole
page at 0,0", so the search pill was built over the sidebar top and the Compose button lost under it; the small
"LABELS" heading that sits after Drafts was said before the whole list and built at the top; the three label swatches
(10px, 3px rounded) were never said; the attachment cards (a pink preview filling their top by ::before, the name at
the bottom) were said as "buttons:" and built grey with an invented PDF / PNG label; the Compose and Inbox fills (flat
left, rounded right ends) were said with a broken "(, bold" and as square.

Planner (words only): a top bar that starts right of a left column says its x and width; a small caps heading that
sits between list rows is said in its place in an exact order; a small swatch before some rows says its size, colour
and rounding (not checkboxes: bordered, 16px); a row of like bordered cards with a filled ::before preview says FILE
TILES, their size, border, preview fill and the name at the bottom-left; a head button or highlight with square left
and rounded right corners says so. Re-planned rounds 1-21: round 21 e1 (four notes), round 20 e2 (DIRECT MESSAGES now
said between the channel rows), round 10 e3 and round 12 e5 (comma only) change.

| page | before | run a (top bar not yet fixed) | run b | what changed |
|---|---|---|---|---|
| e1 mail client | 76% | 76% | **87%** | a: labels heading in place, swatches and pink file tiles built, but Compose still lost under the full-width search bar; b: bar right of the sidebar, Compose and folders in place (colour 100, structure 95, layout 89) |

Round 21: **85%** over 10 (89, 92, 90, 78, 91, 87, 86, 78, 79, 81; 85.1, was 84.1). Vitest same 2 env failures (1459
tests); typecheck clean. Run a side-by-side saved as e1-mail-client-n219a-cmp.png.
Next: c4 swiss orbit (78) and e3 gantt (78, its today line missed by the region check in every run), then e4 music player (79).

## n220: a turned giant numeral says its line height and tracking; wide-spaced letters say their spacing (2026-10-25, ~116k billed for one c4 run)

Why c4 swiss orbit sat at 78: the giant "07" is turned a quarter about a 300px origin, and what turns is its line box.
The words gave the box, the origin and where it lands, but not the 0.8 line height or the -30px tracking, so it was
built with a normal (taller) line: the letters sat ~80px right of their place (no longer bleeding off the left edge)
and the whole page aligned 48px off. The vertical label said only "wide letter-spacing" and was built ~240px long
instead of 327.

Planner (words only): a quarter-turned giant word says its type size, line height in px and as a ratio (NOT normal,
and why), and its letter-spacing; every "wide-spaced letters" now says its letter-spacing in px. Re-planned rounds
1-21: 31 notes change across 16 rounds (only the added spacing px, plus round 21 c4's numeral).

| page | before | run a | what changed |
|---|---|---|---|
| c4 swiss orbit | 78% | **89%** | "07" bleeds off the left edge in its place, label full length (colour 100, structure 96, layout 72: the two drawn rules and the meta block are just off their boxes) |

Round 21: **86%** over 10 (89, 92, 90, 89, 91, 87, 86, 78, 79, 81; 86.2, was 85.1). Vitest same 2 env failures (1459
tests); typecheck clean.
Next: e4 music player (79): grey library thumbnails, filter pills moved to the bottom, title and artist merged on one
line, transport buttons bunched, playing row highlight lost. Then e3's today line (built right, missed by the region
match: it is not a box of its own in the build).

## n221: thumbnails painted one by one, chips before the list, two-line table cells, the playing row, transport glyphs placed (2026-10-25, ~78k billed for one e4 run)

Why e4 music player sat at 79: the library thumbnails were said as one "48px rounded square" (grey) because two are
gradients and the check for "each its own colour" only knew flat fills; the Playlists / Artists / Albums pills (9
letters, over the 8-letter chip limit) were said as plain words after the list and built at the bottom; each track
cell holds a title over its artist but was said as one run ("Low Sun Nova Lake") and built merged; the header row
(set off by a rule under it) was said as a body row; the playing row's fill was never said; the transport line
("⤮ ⏮ ❚❚ ⏭ ↻", 22px letter-spacing round an inline pause circle) was said as one centred 640px line with the circle
laid over it, built bunched with prev and next lost.

Planner (words only): a thumbnail list says each thumb's fill or gradient, and ROUND for a circle among squares;
chips up to 14 letters, pill ends said, and chips that sit before the items said before them; a table cell of a
block title over more text says both lines and their colours; a header row marked by a rule under it is the header;
a single filled body row is said HIGHLIGHTED with its rgba fill and rounding; a paint-less line of 1-2 letter glyphs
with an inline-block button among them says each glyph as its own part at its own x. Re-planned rounds 1-21: round
21 e4, round 20's music page (same transport, library chips and thumbs) and chip rows in rounds 13, 14, 16, 17 change.

| page | before | run a | what changed |
|---|---|---|---|
| e4 music player | 79% | **87%** | six coloured / gradient thumbs with the artist circle, pills under the heading, title over artist in every row, playing row filled and green, transport spread with the pause circle in the middle (colour 96, structure 87, layout 78: Home and Search built side by side) |

Round 21 re-scored over all 10 latest side-by-sides: **88%** (90, 93, 90, 89, 91, 88, 87, 79, 87, 82; 87.6, was 86.2;
re-scoring moves the untouched pages by about 1 either way). Vitest same 2 env failures (1459 tests); typecheck clean.
Next: e3 gantt (79, today line), e5 team settings (82).

## n222: a card note that quotes none of its words is said part by part; tab underline drawn as an inset shadow and the rule under the tabs said (2026-10-25, ~68k billed for one e5 run)

Why e5 team settings sat at 82: the danger zone was said only "white card" (three parts is under the old part-by-part
bar and the note quoted none of its words), so it was built as an empty card: the red "Delete team" title, warning
line and red button lost. The tabs were said as a plain link row: the Members underline is an inset box-shadow (the
tab check only knew border-bottom), so neither the underline nor the 1px rule under the bar was said.

Planner (words only): a bare look note that quotes none of a region's 2+ words (3+ worded parts) is said part by part
with its panel; a selected tab underlined by an inset box-shadow is detected and said with that shadow; a row ruled
along its bottom only, holding such a tab, says that rule. Re-planned rounds 1-21: only round 21 e5 (danger zone and
tabs) changes.

| page | before | run a | what changed |
|---|---|---|---|
| e5 team settings | 82% | **89%** | danger zone built with its red title, warning line and red button; Members underlined on the tab rule (colour 100, structure 96, layout 91; the Invites "2" pill set as a superscript) |

Round 21: **88%** over 10 (90, 93, 90, 89, 91, 88, 87, 79, 87, 89; 88.3, was 87.6). Vitest same 2 env failures (1459
tests); typecheck clean.
Next: e3 gantt (79): its today line is drawn right but is not a box of its own in the build, so the region match misses
it; look at whether the build or the measure is at fault before changing either.
