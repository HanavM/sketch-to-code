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
