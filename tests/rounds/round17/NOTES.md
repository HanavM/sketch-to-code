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
