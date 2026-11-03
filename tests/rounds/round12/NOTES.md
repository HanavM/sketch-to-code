# Round 12 (n145): harder than round 11, untuned first look

Creative: c1 isometric city (a grid plane turned rotateX(60) rotateZ(-45) with four towers lifted by translateZ, a
gradient-clipped headline, a glass chip, a tilted marquee ticker, a star-dot field), c2 blend poster (a 330px word in
mix-blend-mode: difference over a red disc and a tilted blue bar, vertical side label, a dashed spinning ring), c3 aurora
glass (a spinning conic-gradient aurora blurred 90px, grain, a thin headline with an italic serif word, a gradient-border
pill, three backdrop-blur glass cards with the middle one lifted), c4 diagonal split (two clip-path polygon panels, a
520px hollow outlined "09" across both, an uppercase headline, a rotated round sticker, an animated scroll hint), c5
halftone magazine (a serif masthead over a 6px rule, a halftone dot photo and a blue leaf shape in multiply blend, an
italic serif headline, two-column body with a drop cap, a tilted hard-shadow sticker).
Everyday: e1 design tool (toolbar with active tool and avatars, layers tree with a selected layer, canvas frame with a
selected button, corner handles and a size badge, a properties panel of X/Y/W/H fields, fill and stroke swatches), e2
Gantt timeline (Day/Week/Month segmented control, grouped task list with owner dots, week columns, bars, a progress bar,
a milestone diamond, a dependency hook, a Today line), e3 team chat (workspace rail, channel sidebar with unread
badges, messages with a mention chip, reactions, a code block and a thread link, a composer with a format bar, a thread
pane), e4 checkout (breadcrumb steps, focused field, a checkbox, a segmented Ship/Pick up/Locker control, floating-label
fields in 1/2/3 columns, an order summary with quantity badges, a discount field and totals), e5 users admin (side nav,
filter chips, a dark bulk-action bar, a table with selected rows, status pills, an expanded detail row, pagination).

Measured: blank page scores 15-98% colour / 11-74% structure. Dry draw: all 10 drawn through the overlay, no failures,
untouched pages score 0-7%.

Planner fix needed to plan the round (free): e5's filter chips matched the filter-panel detector with no checkbox row
and crashed the planner; a panel with no checkbox row is no longer a filter panel. No earlier page changes.

Untuned planner misses (autoplan.txt):
- c1: the isometric plane said as a "3D cube" whose four faces are #000000 (the towers' colours live on their child
  <i>, the plane's own fill and grid lines unsaid);
- c3: the conic aurora said as "a 900px donut chart, cyan 100%"; the glass cards said as three plain stats (no glass,
  no border, no blur, no lifted middle card); the italic serif "listens" unsaid;
- e1: the canvas said as loose lines (frame, gradient hero, selected button, handles all lost);
- e3: the @mention chip and reactions said "under" the message instead of inside / below it in a row.

## n145: terminal said line by line; round 12 written; first live builds c1, c2, c3 (2026-10-23, ~332k billed)

Planner: a `pre` block of several lines inside a region said part by part is ONE part, said line by line with its
coloured words in place, its line height and padding (round 11 e1's terminal output was collapsed into one run with its
✓/✗ marks placed apart, and came out scrambled). Rounds 1-11 re-planned: only round 11 e1 changes.

| page | likeness (v3) | billed | what was off |
|---|---|---|---|
| r11 e1 code editor (re-run) | 92 -> **95%** | ~101k | terminal output line by line with green/red marks, file tree in order, blue status bar: all right |
| c1 isometric city | 87% | ~80k | headline, chip, glow, ticker right; the isometric plane and towers built as one flat black polygon (no grid, no colours); ticker words invented. The score flatters it |
| c2 blend poster | 58% | ~72k | difference blend works (word inverts over disc and bar); the headline ~100px low and the blue bar runs through the copy |
| c3 aurora glass | 64% | ~79k | headline, copy, pill right; the aurora built as a teal rectangle (read as a donut chart), glass cards lost to plain stats, italic serif word upright |

Round 12 so far: **70%** over 3 pages (c1 87, c2 58, c3 64). Round 11 final: **83%** (e1 kept at 95).
Vitest: same 2 env failures; typecheck clean.
Next (planner, free first): an isometric plane said as its CSS (size, fill, grid, the turn) with each tower's lift and
colour read from its child; a conic gradient said as a conic gradient (blurred, spinning), never a donut chart; glass
cards said as cards (fill alpha, border, backdrop blur, lifted middle); an italic serif word inside a heading; check why
c2's headline sits low. Then first builds c4, c5, e1-e5.

## n146: isometric plane, conic glow, glass cards, giant headline place; first builds c4, c5, e1-e3 (2026-10-23, ~463k billed)

Planner (free): an isometric plane said as its CSS (plane size, fill, grid, outline, the turn; four towers with their
own lift and colour read from the child); a blurred conic gradient said as a soft glow (exact gradient, blur, opacity,
spin), never a donut chart; frosted glass stat cells said as separate glass cards (alpha fill, border, backdrop blur,
the middle card raised once); a heading word in its own face (italic Georgia) said; a giant multi-line headline
(160px+) says its type size and top-left; a wordless tilted solid block that read as a picture said as one opaque
block with its size before the turn; a marquee unit repeated exactly twice is now found (ticker words were invented);
a gradient-ring button said as a gradient border over a plain inside; a "lines" note over a region of painted parts
said part by part (e1 canvas). Rounds 1-11: only the 160px+ headline line changes (r1, r4, r8 one note each), none re-run.

