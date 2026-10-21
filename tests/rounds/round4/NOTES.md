# Round 4 (n47): harder than round 3, untuned first look

Creative: c1 cut-out collage (tilted paper scraps, tape, multiply-blend italic serif), c2 difference split
(black/white halves, arched portrait, difference-blend giant words), c3 Swiss grid poster (rules, disc + ring,
vertical type), c4 depth planes (3D-perspective glass planes, blurred glows, gradient text), c5 sticky story
(giant serif chapter number, stacked step cards, progress bar, dots).
Everyday: e1 CRM dashboard (sidebar, KPI sparklines, SVG line chart, donut, deals table with pills), e2 mail
client (3 panes), e3 checkout (stepper, form, delivery options, summary), e4 file manager (tile grid, details
drawer, storage bar), e5 gantt timeline (week columns, bars, today line).

Measured: blank page scores 16-98% colour / 15-75% structure (v3 likeness 0-5% on the dry draw). Effects read
off the targets: c1 9 techniques, c4 5; 3D perspective is not yet one of the 17 the effect check knows.

Untuned planner misses, and what this step fixed (rounds 1-3 plans unchanged after the fixes):
- crashed on inline SVG (className is not a string)  -> fixed
- multiply blend said as "colour-inverting"            -> blend words per mode
- 3D perspective planes said as plain glass           -> "tilted back in 3D perspective"
- file tiles in a grid read as chat bubbles           -> bubbles must stack one per row
- mail message list and reading pane had no note      -> big unfilled panes with parts go to the box branch
- mint card called light grey                          -> 'mint green' named
Still missed (next steps): e5 gantt bars and today line unsaid; e1 SVG line chart, donut and sparklines unsaid,
table read as a list; e3 form fields "and text"; e2 list splits read/unread rows and glues sender+time;
c3 grid rules dropped; c2 page note and arch shape missing.

Dry draw: all 10 drawn through the overlay (3 first failed while tests ran in parallel; re-run clean).

n49 (dense UI said, untuned rounds 1-3 plans byte-identical after):
- e5 gantt: "timeline, 8 week columns ...; one task bar per row: <colour> "<task>" start of <week> to mid <week> ...; thin red
  vertical today line at start of Oct 26". Said even though its name column and today line are marks of their own.
- e1: line chart (thick solid indigo rising, dashed light grey rising, 8 points), donut (indigo 45%, green 25% on a light
  grey track), KPI sparklines (colour, rising/falling), deals table read as a table (columns, rows, first row, pills).
- e3: form "labels above empty fields: First name | Last name; Street address full width; City | Postcode" (the form
  holds the delivery mark, so it is now drawn as its own box).
- e2: mail rows "name left and time right, grey line under, unread rows bold" with sender/time/subject split; the
  selected and unread rows join the list (short state classes 'u', 'sel' no longer split a row group).
Watch on the live run: e5's timeline note is typed at the box centre, which is on the today line mark.

## n50: first live builds (likeness v3)

| page | likeness | tokens | notes |
|---|---|---|---|
| c1 cut-out collage | 65% | 143k | all parts placed; blue block keeps the drawn X, arch built as a circle, no hard shadow. Repair turn (56k) was a false alarm: the badge and button said their copy in single quotes, so they counted as pure decorations. Fixed. |
| c4 depth planes | 85% | ~41k | planes, glows, gradient headline all there; back plane keeps the drawn X; teal/pink glows brighter than target blue/purple. |
| e1 CRM dashboard | 64% | ~46k | sidebar, KPIs with sparklines, line chart, donut, table with pills all built; donut gained a legend, invented two table rows' copy. |
| e5 gantt | 18% | 44k | every bar on its weeks, today line, Day/Week/Month; rows built ~2x too tall (so the score drops), today line short, colour dots dropped. |

Next worst gaps: gradient/filled blocks drawn as crossed picture boxes keep their X lines in the build (c1, c4);
e5 row height; c1 arch.

## n52: gantt rows sized

