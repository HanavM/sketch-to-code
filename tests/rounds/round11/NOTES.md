# Round 11 (n140): harder than round 10, untuned first look

Creative: c1 3D card stack (three gradient cards turned in 3D with perspective, rotateX/rotateZ and translateZ, the
front card floating on a keyframe loop, a hollow-word headline, a glass chip), c2 masked type (a 300px word with
gradient-clipped fill under a fade-out mask, three 60px-blurred colour blobs, an arch picture under a radial mask, an
SVG text ring spinning), c3 weight ladder (one word set at six weights 100 to 900 with an italic last rung, a spec
panel with key/value rows, two tilted counter-running marquees), c4 cube scene (a preserve-3d cube of six faces
spinning in perspective, a gridded floor tilted back with rotateX, a blurred cube shadow, a stats card), c5 paper
layers (four SVG wave layers with drop shadows, a radial-gradient sun with halo rings, an animated progress bar, an
italic serif headline, a tilted booking card).
Everyday: e1 code editor (activity bar, explorer, tabs, 14 lines of highlighted code with line numbers and a current
line, minimap, terminal panel with tabs and test output, status bar), e2 CRM pipeline (4-column deal board with
coloured column rules and a selected card, a deal drawer with key/value rows, an activity timeline and pinned
buttons), e3 mail client (folders with labels, a message list with unread rows, a reading pane with sender, body,
attachment cards and reply pills), e4 analytics dashboard (sidebar, KPI cards with sparklines, an SVG line chart with
area fill and dashed target, a conic donut with legend, a channel table with share bars), e5 week calendar (mini
month, calendar checkboxes, a 7-day hour grid with 15 events, side-by-side overlaps and a now line).

Measured: blank page scores 14-97% colour / 6-65% structure. Dry draw: all 10 drawn through the overlay, no failures;
untouched pages score 0-6% likeness.

Measure change (free): the effects scan now also reads 3D (perspective, preserve-3d, a 3D matrix) and masks
(mask-image), so round 11's new techniques are counted; no earlier page uses either, so earlier numbers are unchanged.

Untuned planner misses (autoplan.txt):
- c1: cards, 3D turn and perspective all said; each card's translateZ lift and the front card's float loop unsaid.
- c2: the three blurred blobs have NO note; the arch picture's shape and radial fade mask said as a plain circle; the
  CTA button and the footer line dropped.
- c3: weights collapsed to regular/bold (100 and 300 read as regular; the italic Black 900 lost); the spec panel read
  as a "contents list" of values (the Axes/Glyphs/... keys, the paragraph and Download button dropped).
- c4: the cube said as five flat projected rectangles (the 3D, the spin and the "3D" face text lost); the floor's
  horizontal grid layer dropped (only vertical stripes); stats numbers given empty labels; the cube's shadow unsaid.
- c5: the sun's gradient lost its second stop and both halo rings; the wave layers' drop shadow unsaid.
- e1: the current code line read as a "filled button"; tabs said near-black on near-black.
- e2: the search field read as "label Pipeline above an empty field"; the drawer's key/value rows list only keys; the
  two pinned buttons merged into one dark line.
- e5: the mini month read as "an OPEN date-range picker floating over the page"; the grid's rule colour came out
  #1f1f1f (target #e3e3e3), the hour-line gradient garbled; the 7 vertical day lines unsaid.

## n140: first live builds c1, c2, c4 (2026-10-23, ~198k billed, untuned planner)

| page | likeness (v3) | effects kept | what was off |
|---|---|---|---|
| c1 card stack 3D | 79% | 88% (no motion) | the three cards really turned in 3D and overlapping, hollow "One" kept; cards spread lower (each ~30px further down), the float loop dropped, CTA yellow not lime |
| c2 masked type | 51% | 44% | the gradient word under its fade mask is right; all three blurred blobs missing (the page is bare cream), the arch picture became a full circle, the copy line invented and its button lost, the text ring smaller and clipped |
| c4 cube scene | 46% | 57% | the cube became flat overlapping rectangles (no 3D, no spin, "JS" kept, "3D" lost); the dark floor is a faded pink gradient with stray stripes, the stats card is a thin tilted strip, "not" not pink |

Round 11 so far: **59%** over 3 pages. The 3D vocabulary half-works: a 3D stack said as CSS (perspective + rotate)
builds right (c1); a 3D object the planner flattens into projected boxes (c4) is lost. Next (planner, free first): a
preserve-3d object said face by face as a CSS cube (size, each face's transform and fill, the group's turn and spin);
a perspective floor said as a dark base plus BOTH grid layers and its rotateX; blurred blobs said one by one (size,
place, colour, blur); a masked picture's shape and mask said; per-word heading colours already work elsewhere, so check
why c4 "not" was dropped. Then re-run c2, c4 and first builds of c3, c5 and the five everyday pages.
