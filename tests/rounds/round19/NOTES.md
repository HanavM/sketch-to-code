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
