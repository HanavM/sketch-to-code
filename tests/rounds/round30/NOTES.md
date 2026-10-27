# Round 30 (n268): harder than round 29, untuned first look

Creative: c1 chess match (a checkerboard laid back in 3D perspective, a giant knight glyph with a hard shadow, solid and
outlined names, a vertical date, a chess clock), c2 mosaic type (eight letter tiles, each its own fill, shape, turn and
offset: circle, clipped corner, leaf corners, outlined; a dot grid faded in by a mask; a diamond inside a ring drawn as
::after), c3 noir blinds (venetian-blind light: skewed, turned, masked stripes; difference-blended italic title with a red
second line; credits with a red rule; a film strip of two dashed rows; a ringed badge), c4 kaleidoscope (a 12-slice conic
wheel, a masked ray ring over it, two triangles one screen-blended, gradient-clipped headline word), c5 solar wheel (a
6-slice year dial, twelve month labels turned round the circle, a turned needle with a red ::after dot, a ringed sun, moon
phases drawn with inset shadows).
Everyday (denser tools): e1 recruiting (app rail, stage chevrons cut by clip-path, a candidate table with avatars, rating
dots and status pills, a profile with tabs, scorecard bars and a dotted timeline), e2 inventory under a scanner modal (a
whole app dimmed behind a blurred overlay, a camera view with a barcode, frame and laser, a found item, a quantity
stepper), e3 month calendar (mini month, calendar list, a 7x5 month grid, multi-day event bars, dot events, a popover
with a pointer), e4 workflow editor (node library, dotted canvas, five nodes with ports and SVG bezier wires, a selected
node ring, minimap, zoom bar, inspector with a code box and toggle), e5 music studio (transport, track headers with M/S/R
chips, a bar ruler, waveform and note clips, loop range, playhead, a mixer with ring knobs, faders and masked meters, an
EQ curve).

## n268: first live builds of all ten (2026-10-27, ~0.62M billed first pass + ~0.11M re-runs, ~49 min run time)

| page | likeness | marks | words | draw s | read s | run s | tokens | what was off |
|---|---|---|---|---|---|---|---|---|
| c1 chess match | **86%** | 10 | 490 | 65 | 94 | 150 | 67k | board, knight, names, clock right; warm backdrop glow and board frame lost; nav letter-spacing lost |
| c2 mosaic type | 65% | 9 | 411 | 49 | 58 | 202 | 51k | tiles built as one even square grid: each tile's own turn, circle/leaf/clipped shape and offset lost, outlined F tile lost; dot grid not faded; diamond in the ring (::after) lost |
| c3 noir blinds | (2%) | 13 | 457 | 56 | 61 | 275 | 17k | **no build**: codegen record never written (see below); re-run failed the same way |
| c4 kaleidoscope | **80%** | 12 | 609 | 60 | 65 | 209 | 58k | the 12-slice conic wheel lost entirely (only the ray ring built over the page) |
| c5 solar wheel | 77% | 18 | 623 | 83 | 119 | 347 | 88k | month labels round the circle lost, dial border lost, needle built upright with its ::after dot as a large red flag, sun ring lost |
| e1 recruiting | **87%** | 15 | 1,995 | 117 | 73 | 380 | 108k | near exact; scorecard bars and timeline dots lost |
| e2 inventory modal | (3%) | 9 | 799 | 85 | 99 | 252 | 15k | **no build** (as c3; e4 re-run the same, with a page reload logged) |
| e3 month calendar | 28% | 17 | 2,308 | 122 | 114 | 528 | 166k | the reading tied the launch bar's mark to the grid's enclosing rectangle, so its drawn-form scaffold was the whole grid: a purple slab over the month; trip bar's inset stripe said as an outer shadow |
| e4 workflow editor | (2%) | 9 | 2,084 | 106 | 101 | 333 | 30k | **no build** (as c3; e4 re-run the same, with a page reload logged) |
| e5 music studio | **87%** (re-run; first 2%, no build) | 8 | 1,680 | 107 | 86 | 321 | 93k | knobs built as pies (the ::after hole lost), meters full height (mask unsaid), EQ said 'line chart' so a zigzag was built, bass notes lost, playhead thick |