Planner gantt note now says row pitch, bar height and how far down the rows reach ("rows 64px apart, bars 30px tall,
rows end 70% down, empty below"); a list whose items each lead with a round coloured dot says each dot's colour.
Rounds 1-3 plans unchanged (only round-4 e5 changed).

| page | before | after | tokens | notes |
|---|---|---|---|---|
| e5 gantt | 18% | 47% | 61k | rows at the right pitch, empty space below, dots back. Still: name rows sit ~30px above their bars, dots small (target 26px), today line stops at the last bar instead of the box bottom, active "Week" not dark. |

## n53: first builds of c2, c3, e2, e3; crossing boxes (likeness v3)

| page | likeness | tokens | notes |
|---|---|---|---|
| c2 difference split | 34% -> 43% | 51k, then 57k + 33k | first build: dark half came out a lavender gradient and the arch a grey box. Cause: the arch's note was typed 3px from the dark half's edge, so it focused both boxes and the reading merged them. Fix: a note typed inside a drawn box drops other boxes that cross it. After: black half, gradient portrait, difference-blend words, effects 100% (was 50%). Still: arch built square-topped, words ~30px low. |
| c3 Swiss grid | 65% | 53k | disc, ring, dates, vertical label, bottom links all there; red too saturated, grid rules dropped, headline lines spaced wider. |
| e2 mail client | 56% | ~14k | three panes, unread rows, buttons; some row subjects invented, sender avatar dropped. |
| e3 checkout | 37% | ~28k | stepper, form, delivery options, summary; stepper as plain text, form put in a card, item thumbnails dropped, page white not pale grey, options side by side. |

Left for round 4: c5 sticky story and e4 file manager never built.

## n54: last round-4 first builds; checkout and file manager said properly (likeness v3)

Planner: a stepper (numbered circles, done ones filled), radio options (ring, selected one), list items with a square
thumbnail and a small line under the name, a cool pale grey page (#f9fafb was read as white), a tile grid (picture block
on top, name, small line, selected border), a stacked sidebar's links, a progress meter, a breadcrumb (2+ separators),
a toolbar of buttons in nested groups. Plan changes: round 4 e3/e4, round 2 e1 (pale grey page now said); rounds 1/3 unchanged.

| page | likeness | tokens | notes |
|---|---|---|---|
| c5 sticky story | 57% (first) | ~55k | cards, serif chapter line, pale yellow page right; giant "03" built ~1/2 size (n40), invented a site title, progress bar and dots dropped, tilt on the last card dropped. |
| e4 file manager | 25% -> 59% | ~59k, then 39k | first: tiles built as a list, no breadcrumb/toolbar, sidebar invented. After: tile grid, breadcrumb, toolbar, sidebar links, storage meter all right. Colours paler: #0ea5e9 named teal, #fecaca named pale lilac. |
| e3 checkout | 37% -> 48% | 38k | stepper circles, radio options, thumbnails with sub-lines, pale grey page all built; near-identical. Summary card shorter than target. |

All 10 round-4 pages now built at least once.

## n55: colour names, story-page strip, dots and card fills (likeness v3)

Planner: #0ea5e9 is now 'bright sky blue' (was 'teal'; hue 193-215 only, so #14b8a6 stays teal and #06b6d4 cyan),
#fecaca 'pale pink' (was 'pale lilac'); a thin textless filled strip is 'solid <colour> strip only Npx tall, no text
(a progress bar)' (was 'green', read as a site title); a column/row of bare round dots says count, size, gap and
colours; a 1.5-3deg turn says 'tilted slightly'; a filled card with title and copy says '<colour> block' so the colour
lands on the card, not its title. Plan diffs: round 3 c2/c4/c5/e4 (sky blue, 'block' on brutal cards), round 4
c1/c5/e1/e4; rounds 1-2 unchanged except round 2 none.

| page | before | after | tokens | notes |
|---|---|---|---|---|
| c5 sticky story | 57% | 38%, then 54% | ~47k, then ~37k | first re-run: strip, dots, tilt all built, no invented title, but every card dark green ('mint green "Wait"' coloured only the title). After the 'block' fix: green, mint and yellow cards, slight tilt, strip, dots, effects 100%. Score flat (noise band ~±5); giant "03" still ~half size (n40), cards a little paler with gradients. |
| e4 file manager | 59% | 53% | ~70k | Upload button and progress now sky blue, Brief.pdf tile pale pink as target; layout near-identical. Score swing is noise; build added file icons inside tiles (target plain colour blocks). |

## n56: giant "03" rebuilt at full size; vivid fills (likeness v3)

Planner: a filled box whose colour is strong and opaque (channel spread >= 150) now says 'vivid <colour>' in the box
branch too (it already did for picture blocks and shapes). Plan diffs: round 3 c4 two cards, round 4 c5 step-3 and
e5 today tag; rounds 1-2 unchanged.

| page | before | after | tokens | notes |
|---|---|---|---|---|
| c5 sticky story | 54% | 76%, then 70% | ~52k, then ~47k | first: "03" now built full height (n40 fix), but the yellow card came out pale cream. After 'vivid': card bright yellow as target; this run put the chapter label above the number (run-to-run swing). |
