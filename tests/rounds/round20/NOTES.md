# Round 20 (n197): harder than round 19, untuned first look

Creative: c1 riso poster (a two-colour misregistered headline in multiply blend, a halftone-dot sun, a tilted blue square
and a pink disc overprinting in multiply, a wobbling dashed sticker, a tilted tape strip, a dot-grain overlay), c2 brutal
grid (3px ruled boxes, a giant year with one orange digit, an inverted manifesto block, a vertical scrolling ticker, a
project list with one row inverted, a sideways label, an inline highlight and a blinking cursor, a hard-shadow button),
c3 aurora glass (three blurred drifting colour blobs, a gradient-text headline, three fanned frosted-glass cards with
backdrop blur), c4 paper cutout (a conic sun with two halo rings, three clip-path hill layers, a headline on an arched
text path, a perforated ticket stub with notched ends via mask), c5 tilted phone (a 3D-rotated phone in perspective, a
giant outline numeral behind it, floating chips, a marker highlight under two words, an SVG wave).
Everyday (denser apps): e1 week calendar (sidebar mini month, calendar list, 7-day x 12-hour grid, overlapping events,
selected event ring, now line, event popover), e2 team chat (workspace rail, channel list with badges, messages with
reactions, a code snippet, day divider, composer toolbar, typing line, thread panel), e3 spreadsheet (menu, toolbar,
formula bar, a 9-column grid with a selected range and active cell, negative cells red, a floating bar chart, sheet tabs,
selection sum), e4 checkout (stepper, address form with a field error, payment options, tilted card visual, order summary
with quantity badges and an applied coupon), e5 code review (dark PR header, tabs with counts, file tree with +/- counts,
unified diff with line numbers, syntax colour, an inline review comment holding a suggested change).

Measured: blank page scores 10-97% colour / 11-73% structure. Dry c1 drew 15 marks (untouched 0% likeness).

## n197: first live builds of all ten (2026-10-25, ~965k billed, 65.5 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 riso poster | **74%** | misregistered multiply headline, date, square, sticker right; the halftone-dot sun built as a shaded 3D pink sphere, tape not tilted, footer ink list invented ("black / gold") |
| c2 brutal grid | **72%** | ruled grid, nav, manifesto, ticker, list right; giant year built low and much bigger, the copy's inline highlight broke the line (rest of copy lost), cursor lost |
| c3 aurora glass | **88%** | blobs, gradient headline, three glass cards right |
| c4 paper cutout | **78%** | sun, hills, arched title, ticket built |
| c5 tilted phone | **66%** | phone tilt, outline 3, wave, chips built; marker highlight under "three taps." lost, phone shifted right over the numeral, "Sam paid" chip laid on the phone, list rows on the screen lost |
| e1 week calendar | **49%** | header, mini month, popover, now line right; hour labels, grid lines and all but one event lost (the selected one grey), "New event" moved under the list |
| e2 team chat | **74%** | three panes built |
| e3 spreadsheet | **75%** | grid, chart, bars built |
| e4 checkout | **77%** | form, error field, card, summary right; stepper missed |
| e5 code review | **95%** | near-identical; tabs and file tree counts slightly off |

Round 20: **75%** over 10 (round 19 started at 74 untuned). Bench says "failed: 0": all 10 built and scored.
Vitest: same 2 env failures; typecheck clean.
Next: a dot-screen disc (tiled small radial dots) is a halftone, never a shaded sphere; a calendar grid's absolutely
placed events each said with their own colour, place and size, plus hour labels and grid rules; an inline highlight keeps
the line flowing (span, not a block); a marker highlight under words (inset box-shadow); a giant type block keeps its size
and top-left.

## n198: grid lines, events laid over the grid, halftone dots, inline marks, the phone's place (2026-10-25, ~370k billed)

