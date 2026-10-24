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