Round 30 first look over the six pages that built: **79%** (c1 86, c2 65, c4 80, c5 77, e1 87, e5 87); with e3 the
seven scored pages average **73%**. Three pages (c3, e2, e4) have no build yet, so the round has no full score.
Ease, first look (built pages): ~13 marks, ~1,200 words, ~85 s drawing, ~85 s to the reading, ~305 s run,
~90k tokens a page, 0.6 repair turns a page.

## The empty builds (4 of 10 first pass; c3 again on re-run)

Each ended with the overlay out of 'running' while the status still said 'Making the change…' (or nothing), no run
record (result.json) and zero codegen tokens; the app was left blank. e5 built fine on a plain re-run (87%), so this is
the bench, not the page. On the c3 and e4 re-runs the dev server logged a full `page reload index.html` during the build: a
reload drops the overlay's running state, the bench takes that as "done", scores a blank page, and resets the app under
the still-running build. Fix (bench, not yet proven live): after the overlay stops, wait for the run record before
scoring (up to 10 min), and keep the dev server's last lines on any row with no record.

## n268 planner fix (a rule, not a page patch; not yet re-run live)

- An inset hard box-shadow is a stripe painted inside one edge (e3 trip bar 'inset 3px 0 0 orange'), said as such,
  not as an outer shadow offset.

## Still open (next step)

Bench: prove the reload wait on c3, e2, e4 (and find what reloads index.html). Pipeline: a small mark inside a big drawn
rectangle must not take the rectangle as its own drawn form (e3 launch bar). Planner: c2 tile-by-tile shape/turn/offset;
c4 conic wheel under a masked ring; c5 labels turned round a circle, needle turn, ::after dot size; e5 ring knobs,
masked meters, EQ curve as verbatim SVG.

## n269: the blank builds found and fixed (2026-10-27, ~0.28M billed)

Cause: the code writer edited the app's `index.html` to add a web-font link (c3 serif title; the c3 re-run's tool list
shows `Edit index.html`). Any change to index.html makes the dev server reload the whole page, which drops the overlay's
running state mid-build. Fix (a rule, not a page patch): the build brief now says never edit index.html; a web font is
an `@import url(...)` at the top of the app's main CSS, else the face with system fallbacks. The bench also waits for
the run record (n268), so a reload can no longer be scored as a blank page.

Live re-runs, all built (none blank): **c3 noir blinds 74%** (blinds, glow, italic title with red Night, credits, badge
right; film strip lost, stripes not faded by the mask, credits not capitals), **e2 inventory modal 89%** (app under a
frosted modal right; stat cards and quantity stepper off), **e4 workflow editor 84%** (shell, nodes, inspector, code box
right; it read index.html and then edited the CSS instead, as told; bezier wires, dot grid and selected-node ring lost).

Round 30 over all ten pages: **76%** (c1 86, c2 65, c3 74, c4 80, c5 77, e1 87, e2 89, e3 28, e4 84, e5 87).
Ease r30: ~12 marks, ~1,160 words, ~79 s drawing, ~82 s to reading, ~226 s build, ~91k tokens a page, no repair turns.

Next: e3 launch bar taking the grid's rectangle as its drawn form (28%); c2 tile-by-tile shapes; e4 SVG wires; c3 film
strip and masked stripes; c4 conic wheel; c5 labels round a circle; e5 knobs, meters, EQ curve.

## n270: a borrowed frame is no longer a drawn form (2026-10-27, ~131k billed)

Cause of e3 28%: the reading cited the month grid's big rectangle on four actions (the grid, both event bars, the
popover), each next to its own small mark. No action cited the rectangle alone, so the old "owned alone" rule kept it
everywhere, and the launch bar's drawn form became the whole grid: a purple slab over the month.
Fix (grounding, a rule, not a page patch): a big drawn stroke several actions cite beside their own marks belongs to the
action that cites the most strokes with it (the grid, with its headers); any other action whose own marks sit inside it
and are at most a quarter of its area drops it as a borrowed frame. With no clear owner nothing changes.

Live re-run: **e3 month calendar 28 to 90%** (grid, bars, mini month, legend, popover all right; view toggle blank, event
dots and popover pointer lost). 17 marks, ~2,320 words, 92 s drawing, 400 s run, ~131k tokens, one repair turn.
Round 30 over all ten: **82%** (c1 86, c2 65, c3 74, c4 80, c5 77, e1 87, e2 89, e3 90, e4 84, e5 87).

Next: c2 tile-by-tile shapes (65); c3 film strip and masked stripes; c5 labels round a circle; e4 SVG wires.
