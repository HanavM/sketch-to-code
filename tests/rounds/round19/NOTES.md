# Round 19 (n190): harder than round 18, untuned first look

Creative: c1 stained glass (an arched window of clip-path panes and a conic rose under slow, blurred, faint rotating light
rays; an italic serif headline in screen blend with one hollow word; a vertical caption), c2 type sculpture (three giant
overlapping words in three faces — heavy caps, hollow italic serif, gradient-filled caps — round a gradient orb that sits
BEHIND them, a vertical word turned 180deg, a tilted black marquee ribbon, a spinning text-on-a-circle badge), c3 lantern
night (five swaying radial-gradient lanterns hung on strings, a glowing moon, two layered clip-path hill lines, a
flickering two-line neon sign, glass pills), c4 vinyl sleeve (a halftone-dot sleeve tilted with a hard shadow, a spinning
grooved record half out of it, a round label, a tonearm, vertical serif artist name, dashed tracklist, animated EQ bars),
c5 magazine cover (a cream terrazzo cover with a solid masthead whose right half turns hollow over the figure, cover lines
in three faces, a tilted price badge in a spinning circle-text ring, a barcode, side copy).
Everyday (denser apps): e1 flight seat map (passenger tabs, step pills, legend, 11-row seat grid in 4 states, exit marks,
dark tooltip, fare summary with warning), e2 team settings (sidebar, member table with role chips, status pills, 2FA
toggles, open row menu, role permission matrix of checkboxes), e3 cloud drive (storage bar, breadcrumb, 8-card file grid with
a selected card, context menu, details panel, upload toast), e4 order tracking (SVG street map with a done and a pending
route, pins, pulsing rider, ETA card; status timeline, rider card, items, totals), e5 invoice editor (focused input with an
open client dropdown, line items as inputs, totals, scaled PDF preview with a tilted DRAFT stamp).

Measured: blank page scores 17-98% colour / 10-71% structure. Dry-drawn 10/10 (untouched 2% likeness).

## n190: first live builds of all ten (2026-10-24/25, ~934k billed, 64.5 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 stained glass | **74%** | headline, lede, CTA, caption right; the faint blurred rays built as hard opaque cream spokes over the whole right half; the arch window built as a pill (bottom rounded too), its triangle pane lost, rose half dark |
| c2 type sculpture | **63%** | FORM, follows, TYPE, vertical word right; the orb painted OVER the words (target behind), the marquee ribbon lost its black band and sits too high |
| c3 lantern night | **81%** | hills, nav, sub, pills right; lanterns built as boxes with no strings or glow, moon grey not glowing cream, neon sign on one line with no glow, pills filled white not glass |
| c4 vinyl sleeve | **47%** | the halftone sleeve lost entirely, record label a square, tonearm a grey slab, record too big, EQ bars single colour |
| c5 magazine cover | **76%** | layout right; the cream cover fill lost (terrazzo dots built huge on the dark page), masthead built all hollow, side heading lost, circle-text ring lost |
| e1 seat picker | **91%** | near-identical; two step pills blank, route line "LHR LIS" merged |
| e2 team settings | **62%** | table and menu right; page heading and sub-line lost, checkboxes pale (target solid purple), 2FA toggles and role chips lost |
| e3 cloud drive | **85%** | grid, menu, details, toast right; storage bar and view toggle lost, toast words cut |
| e4 order tracking | **89%** | map, route, timeline right; ETA card text small, rider pulse lost, timeline rail lost |
| e5 invoice editor | **71%** | preview right; the "Bill to" label and focused input lost under the dropdown, line-item header lost, stamp not tilted, preview table rows misplaced |

Round 19: **74%** over 10 (round 18 started at 76 over 10 untuned). Bench says "failed: 1": all 10 built and scored.
Vitest: same 2 env failures; typecheck clean.
Next: an element said to sit BEHIND others keeps its stacking (c2 orb); round lanterns on strings with glow; a halftone
dot pattern fill (c4 sleeve, c5 terrazzo) said as a repeating dot background on its own block's fill; faint blurred rays
keep their low alpha and blur; arch tops (round top only); a page heading and its sub-line in apps; solid checkboxes and toggles.

## n191: halftone screens, records, an orb behind words, marquee ribbons, app headings, solid checkboxes and switches (2026-10-25, ~208k billed)

Planner now says: a hard-stop dot gradient TILED small on its own solid fill as a halftone dot screen (fill, tile, tilt,
hard shadow); a round block of fine repeating rings as a vinyl record (grooves, round, spin) with a ROUND label chip; a
sphere that later words cross as sitting BEHIND them; a scrolling marquee's solid ribbon and its letters' own colour; a
region's own heading and sub-line with size, ink and place; table cells holding a solid ticked checkbox, an ON/OFF switch
(track plus ::after knob) or an outlined chip, said short per cell with their look said once after the rows.
Rounds 1-18 re-planned: 6 rounds gain ribbon or heading wording (no other change).