Planner (words only, no hand plans): two stacked repeating line layers are said as a ruled grid (rows every 64px AND
columns every 138.5px), not one merged stripe list; untagged absolutely placed blocks laid over a region from outside it
(the week's events, the hour labels beside the grid) become that region's parts; a round block tiled with small radial
dots is a halftone dot screen, never a lit sphere; words with their own fill inside running copy stay IN the line as an
inline span, an inset box-shadow under words is a marker stripe, a blinking inline-block caret is said; a 3D phone's
stage keeps its own size and the body its offset inside it, see-through screen rows are kept; a 50%-only keyframe bobs
(not scrolls) and a small bobbing card says its own place and that it sits on top.
Other rounds re-planned: only rounds 10 and 19 change ('fading' to 'blinking').

| page | before | after | what changed |
|---|---|---|---|
| c1 riso poster | 74% | **90%** | the sun is now a pink dot screen |
| c5 tilted phone | 66% | **89%** | marker stripe, phone in place, screen rows, chips beside the phone |
| e1 week calendar | 49% | **68%** | hour labels, grid lines and all eight events built; the mini month still floats as a picker, the selected event grey |
| c2 brutal grid | 72% | 67% | highlight and caret now in the line; the year still built low and big, the manifesto copy invented |

Round 20: **80%** (was 75). Vitest same 2 env failures; typecheck clean.
Next: the giant year says its top-left; the manifesto paragraph quoted whole; the mini month is a plain sidebar calendar
(not a floating picker); the selected event keeps its indigo fill and ring.

## n199: the giant year's place, quoted manifesto, the sidebar month and selected event (2026-10-25, ~302k billed)

Planner (words only): a 200-299px one-line word in a padded box now says its box's top-left, padding, tight line-height
and letter-spacing (only round 20 c2 changes); a block with a heading and its own running copy quotes the copy whole
(round 20 c2 manifesto, round 1 c5 sidebar); a turned word that is the box's only part is said as one part; a 7-column
day grid in the flow with no presets, buttons or shadow is a sidebar month, not a floating picker; a dark-filled event
card with a left edge keeps its fill and its selection ring; a region's own leading button is said first with its look
and place; a ruled grid states its left and right edges so the label gutter can't push it right.

| page | before | after | what changed |
|---|---|---|---|
| c2 brutal grid | 67% | **92%** | the year at its top-left, the manifesto copy word for word |
| e1 week calendar | 68% | **76%** | sidebar month in place, selected event indigo with its ring, New event on top, grid at x 310 (a first try at 61% had the grid pushed 24px right; the edge note fixed it) |

Round 20: **83%** (was 80). Vitest same 2 env failures; typecheck clean.
Next: e2 team chat 74, e3 spreadsheet 75, e4 checkout 77, c4 paper cutout 78; e1 day heads left-aligned (target centred).

## n200: count badges, thread avatars and divider, boxed code line (2026-10-25, ~60k billed)

Planner (words only): a list row's small filled count pill is said with its colour at the row's right end (round 20 e2
and round 12 e3 channel badges, built grey or as bare numbers); a thumbnail list whose thumbnails differ says each one's
colour, a long last line sits under the name (not at the right), and a divider between items is said in place (round 20
e2 and round 16 e4 thread panels); a one-line monospace line with its own fill or border is a code box; plain dark body
copy in a message is no longer called a "link line". Re-planned all rounds: only round 12 e3, round 16 e4 and round 20
e1 (an id dropped from a note), e2 change.

| page | before | after | what changed |
|---|---|---|---|
| e2 team chat | 74% | **77%** | red count badges, the code snippet boxed, thread avatars in their own colours with the "6 replies" rule |

Round 20: **84%** (was 83). Vitest same 2 env failures; typecheck clean.
Next: e2 composer (toolbar row, green send button, typing line under it) and channel pane fill; e3 toolbar look 76;
c4 paper cutout 78 (structure 64); e4 stepper is right as built (the target's step dots are inline and small).

## n201: the composer as its own box, the typing line under it, the channel pane's exact fill (2026-10-25, ~87k billed)

Planner (words only): a bordered, rounded region holding a format bar, a placeholder and a textless filled block is a
message composer, said with its size and place, the bar and its rule, the placeholder, and the send button's size,
colour and corner; a short line just under it is said to sit below it (round 20 e2: built above). A big dark block with
light text now gives its exact hex (round 20 e2 channel pane #2a2650 built as a bright indigo). Re-planned all rounds:
rounds 1, 5, 9, 12, 16 only gain the exact hex of a dark panel; round 20 e2 changes.

| page | before | after | what changed |
|---|---|---|---|
| e2 team chat | 77% | **84%** | composer 100px tall with its format bar, green send button, "Ada is typing…" under it; channel pane dark |

Round 20: **85%** (was 84). Vitest same 2 env failures; typecheck clean.
Next: e3 spreadsheet 76 (colour 65: toolbar and header fills), e4 checkout 77, e1 week calendar 77, c4 paper cutout 78 (structure 64).

## n202: an arched title, a shaded sun, a real ticket (2026-10-25, ~93k billed)

Planner (words only): words on an open curve (an SVG textPath on a quadratic or cubic bend) are an ARCHED title, said
with the exact svg box, viewBox and path, never a ring (round 20 c4: "M20,230 Q350,20 680,230" read as a ring of radius
0, built as a full circle of huge letters); a smooth conic blend over a whole disc with no hole is a shaded sun with its
flat box-shadow halo bands, not a donut chart (built as a coral ring); a card with notched ends (a radial-gradient mask),
a dashed tear line and a sideways stub is said as a ticket: main part lines in order, tear line, vertical stub text,
notches. Re-planned all rounds: only round 20 c4 changes (a first try also turned round 19's rose window panel into a
disc; the sun rule now needs the disc to be the whole block).

| page | before | after | what changed |
|---|---|---|---|
| c4 paper cutout | 78% | **96%** | title on its arch, conic sun with two halo rings, ticket with stub, tear line and notches, dark Book button |

Round 20: **87%** (was 85). Vitest same 2 env failures; build clean.
Next: e3 spreadsheet 76 (colour 65: toolbar, header row and tab bar fills built blue), e4 checkout 77, e1 week calendar 77.

## n203: full-width bars say their exact fill, toolbar items their own place and look (2026-10-25, ~68k billed)

Planner (words only): a filled bar across the page now gives its exact hex next to the colour name (round 20 e3 toolbar
and sheet-tab bar, said only "pale blue-grey", were built a bluer tint); a row of items packed at the left of a bar says
where each item starts and, when they share one look, its weight, size and ink (toolbar built cramped and thin grey,
target bold #444 about 22px apart); a selected item with a fill says its size and corners (the sheet tab is rounded
only at the bottom; a round "Sign in" is a fully rounded pill). Re-planned all rounds: rounds 5, 6, 7, 9, 11-16, 18
and 20 gain these words on their top bars, toolbars, tab rows and status bars; no marks changed.

| page | before | after | what changed |
|---|---|---|---|
| e3 spreadsheet | 75% | **76%** | toolbar and tab bar the right grey, toolbar items bold and spaced, tab rounded at the bottom; layout 83 to 90 |

Round 20 holds at about **87%**. Vitest same 2 env failures; typecheck clean after build.
Next: e4 checkout 77 (summary title lost, card visual squat), e1 week calendar 76; e3 header labels built right-aligned.