| page | likeness (v3) | what was off |
|---|---|---|
| c1 isometric city (re-run) | 87 -> **90%** | plane, grid, four lifted coloured towers right; ticker words invented (fixed after, not re-run) |
| c2 blend poster (re-run x2) | 58 -> 72 -> **89%** | headline at its place; then the blue bar as a solid tilted block (was see-through with invented words) |
| c3 aurora glass (re-run) | 64 -> **84%** | aurora haze, italic serif "listens", glass cards right; middle card raised twice, CTA a gradient fill (both fixed after, not re-run) |
| c4 diagonal split (first) | **84%** | panels, hollow 09, route list right; nav and copy white on yellow, CTA a pill, sticker words on one line |
| c5 halftone mag (first) | **72%** | headline, drop cap, columns right; halftone dots lost (plain gradient), leaf a circle, masthead rule lost, issue lines moved left |
| e1 design tool (first) | **88%** | canvas frame, gradient hero, selected button, handles right; toolbar active tool and avatars lost, property fields unboxed |
| e2 Gantt timeline (first) | **31%** | group rows split from their tasks (groups on top, tasks below), bars not on their rows, diamond, progress and Today tag lost |
| e3 team chat (first) | 85% | mention said as a chip under the line, code block lost, composer moved to the top, channel header and replies link lost |

Round 12 so far: **78%** over 8 pages (e4, e5 not built yet). Vitest: same 2 env failures; typecheck clean.

## n147: grouped lists, Gantt rows, halftone, leaf, chat blocks, inks; round 12 complete (2026-10-23, ~438k billed)

Planner (free): a list whose group rows (bold, own fill) sit between task rows is said row by row in page order with
each row's look (the groups were built above all the tasks); Gantt bars say their row under the week head and top px
(rows with no bar stay empty), a see-through progress track, a turned-square milestone with its label, a bordered
elbow dependency, and the today line's ::before tag; a leaf (three round corners, one square) is said as a leaf, not a
disc; a halftone block says its dot layer and tile size verbatim; a small corner block inside big type says its corner
and line breaks, and a thick bottom rule is said; chat messages say their blocks in order (inline mention in the
sentence, a code block line by line, reaction pills, a replies link, a divider), the header above them and the
composer pinned at the bottom; a region whose ink is far from the page's says it, a short row of mixed inks says each;
a solid button says its exact fill, ink, size and corners; a round sticker says its words' line count; a note with no
sizes or colours over a region of painted parts goes part by part (e1 toolbar, properties). Rounds 1-11: notes gain
inks/button looks on most pages and ~20 regions go part by part; none re-run.

| page | likeness (v3) | what was off |
|---|---|---|
| e2 Gantt timeline (re-run) | 31 -> **73%** | groups between tasks, bars on their rows, progress track, milestone, Today tag all right; dependency hook a straight tick |
| e4 checkout (first) | **40%** | all content right, but the form built as a floating card and the summary as a card (target: flat full-height grey panel); City/State/ZIP row and floating labels lost |
| e5 users admin (first) | **81%** | bulk bar, selected rows, expanded row, pills, pager right; row lines dark instead of faint |
| c4 diagonal split (re-run) | 84 -> **91%** | dark nav word, near-black copy, square CTA, three-line sticker right; scroll mouse faint |
| c5 halftone mag (re-run) | 72 -> **77%** | halftone dots, leaf, masthead rule and corner lines right; headline and dek lost their bold |
| e1 design tool (re-run) | 88 -> **89%** | toolbar active tool, avatars, boxed X/Y/W/H fields right |
| e3 team chat (re-run) | 85 -> **83%** | header, inline mention, code block, reactions, replies link, composer at the bottom all right; score slightly lower (spacing), kept as the truer build |

Round 12 complete: **80%** average over 10 (c1 90, c2 89, c3 84, c4 91, c5 77, e1 89, e2 73, e3 83, e4 40, e5 81).
Vitest: same 2 env failures; typecheck clean.
Next: e4 checkout (flat split page: form on white, summary as a full-height grey panel, floating-label fields, 3-up
City/State/ZIP); c5 bold italic headline and bold dek; e5 faint row lines; then write round 13, harder.

## n148: flat side panels, boxed form fields, bold weights, true rule colours (2026-10-23, ~172k billed)

Planner (free): an unmarked flat panel filling one side of the page top to bottom is said in the page note as part of
the page (no mark), and each big part on it or beside it says it sits straight on that ground, NOT in a card; a form of
four or more bordered fields said only as grey lines is said part by part, each small label INSIDE its field box
(floating labels), fields sharing a top side by side; order-summary pictures of different colours say each colour; a
heading or line of copy set bold whose note never says its weight now says it (43 notes across rounds 1-12 gain it); a
part's border colour is read from its widest drawn side (bottom-only row lines were read from the unset top side, the
text colour, and built dark). Rounds 1-11 re-planned (bold notes, a few forms part by part, rule colours); none re-run.

| page | likeness | what was off |
|---|---|---|
| e4 checkout (re-run) | 40 -> **75%** | flat grey summary side, form on white, floating labels, 3-up City/State/ZIP, focused email ring all right; summary rows a little low |
| c5 halftone mag (re-run) | 77 -> **86%** | bold italic headline and bold dek right; folio lost |
| e5 users admin (re-run) | 81 -> **92%** | faint row lines right |

Round 12 now: **85%** average (c1 90, c2 89, c3 84, c4 91, c5 86, e1 89, e2 73, e3 83, e4 75, e5 92).
Vitest: same 2 env failures; typecheck clean.
