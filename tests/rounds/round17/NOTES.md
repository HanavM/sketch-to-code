# Round 17 (n171): harder than round 16, untuned first look

Creative: c1 kinetic marquee (three 150px marquee bands turned -8deg, one hollow, one on a black strip, all animated;
a pink-violet photo cut to a skewed quad by clip-path; a black badge with text on a circle path, spinning; a hard-shadow
pill button), c2 riso overprint (an offset two-colour title in multiply blend, three overprinted circles, a grain dot
overlay over the whole page, a dashed rotated stamp, a ruled four-column info row), c3 synth horizon (a striped sun cut by
a banded mask, a mountain silhouette by clip-path, a perspective grid floor turned 62deg and scrolling, a 170px italic
title extruded by eight stacked text shadows, a neon-glow outline button), c4 wrapped editorial (a diagonal clip-path
photo, faint stacked numbers, a justified article with a drop cap wrapped round a floated circle via shape-outside, a
scrolling ticker band), c5 bento motion (an asymmetric 4x3 bento: gradient-mesh hero tile, counter, animated bars,
dotted map with pulsing dots, vertical yellow stat, scrolling logo strip).
Everyday (denser apps): e1 gantt timeline (task table with groups, owners, progress; week columns, bars with progress
fills, milestone diamonds, dependency elbows, a today line), e2 log explorer (query bar with keyed tokens, filter chips,
a 40-bar histogram with an error spike, a 22-row mono log table with a selected row, a JSON detail drawer), e3 design
editor (toolbar with avatars, layers tree, a phone frame on canvas with a selected button, handles, size badge, a red
gap measure, a comment pin, properties panel), e4 music player (library list, album header on a gradient, track table
with a playing row, queue panel, player bar with progress and volume), e5 CRM contact (profile card with tags, activity
timeline, deal stepper, an open stage dropdown, task checklist).

Measured: blank page scores 11-96% colour / 9-66% structure. Dry-drawn 10/10 (untouched 0-7% likeness).

## n171: first live builds c1, c3, e2 (2026-10-24, ~237k billed)

| page | likeness | what was off |
|---|---|---|
| c1 kinetic marquee | **77%** | bands, hollow band, black strip, skewed photo all right; the bands start at the left edge (target bleeds them off it); spinning badge built as bare text on a circle (black disc lost) |
| c3 synth horizon | **70%** | sun, mountains, extruded title, neon button right; the perspective grid floor lost (plain dark floor); sun stripes lost; the title and sun sit ~80px right and lower; subtitle left-aligned |
| e2 log explorer | **78%** | query bar, chips, histogram, 22 rows, drawer all there; error spike bars not red; message column lost (services invented in its place); drawer border and selected-row stripe lost |

Round 17 so far: **75%** over 3 pages (round 16 started at 66 over 3). Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): a 3D-turned repeating grid floor said verbatim; a banded mask on a disc as stripes; a
worded circle path's disc fill; marquee bands that bleed off both edges; red-flagged histogram bars by index; a log
table's message column; then first builds c2, c4, c5, e1, e3, e4, e5.

## n172: grid floor, banded sun, red spike bars, badge disc, bleeding bands, riso circles; first c2, c4, e1 (2026-10-24, ~574k billed)

Planner now says: a 3D-tilted floor whose grid is tiled by background-size (its untransformed size, transform, tiles and
scroll animation; it was a "20061x2264px product-photo backdrop"), a mask of many hard stops as stripes (was "fading out
toward the top"), runs of odd-coloured histogram bars ("bars 15 to 18 vivid red"), a worded circle's filled disc, a
both-ways bleeding band's untransformed left/top/width, a group of filled multiply-blend discs (was a bare box), and an
overprinted word's stacked lines and real line-height (and its heading hint 260px, not the wrapper's 16px). Rounds 3, 5,
6, 7, 11, 14, 15 notes re-generated (round 6/11/14 floors were dropped from the plan entirely before; none re-run).

