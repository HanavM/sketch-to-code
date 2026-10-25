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
