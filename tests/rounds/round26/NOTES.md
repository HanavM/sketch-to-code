# Round 26 (n247): harder than round 25, untuned first look

Creative: c1 blend mesh (four radial colour glows, three multiply-blended circles overlapping, a 260px "COLOR" set in
mix-blend-mode difference, an outlined 200px "THEORY", a turned pill tag, vertical label, mono meta), c2 origami fold (a
crane of four clip-path facets on one box with a sheen, a soft ground shadow, a skewed black title band, an italic serif
subhead, three step cards with hard shadows, a dashed fold line, a clip-path diamond badge), c3 observatory (a two-layer
tiled starfield, a fading nebula glow, dashed and solid orbit circles, a radial-lit planet with an inset shadow and a
turned ellipse ring, a glowing moon, an SVG constellation, an outlined serif "06", a frosted glass stats card), c4 ransom
zine (a headline of eleven letters each in its own tilted box in its own face and colour, halftone dots, a taped polaroid,
a torn clip-path blue band, a hard-shadow button), c5 synth patch (a cream panel with screw ::before/::after dots, ten
conic-gradient knobs set by a CSS variable, jacks, glowing LEDs, three SVG patch cables, an SVG waveform).
Everyday (denser tools): e1 video editor (top bar, media bin of gradient thumbs with durations, preview with caption,
transport, inspector with five sliders, a five-track timeline with ruler, clips, waveform stripes and a playhead),
e2 banking (navy sidebar, gradient credit card with chip, balance panel, stacked bars, transactions grouped by day,
four conic budget rings), e3 property map (search bar, filter chips, listings grid with an open sort menu, a map with
water, parks, roads, price pins with tails and a popup), e4 permissions (a role x permission checkbox matrix with group
rows and partial checks, toggles, tabs, toast), e5 phone screens (three phone frames side by side: onboarding, feed,
profile).

## n247: first live builds of all ten (2026-10-26, ~1.00M billed, 67.7 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 blend mesh | 82% | blends, outline type, mesh right; circles a little large, tag not turned |
| c2 origami fold | 82% | crane facets right; sheen built as a solid pale face, diamond badge built square, step-card hard shadows lost |
| c3 observatory | 82% | starfield lost (said as a white-to-black backdrop), nebula a hard dark disc, planet ring built as a turned rectangle, glass card solid white, constellation lost |
| c4 ransom zine | **88%** | letter boxes, torn band, polaroid right |
| c5 synth patch | 80% | knobs, cables, LEDs right; panel built short (jacks and LEDs fell outside it), screws lost |
| e1 video editor | **86%** | tracks, clips, inspector right; playhead lost |
| e2 banking | **88%** | card, rings, bars, list right |
| e3 property map | **96%** | near-identical |
| e4 permissions | 49% | the checkbox matrix was said as a list: built with one column (Owner) and group rows as dots |
| e5 phone screens | **97%** | near-identical |

Round 26: **83%** over 10 (83.0; round 25 started at 71 untuned). Vitest: same 2 env failures (1460 tests); typecheck clean.

## n247 fixes (planner, zero tokens, not yet re-run live)

- Sparse tiled radial dots (or 2+ dot layers) are a STARFIELD with exact background-image, size and position (c3).
- A radial gradient whose last stop is see-through is a SOFT GLOW with exact rgba stops, not an opaque sphere (c3 nebula).
- An empty bordered ellipse (radius 50%, 2:1 or wider) is an ELLIPSE RING with its untransformed size (c3 planet ring).
- A see-through stats card says FROSTED GLASS with its rgba fill, rgba border and blur (c3 glass stats).
- An empty thick-bordered circle inside a titled block says its RING (r25 c5 sleeve ring, carried from n246).

Re-planned rounds 1-25: only r25 c5 sleeve changes (ring said). Next: e4 checkbox matrix (49), c5 panel height and
jacks, c2 diamond badge and step-card shadows, c3 constellation; then live re-runs.

## n248: checkbox matrix, panel, diamond, hard shadows (2026-10-26, ~357k billed)

- A matrix of div rows on one grid template (header row, cells holding checkboxes) is now a rich table said cell by
  cell: ticked, partly ticked (::after dash) and empty boxes told apart (a white box with no mark is EMPTY), tinted bold
  group rows, centred columns, column lefts (e4 was said as a one-column list).