| page | before | after | what changed / still off |
|---|---|---|---|
| c2 type sculpture | 63% | **87%** | orb behind the words, black ribbon built |
| c4 vinyl sleeve | 47% | **78%** | halftone sleeve tilted with its hard shadow, grooved record; record sits over the sleeve (target under), label fell out of the record, tonearm a slab, "TIDE" lost |
| e2 team settings | 62% | **66%** | heading, sub-line, switches, chips, solid checkboxes all built; matrix card frame and logo square lost, menu wraps |

Round 19: **80%** over 10 (was 74). Vitest: same 2 env failures; typecheck clean.

## n192: faint blurred rays, an arch window with cut panes, a record under its sleeve, a tonearm rod, two-colour bars (2026-10-25, ~211k billed)

Planner now says: a repeating conic sunburst keeps each stop's alpha (FAINT, "at only 16% opacity") and a clear stop as
`transparent`, its blur and its slow spin; round top corners over square bottom ones as an ARCH (border-radius R R 0 0,
overflow hidden), and a part cut by `clip-path: polygon(...)` with that polygon (a triangle, a slanted pane); a block that
later solid blocks partly cover sits BEHIND them (set first, lower z-index); a big round label inside a record as a ROUND
LABEL disc at its dead centre, and a multi-line chip's lines one by one; a thin rod with a round ::before knob as a THIN ROD
(size, gradient, turn about its end, knob size and ring); bars whose two colours take turns said as alternating; a hollow
word no longer "null #000000". Rounds 1-18 re-planned: round 9 (record label, round) and round 16 (sunburst behind its disc).

| page | before | after | what changed / still off |
|---|---|---|---|
| c1 stained glass | 74% | **91%** | rays faint, blurred, turning, behind the arch; arch top, triangle and slanted panes all built; the rose half-dark |
| c4 vinyl sleeve | 78% | **77%** | record now UNDER the sleeve, label round, EQ bars orange/blue; but the label sits on the sleeve (left of the record's centre), the tonearm still a wide slab, "LOW TIDE" on one line |

Round 19: **81%** over 10 (was 80). Vitest: same 2 env failures; typecheck clean.

## n193: a tonearm drawn as a thin stroke, a record drawn as a circle with its label on it, two-line chips kept (2026-10-25, ~187k billed)

The record's label was built on the sleeve: its note said "ON it (inside the block...)" right after naming the sleeve it
sits behind, so "the block" read as the sleeve. Now a round label is said ON THIS disc (a child of this 520px block, not of
any block it touches) with its centre in page px. The tonearm was drawn as a box round its turned bounds (183x325), and the
build kept that width; it is now drawn as a thin four-point outline along the rod itself. The record was drawn as a box, so
the build scaffolded a square record path and kept it; it is now drawn as a circle. A chip's two lines are said "LOW / TIDE"
with a line break between them (a run had dropped "TIDE"). Rounds 1-18 not re-planned this step (only round 19 c4 changed).

| page | before | after | what changed / still off |
|---|---|---|---|
| c4 vinyl sleeve | 77% | **90%** (run 1 86%: square record, TIDE lost) | thin tonearm with knob, label dead centre of a round record, LOW over TIDE; EQ bars pulse at mixed heights (target caught at full height) |

Round 19: **83%** over 10 (was 81). Vitest: same 2 env failures; typecheck clean.

## n194: a card's own fields beside the regions in it, focus glows, tilted parts, a titled table card, sized controls (2026-10-25, ~175k billed)

The invoice form was said only as "white card": it holds three nested regions (dropdown, line items, totals), so its own
Bill to label, focused input and date fields were never said and the dropdown was built over where they belong. A bare
card note over a region with nested regions now also says its own parts part by part (the nested ones sit over them).
A field with a 0 0 0 Npx box-shadow is said as a FOCUS GLOW (a selected card as a SELECTION GLOW). A part turned on the
page (the DRAFT stamp) is said at its own unturned size, centred where it shows, with its rotate(); its turned bounds had
been said as a level box. A table inside a bordered rounded card is said as that card with its titled header band; a row of
controls said as bare words gets each control's size and place; an open menu's options stay on one line; a brand's small
gradient logo square before its name is said. Rounds 1, 3, 7, 14, 16, 17 re-planned (one region each gains this wording).

| page | before | after | what changed / still off |
|---|---|---|---|
| e5 invoice editor | 71% | **83%** | Bill to label, focused input with glow, date fields, tilted DRAFT stamp, preview rows in place; Send button blue (target green), dropdown's last row clipped |
| e2 team settings | 66% | **73%** | matrix card with its header band, wide invite field, logo square, menu on one line; the Invited pill built dark rust (target pale amber) |

Round 19: **85%** over 10 (was 83). Vitest: same 2 env failures; typecheck clean.
