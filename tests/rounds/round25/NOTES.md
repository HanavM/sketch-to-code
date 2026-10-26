# Round 25 (n245): harder than round 24, untuned first look

Creative: c1 type specimen (a 460px "Aa" in Georgia black over a red outlined copy offset 22px, dashed metric lines with
right-hand labels, a tick ruler, an italic serif intro, a weight list where each name shows its own weight, a 12x3 glyph
grid with three inverted cells, a black kerning panel with an SVG measure, a turned round sticker), c2 neon diner (a
neon script sign with stacked pink text-shadow glows, a cyan neon line, a glowing yellow tube, a checkerboard floor laid
back with perspective + rotateX, a menu board with dotted leaders in a wood frame, chrome gradient-clipped type, a
9-point clip-path starburst, a glowing outlined button, stools), c3 Swiss kinetic (a 640px "2" bleeding off the top-left,
an outlined red "6", a red band turned 14 degrees about its top-left corner carrying words, SVG text on a circle round a
dot, vertical date type, a ruled schedule, faint red column rules), c4 botanical archive (three radial-gradient washes, a
serif headline with an italic green word and an SVG wavy underline, a Roman-numbered index with dotted leaders, two turned
specimen plates with scalloped mask tops, SVG plants and a fade mask on each picture, a double-ringed seal), c5 vinyl shop
(a record of repeating radial grooves with a ::before label and ::after spindle, a conic shine, a tonearm hinged at its
top end, a gradient sleeve with a hard shadow and a ring, a slanted orange-and-black band painted as a hard-stop
gradient, an equaliser, a serrated conic price badge, a row of dark crate tiles).
Everyday (denser tools): e1 email client (folders with labels, a message list with unread dots, avatars, label chips and
ellipsis previews, a reading pane with toolbar, sender, body, attachment cards, quoted reply and reply buttons), e2 dark
analytics (segmented range, date and export buttons, four KPI cards with SVG sparklines, an SVG area chart with gradient
fill, grid, axis labels, a dashed comparison line and a marker, a conic donut with legend, a top-pages table with share
bars and delta pills), e3 cloud drive (sidebar with storage meter, search, breadcrumb, view toggle, a selection bar, a
5x2 grid of file cards with gradient thumbs and checkboxes, two selected, an open context menu, an upload toast with
progress), e4 hotel search (a blue header band, a yellow search bar with a focused date field, an open two-month date
picker with a selected range, a filter panel with a range slider and checkboxes, two result cards with ratings, struck
prices and buttons), e5 invite modal (a members table page under a blurred dark veil, and a modal with token chips
including an invalid one, an error line, three role cards with one chosen, a toggle and a footer).

Measured: blank page scores 13-97% colour / 5-62% structure.

## n245: first live builds of all ten (2026-10-26, ~1.04M billed, 71.7 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 type specimen | 82% | Aa layers, glyph grid, kerning panel, sticker right; weight list run onto one line ("5 stats side by side"), intro set in bold sans, metric line labels at the left |
| c2 neon diner | 49% | the 3D floor measured as a 69090x10916 box and built flat over the whole top of the page; sub-line, tube and button glows unsaid; stools said as clouds |
| c3 Swiss kinetic | 44% | the turned band's words counted as 5 lines, drawn as a 5-line block and read as running copy (an invented paragraph across the page); the band said to turn about its centre |
| c4 botanical archive | **85%** | headline, underline, seal, index, plates right; plate SVG plants, scalloped tops, fade and second caption lost; index leaders lost |
| c5 vinyl shop | 51% | slanted band said as a 'stripes block' (whole page built orange), sleeve read as a field, record built as a rounded square with no label, tonearm turned about its centre, crate tiles built as white pills |
| e1 email client | 79% | near-identical in look; list column narrower (layout 59%), unread dots lost |
| e2 analytics | **93%** | near-identical |
| e3 cloud drive | 51% | file grid said part by part (50 parts, gap said 20px, the checkbox said under the thumb), built as ten empty boxes; sidebar's own logo, New button and links lost under a nested storage region |
| e4 hotel search | **88%** | date picker, filters, results right |
| e5 invite modal | **90%** | veil, modal, chips, role cards right |

Round 25: **71%** over 10 (71.2; round 24 started at 75 untuned). Vitest: same 2 env failures (1460 tests); typecheck clean.
Note: the first pass used `--budget 250000` as if per page; it is the whole run's cap, so it stopped after c2 and the
other eight ran in a second pass (`--budget 1400000`).

## n245 fixes (planner, zero tokens)

- A checkerboard laid back in 3D says its untransformed box, its transform and origin as written, and where it shows.
- A coloured text-shadow or box-shadow glow is said exactly on any region (not only 2+ glow headings).
- A name-left, value-right row list (stacked) says rows, rule, face per name; no longer "stats side by side".
- Two-part text blocks say a serif face; a short rule with a right-aligned label says its length and the label's side.
- A turned single line counts its lines across the turn (the band is 1 line, not 5).
- A band turned about its top-left corner says so (was always "about its centre").
- Paper cards say their mask edge (scallops), the picture's SVG verbatim and fade mask, and every caption line.
- A page-sized hard-stop slanted gradient over a clear ground is said as a see-through layer with exact CSS.
- Repeating-radial records say 50% round and their ::before/::after discs; a hinged plain bar says its origin and shadow.
- A round bordered child no longer makes its parent a "field"; a row of like square dark tiles says tiles, not buttons.
- 2+ rows of 6+ like picture cards are said as a GRID: one card template, then each card's words, paint and selection.
- A flat side panel's look words no longer hide its own parts when it holds a nested region.

Re-planned rounds 1-24: 22 changed lines (glows on 4 buttons/dots, serif two-part quotes, divider hexes, one turned line
count); no card-grid takeovers in old rounds.

## n245: live re-runs after the fixes (~329k billed)

| page | first look | now | what is still off |
|---|---|---|---|
| c2 neon diner | 49% | **91%** | floor, glows, menu, starburst right |
| c3 Swiss kinetic | 44% | **90%** | band, numerals, ring text right; no invented copy |
| c5 vinyl shop | 51% | **90%** | band, record, arm, tiles, badge right; sleeve title built low and doubled, sleeve ring and hard shadow lost |
| e3 cloud drive | 51% | **81%** | cards filled and selected, sidebar whole; grid a little off in x (layout 74%) |

Round 25: **87%** over 10 (86.9: c1 82, c2 91, c3 90, c4 85, c5 90, e1 79, e2 93, e3 81, e4 88, e5 90).
Next weakest: e1 email list column width and unread dots (79), e3 grid placement (81), c1 weight list and metric
labels (82, fixed in the plan, not re-run), c4 index leaders (85).
