# Round 16 (n162): harder than round 15, untuned first look

Creative: c1 split halftone (a 210px word in difference blend across a hard black/cream page split, over a 500px
disc of 14px red halftone dots faded by a radial mask; a vertical side index; serif italic quote on the light half),
c2 glass stack (three tilted frosted backdrop-blur panes over three blurred glow blobs, a 640px hollow outlined "3"
behind, a gradient pill button), c3 arched sunburst (a nine-letter title set on an arc, one rotated letter at a time,
over a repeating-conic sunburst and a dark disc; a dotted ring badge; a double-ruled menu row), c4 broken-grid editorial
(a 520px red "07" cropped off the left edge, two overlapping gradient photos, one multiply, a serif headline with a red
italic word, two-column justified text with a column rule, a left-ruled pull quote, a vertical credit), c5 tilted phone
(a phone mockup turned in 3D with a mini app inside, a soft floor shadow, three floating tilted chips, gradient-text
headline, radial glow background).
Everyday (dense app states): e1 spreadsheet (toolbar, formula bar, a 7x12 grid with a selected blue range and fill
handle, a floating chart, sheet tabs, a sum chip), e2 week calendar (mini month, a 7-day hour grid, side-by-side
overlapping events, a red now-line, an open event popover), e3 code review (PR header, file tree, a split diff with red
and green line and word highlights, an inline comment thread), e4 chat (workspace rail, channel list, messages with
reactions and a thread link, an open emoji picker, composer, typing line, a thread side panel), e5 checkout (stepper,
form with a focused field, an open address autocomplete, a tooltip, order summary with a dashed code field, a toast).

Measured: blank page scores 14-98% colour / 12-78% structure. Dry-drawn 10/10 (untouched 0-3% likeness).
Untuned planner misses visible in autoplan.txt:
- c1: the hard black/cream split is not said as a hard stop (built as a smooth fade);
- c2: the three blurred glow blobs get no note (their wrapper measures 0x0);
- c3: the conic sunburst read as a checkerboard floor; the arched title said as "links: S, U, N, ...";
- c5: the 3D turn of the phone not said; the floating chips said as buttons;
- e1: the selected range said as just "blue border";
- e2: the overlapping events said as buttons and a dropdown;
- e4: the emoji picker said as a label above an empty field.

## n162: first live builds c1, c5, e1 (2026-10-24, ~275k billed)

| page | likeness | what was off |
|---|---|---|
| c1 split halftone | **58%** | black/cream split built as a smooth grey fade; halftone disc built as a solid red circle (dots and soft mask lost); nav links invisible on the right; word, copy, buttons, side index right |
| c5 tilted phone | **79%** | phone built flat and upright (3D turn, tilt and floor shadow lost); the three floating chips built as tiny pills inside the nav; blue radial glow lost; headline, gradient words, buttons right |
| e1 spreadsheet | **61%** (flatters less than it looks) | grid, selected range, chart, tabs, sum chip all there; rows ~10% taller so everything below drifts; chart panel shaded; menu items pushed right; formula text right-aligned |

Round 16 so far: **66%** over 3 pages. Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): a hard-stop page split said as a hard stop; halftone dots under a radial mask verbatim;
a 3D-turned device mockup (its rotate, tilt, shadow) and floating chips at their places, never in the nav;
a conic sunburst never a checkerboard; a per-letter arched title; then first builds c2, c3, c4, e2, e3, e4, e5.