- A big painted panel whose content is all regions of its own says its size, place, rounding, outer drop shadow (the
  inset highlight no longer read as its shadow), its ::before/::after screw dots, and that its regions sit inside it (c5).
- A worded block cut to a polygon says its clip-path (c2 diamond 'NEW' badge); a hard offset no-blur shadow on a card
  part is said (c2 step cards).

Re-planned rounds 1-25: panel lines added on r1, r2, r6, r10, r21 (not re-run live).

| page | before | n248 | note |
|---|---|---|---|
| c5 synth patch | 80% | **94%** | panel full height, jacks and LEDs inside, screws |
| c2 origami fold | 82% | **92%** | diamond badge, step-card shadows |
| e4 permissions | 49% | **78%** | full 4-role matrix with ticks, dashes, group rows (first try hit the 14-min run cap; re-run 309s); brand row and subhead still lost |

Round 26: **88%** (88.3; was 83). Vitest same 2 env failures; typecheck clean.

## n249: constellation, turned tag, video preview, sliders, playhead, ellipse ring CSS (2026-10-26, ~360k billed)

- A small dot-and-line SVG (stroked lines plus 2+ filled dots: a constellation, a route with stops) is said verbatim
  (c3 constellation had no note at all). Verbatim SVG notes no longer repeat width/height.
- A turned button says its size and place before the turn and its rotate() (c1 'OPENS 14.11' tag was said by its turned
  bounds, built level).
- A gradient-painted 'picture' holding just a disc and a caption is said as a panel with its exact background and both
  parts placed (e1 preview: sun lost, caption under the frame).
- Slider tracks (thin track, fill from the left, round thumb) inside a panel are said one by one (e1 inspector).
- A thin tall line says its exact box, fill and its clip-path head (e1 playhead: 'vivid pink' only).
- An ellipse ring also says its exact CSS (c3 ring was still built as a turned rectangle; not re-run yet).

Re-planned rounds 1-25: r10 divider and r21 today line say their exact line; r20 turned button; r24, r25 SVG notes
lose a repeated width/height (not re-run live).

| page | before | n249 | note |
|---|---|---|---|
| c3 observatory | 82% | **94%** | starfield, soft nebula, glass card, constellation; ring still a turned rectangle |
| c1 blend mesh | 82% | **88%** | tag turned, circles placed; vertical label and nav spacing missed |
| e1 video editor | 86% | **98%** | sun, centred caption, five sliders, playhead with its head |

Round 26: **91%** (91.3; was 88). Vitest same 2 env failures; typecheck clean.

## n250: brand row, sub-lines, pushed-right words, one-line tab runs (2026-10-26, ~533k billed)

- A brand row (small filled icon + name) with no links of its own, straight over the first group heading, is now a BRAND
  row (e4 'Hexa' was said as the panel's title and built with no logo at all).
- A short untagged line straight on the page just under a worded region (same left edge, 0-40px below) rides on that
  region's note with its size, ink, offset and nowrap (e4 sub-line under the title was never said, never built; e2 and
  r18 e2 breadcrumb gain the same line).
- In a mixed-ink row, the last word set 40px+ after the others at the far right end says it is pushed right (e4 toast
  'Undo' was built right after the message); evenly spaced runs (steppers, navs) excluded.
- A run of parts with one even gap also says each part stays on one line (e4 'Custom roles' tab wrapped twice).

Re-planned rounds 1-25: one-line runs on ~45 notes, pushed-right words on r4, r12, r14, r22, sub-lines on r18 (not re-run).

| page | before | n250 | note |
|---|---|---|---|
| e4 permissions | 78% | **89%** | logo, sub-line, Undo at the right, tabs on one line (first try 55: title and toast misplaced; second 81: sub-line wrapped) |
| c1 blend mesh | 88% | **92%** | nav one line |
| c3 observatory | 94% | 91% | planet ring now a real ellipse ring; a see-through box behind the planet and a lighter headline (run noise) |
| e2 banking | 88% | 88% | sub-line built; rest unchanged |

Round 26: **93%** (92.6; was 91). Vitest same 2 env failures; typecheck clean.
