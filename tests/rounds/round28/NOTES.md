# Round 28 (n256): harder than round 27, untuned first look

Creative: c1 jazz cutout (a cut-paper figure and arm from clip-path polygons, a multiply moon, music notes from ::after
stems, a hollow outlined word in a stacked headline, a vertical label, barcode stripes, a dashed double-ring stamp, a hard
offset button shadow), c2 sliced type (one 230px word cut into three clip-path bands, the middle pink and slid right, an
outlined echo, a blurred radial glow, a tilted moving ticker, scanlines, a hairline 2x2 stat grid), c3 terrarium (a glass
globe of two radial layers with soil, four leaves and two pebbles inside, a blurred cast shadow, frosted leader-line cards,
a frosted pill nav, kit cards), c4 metro poster (an SVG network map of four lines with 45° bends, stations and labels, a
numbered line legend, a fare box, a turned badge), c5 watch dial (a conic steel case holding a repeating-conic guilloché
face and two repeating-radial sub-dials, an SVG of ticks, gold indices and hands, a Didot headline, a spec list).
Everyday (denser tools): e1 SQL query builder (schema tree, syntax-coloured editor with a numbered gutter and a lit
current line, results table, a query-plan node graph with a SLOW badge, cost bars), e2 patient chart (allergy badges,
vitals with sparklines, a medication dose grid with missed/due doses, a drip bar and a NOW line, lab range bars, a notes
timeline), e3 podcast editor (transcript with marks and struck filler words, a ruler, four waveform lanes of masked clips,
a hatched cut, markers, a playhead, transport with a level meter), e4 trip itinerary (day tabs, a dashed timeline of
booking cards, a drawn street map with a dashed SVG route and teardrop pins, weather tiles, a stacked budget bar), e5 CI
pipeline (a run summary with a conic progress ring, a dotted-canvas job graph with curved SVG wires, an ANSI log with
failing lines, a status matrix, an annotation).

## n256: first live builds of all ten (2026-10-27, ~0.91M billed, ~55 min run time)

| page | likeness | marks | words | draw s | read s | run s | tokens | what was off |
|---|---|---|---|---|---|---|---|---|
| c1 jazz cutout | **88%** | 20 | 1,177 | 93 | 80 | 380 | 128k | music notes lost (one became a square), stamp a little low |
| c2 sliced type | 69% | 11 | 358 | 72 | 63 | 245 | 70k | three slices built as one whole word at the top (untagged band copies unsaid); blurred radial glow said as a 'product-photo backdrop', built as a hard violet slab; hairline stat grid built as a rounded glass card |
| c3 terrarium | 67% | 11 | 484 | 42 | 60 | 249 | 64k | globe said 'solid sphere, fully opaque' (its see-through stops said #ffffff), its soil, leaves and pebbles unsaid: built an empty white ball; cast shadow said 'frosted glass' |
| c4 metro poster | **89%** | 9 | 505 | 40 | 24 | 215 | 57k | map, legend, fare box, badge right |
| c5 watch dial | 77% | 10 | 709 | 49 | 50 | 258 | 73k | conic steel case said 'donut chart, lavender 100%', face and sub-dials unsaid: built a flat beige ring; spec list lost its capitals |
| e1 query builder | **84%** | 9 | 1,509 | 58 | 75 | 257 | 81k | gutter numbers and lit current line lost (::before attr numbers unsaid) |
| e2 patient chart | 78% | 8 | 1,232 | 56 | 37 | 404 | 104k | lab range bars and values lost (said as a two-column list); NOW label built as a black block; sparklines lost |
| e3 podcast editor | **92%** | 10 | 1,844 | 76 | 112 | 586 | 152k | lanes, clips, cut, playhead, meter right |
| e4 trip itinerary | **83%** | 11 | 963 | 58 | 49 | 220 | 62k | thin turned roads said by turned bounds (fat white bands), dashed SVG route lost, pins round; dashed timeline rail and stacked budget bar lost |
| e5 CI pipeline | **97%** | 5 | 2,642 | 61 | 75 | 376 | 122k | near exact |

Round 28 first look: **82%** over 10 (82.4; round 27 started at 75). Ease, first look: ~10 marks, ~1,140 words,
~61 s drawing, ~62 s to the reading, ~340 s run, ~91k tokens a page, no repair turns.

## n256 planner fixes (each a rule, not a page patch)

- Untagged sibling copies of a clipped word are said as ONE word sliced into bands, each band's inset, colour and slide (c2).
- A blurred radial gradient block is a soft GLOW with its exact background and blur, not a photo backdrop (c2).
- A grid whose 1-3px gaps show its own tint between solid cells is a HAIRLINE grid, not frosted glass (c2).
- A sliced word beside a separate whole copy of it says each copy's line and that the copy sits below, never over (c2 echo).
- A see-through radial sphere holding painted parts is a GLASS globe with exact layers, rim, shadows and every part (c3).
- A textless see-through block blurred soft is a cast SHADOW, not glass (c3).
- A round textless gradient disc holding painted parts is a DISC with exact background and its parts, not a donut chart (c5).
- Code lines numbered by ::before attr() say the gutter and the lit current line (e1).
- A thin line's ::before that holds text is a TEXT LABEL (with its fill, if any), not a block (e2; also r21 e3 Today tag).
- Rows that each hold a gradient range bar with a marker are said cell by cell, bar zones and marker % included (e2).

Re-planned rounds 1-27: only r21 e3 (the Today tag now said as a label on its red fill) changes (not re-run).

## n256: live re-runs on the new notes (~0.4M billed)

| page | first | re-run | what changed |
|---|---|---|---|
| c2 sliced type | 69% | 76%, then **86%** | glow, three bands and hairline grid right on the first re-run (76%, echo built over the title); echo placed below after the echo rule (86%) |
| c3 terrarium | 67% | 75% | glass globe with soil, leaves and pebbles now near exact, cast shadow right; copy wrapped to 3 lines, kit cards and button ~20px low, pill nav fill and leader lines still lost |
| c5 watch dial | 77% | 73% | worse: the case built as a cream square (cause not seen; the app was overwritten by the next page), sub-dials and hands lost; re-run next to tell rule from noise |
| e1 query builder | 84% | 64% | gutter numbers and lit line now right, but the columns shrank to their content (sidebar, editor and plan no longer full height): panel heights need saying |
| e2 patient chart | 78% | **86%** | lab range bars with markers and values, NOW text label right |

Round 28 now **83%** (latest build of each page: c1 88, c2 86, c3 75, c4 89, c5 73, e1 64, e2 86, e3 92, e4 83, e5 97).
Vitest: same 2 env failures (1460 tests); typecheck clean.
Next: e1 full-height columns, c5 re-run, c3 copy width and pill nav, e4 thin turned roads, SVG route, dashed rail and stacked bar.