| page | likeness | what changed / still off |
|---|---|---|
| c3 synth horizon | 70 → **81%** | grid floor and sun stripes now built; title sits at the left (target centred), subtitle left and small, button glow lost |
| c1 kinetic marquee | 77 → **79%** | badge disc and left bleed fixed; the skewed photo now sits ON the black band (target: under it) |
| c2 riso overprint | **33%** first, → **60%** after the disc/overprint fix | circles built; INK and LAB set on one line (target stacked), circles drawn over the title, grain overlay lost |
| c4 wrapped editorial | **78%** first | faint stacked numbers built solid white; headline words overlap ("remember" over "the rain"); article not wrapped round the circle, no drop cap |
| e1 gantt timeline | **64%** first | today line built as a thick red bar; week header wavy; group rows split from their tasks |
| e2 log explorer | 78 → **73%** | spike bars now red; message column still lost (rows invent INFO levels and services), detail tabs lost |

Round 17 so far: **73%** over 6 pages (latest build each). Vitest: same 2 env failures; typecheck clean.

## n173: gantt seen again, a task table said as rows, the riso grain and a stacked wordmark; first c5, e3, e4, e5 (2026-10-24, ~459k billed)

Planner now: reads a week head of "W10 Mar 2" (number over date) as a date head, so the gantt note fires again (it was
said as a "line chart" with a 27x784px "Today" part); bars may hold a textless progress child (said as "its first 40%
overlaid by a lighter fill"); SVG elbow paths are dependency lines; a task list built of cell spans under a taller head
row is said as a task table with group rows in place (was a "filled button" head and "rows of tabs"); a dot grain painted
by body::after is said exactly as a top overlay; a two-line overprinted wordmark is said as "INK" STACKED OVER "LAB" with
a box width that cannot hold both (the reading step had collapsed the line break to "INK LAB"). Rounds 1-16 notes
re-generated: unchanged.

| page | likeness | what changed / still off |
|---|---|---|
| c2 riso overprint | 60 → 65 → **86%** | grain built (65); then INK over LAB stacked, circles and blend all right (86). Layout misses two regions though the picture is 98% structure |
| c5 bento motion | **78%** first | bento, counter, bars, dotted map right; the cyan glow lost from the hero tile, the yellow 99.99% not turned vertical, the logo strip overflows its tile |
| e1 gantt timeline | 64 → **59%** | picture better (structure 87 → 92: table rows, group rows, progress fills, thin today line with tag, elbows all built); layout 92 → 65 because the toolbar region was not found |
| e3 design editor | **88%** first | |
| e4 music player | **90%** first | |
| e5 CRM contact | **90%** first | |

Round 17 complete: **80%** over 10 pages (latest build each). Vitest: same 2 env failures; typecheck clean.
Next: the layout check misses absolutely placed regions the picture shows are right (c2 circles/title, e1 toolbar):
find out why before trusting those numbers; c5 glow, vertical stat, strip clipping; e2 message column; c4 wrap and drop cap.

## n174: why the layout score missed regions the pictures showed right (2026-10-24, ~172k billed)

Found: a target region whose wrapper holds only absolutely placed parts collapses to 0px high, so it was measured
1280x0 and no build could ever match it. 8 regions in rounds 15-17 (r15 c2 numerals; r16 c2 blobs and glass cards,
c3 arched title, c5 floating chips, e2 events; r17 c2 circles and offset title). Worse, the auto-sketch drew its marks
from those same boxes, so those parts were drawn as flat lines at the page top. Fixed in both places (target measure
and planner facts): a collapsed wrapper takes the box round what it shows, clipped to the screen. Rounds 1-17 plans
re-generated: only r16 c2 changed (the glass stack's box, and a price tag now said "in front of" the heading).

Also added: a region built as sibling parts with no wrapper (e1's toolbar said as 7 separate elements) can match as a
group. Checked with `node tests/rounds/layoutcross.mjs` (each target's regions over every other target's page): unrelated
pages rise only 32 → 34 on average over rounds 8-17 (letting any parts in the band count, not just siblings, was +11:
dropped). Runs now save the built page's element boxes so layout can be re-scored later without rebuilding.

| page | likeness | what changed / still off |
|---|---|---|
| c2 riso overprint | 86 → **82%** (layout now measured on real boxes: 85%) | circles and title drawn and built in place; circles carry a big blurred dark halo, an invented paragraph sits over LAB, stamp text blue (target pink) |
| e1 gantt timeline | 59 → **78%** | toolbar built as one bar this time (single match, group rule not needed); layout 65 → 86 |

Round 17: **82%** over 10 (latest build each). Vitest: same 2 env failures; typecheck clean.

## n175: transparent stops, vertical type, clipped strips, part animations, stamp ink, log table cells (2026-10-24, ~391k billed)

Planner now: a clear gradient stop is said `transparent` (it was "#000000 at 0%", so the hero's cyan glow was built under
black) and the trailing `none` layer dropped; a part set in vertical writing is said VERTICAL (writing-mode, turned 180deg to
read upward); a line wider than the tile that clips it is said clipped at the tile's edge; each part's CSS animation is
said with its keyframes verbatim (bars, pulsing dots, scrolling logo strip); multiply-blend circles are said crisp (no
shadow or blur); a dashed stamp's words take the outline's colour; a data table with one highlighted row says that row is
SELECTED (fill plus its 3px left stripe), the table's mono face, each column's x offset, and each cell's own colour (ERROR
red, WARN yellow) so the message column is kept; a one-line text of 20px or more keeps its size in the drawing.
Rounds 1-16 plans re-generated: 13 pages changed (mostly the one-line size hint; r11 e5 transparent stops; r9 c4, r12 c2
stamp ink).

| page | likeness | what changed / still off |
|---|---|---|
| c2 riso overprint | 82 → **94%** | no halo, no invented paragraph, pink stamp |
| e2 log explorer | 73 → **94%** | message column, level colours, selected row with stripe all built |
| c5 bento motion | 78 → 71 → **90%** | glow, vertical 99.99%, clipped strip right at once; the 22px intro was built 12px and pushed the bento down (71) until its size was drawn (90). Nav button built outlined (target white pill) |
| c3 synth horizon | 81 → **83%** | re-run after the size hint (no regression) |
| r1 c1 sunset hero (check) | 79 → **68%** | only the logo size hint changed in its plan; this build left-aligned the centred headline and shrank the subhead: run-to-run drift, not the change (side-by-side saved as c1-sunset-hero-n175-cmp.png) |

Round 17: **86%** over 10 (latest build each). Vitest: same 2 env failures; typecheck clean.

## n176: inline-styled words, drop caps, text wrapped round a floated orb, faint type, stop positions, paint order, filled pills (2026-10-24, ~276k billed)

Planner now: a line with a word styled inline ("Gardens that <i>remember</i> the rain") is said as ONE element with the
styled word in place (it was "Gardens that the rain" plus a separate "remember" placed apart; only plain runs of same-size
spans with real spaces round them, so timeline rows and glued labels stay part by part); a paragraph part keeps its whole
copy (cut at 360 letters before), says its drop cap (::first-letter) and a block floated inside it that its lines wrap round
(float + shape-outside); the floated orb itself is said as floated inside the paragraph (was "absolutely placed, ON TOP");
a radial stop with no position is kept (the orb's #fde68a highlight was dropped); a gradient's middle stop is said as "its
stop at 60% of the way along, fully opaque" (was "at 60%", which the build read as 60% opacity and washed the photo out);
faint type keeps its alpha and a sans part on a serif page says its face; a big multi-line part says its real line count
(and is exempt from the one-line nowrap clause); a cut-out shape crossed by big lines painted after it says they paint OVER
it; a filled pill in a region whose note never says so is said as a filled pill. Rounds 1-17 plans re-generated: 30 pages
changed (mostly the sans-face words, inline runs in code lines, kept gradient stops); none re-run except below.

| page | likeness | what changed / still off |
|---|---|---|
| c4 wrapped editorial | 78 → 80 → **88%** | headline on two lines with the italic word in place, drop cap, text wrapped round the orb, faint numbers (80); then the photo's full-strength gradient (88). Still: body line breaks differ, ticker set in serif |
| c1 kinetic marquee | 79 → **81%** | the skewed photo now sits under the black band and the hollow line |
| c5 bento motion | 90 → **91%** | "Book a demo" a filled pill; the intro line built small again, nav links spread out |

Round 17: **88%** over 10 (latest build each). Vitest: same 2 env failures; typecheck clean.
Next: e1 gantt scores 79 though it looks near-identical (aligned colour 68): check the side-by-side crop/align before
trusting it; c5 intro size drift; c3 synth horizon at 83. Round 17 holds at 86+: write round 18 (harder).
