# Round 3 results (hardest pages)

## Live 2026-10-21, everyday pages e1, e3, e5 (n20)
Built from the auto plans on try/n3-vocabulary, 127k billed tokens for 3 pages (one build turn each, no repairs).

| page | likeness v2 | regions | what came out | gap |
|---|---|---|---|---|
| e1 users table | 30% | 4/5 | heading, invite button, search + 2 filters, 5-column table, 7 rows, coloured status pills: very close | pager had no words, so its squiggle was built as a zigzag divider |
| e3 calendar | 21% | 3/4 | title, Prev, New event, 7x5 month grid, coloured event chips, day 11 highlighted | Today / Next missing (unmarked, never said); events on wrong days (days never said) |
| e5 analytics | 26% | 5/5 | heading, range dropdown, 4 stat cards with exact numbers, top-pages list | bar chart card built with no visible bars |

Side by sides: `built/*-live-cmp.png`. Visually these are the closest builds yet; the v2 likeness number
stays low on light app pages because colour/blank calibration leaves little lift.

Fixes after this run (free, re-run pending): pager note ("Showing 1–7 of 48", page buttons, current page);
a marked button names same-looking unmarked buttons beside it ("‹ Prev", "Today", "Next ›");
calendar events carry their days; bar chart note gives relative heights; codegen rule that chart bars
are never empty (explicit px heights). Bench now saves each page's built source to out/runs/<id>/src.

## Live re-run 2026-10-21, e1, e3, e5 after the n20 fixes (n28)
156k billed for 3 pages, then e5 again 34k after the empty-fill check.

| page | before (n20) | after (n28) | what changed |
|---|---|---|---|
| e1 users table | 30% | 26% | pager now "Showing 1–7 of 48", 1 2 3 Next: fixed. Score dip is layout (content sits a little lower/narrower); title region missed positionally |
| e3 calendar | 21% | 31% | ‹ Prev, Today, Next › all present; events on their days (Standup Mondays, Design review 4th, Launch 6th, 1:1 + Planning 11th). Retro dropped, Offsite as one bar over 19–20 |
| e5 analytics | 26% | 26% → **64%** | the prompt rule alone did not fix the empty chart (bars were % height inside an auto-height column = 0px). New zero-token check after each build: filled boxes rendering 0 high/wide fail verify and get a repair turn (5k). Bars now visible and rising like the target |

Side by sides: `built/*-n28-cmp.png`, `built/e5-analytics-n28-fixed-cmp.png`.

## Live re-run 2026-10-21, e3 after the n29 plan fix
40.6k billed, one build turn, 9 tool calls (now logged: 1 Grep, 3 Glob, 4 Reads, 1 Write).
The plan had cut the list at 6 events, so "Retro" was never said; it now names every event and says
"a chip on each day" for events on several days. Built: all 13 chips present, Retro on 25, Offsite as two
chips on 19 and 20. Likeness 24% (was 31%): the month starts on the wrong weekday (Nov 1 drawn under Mon,
target has it under Sun with Oct 26-31 greyed in), which shifts every chip one column and adds a sixth row;
chips are pale tints where the target has solid fills with white text. Side by side: `built/e3-calendar-n29-cmp.png`.
Next: the plan should say which weekday day 1 falls on, that leading days are from the previous month, and
solid vs pale chips.

## Live re-run 2026-10-21, e3 after the n30 plan fix

The calendar note now says where the month sits ("day 1 under Sun, first row starts with
last month's 26–31, last box is 29") and that chips are solid with white text. Built: Nov 1
under Sunday with Oct 26–31 greyed, 5 weeks (was 6), every chip solid and on its day.
Likeness 24% → 43% (v2). Region score still 22%: the header bar came out higher and smaller
than drawn, so title, ‹ Prev and + New event miss their boxes. The first attempt's reading
failed with "maximum number of turns (4)"; the re-run read fine. 43k tokens.
Side by side: `built/e3-calendar-n30-cmp.png`.

## Live 2026-10-21 (n37): first builds of the hardest creative pages

| page | likeness (v3) | effects kept | tokens | note |
|---|---|---|---|---|
| c1 layered peaks, first | 62% | gradient, huge type, overlap | 125k | ridges built as two rectangles with crossed lines (drawn as picture boxes) |
| c1 layered peaks, after fix | 67% | gradient, huge type, overlap | 65k | ridges now real jagged shapes; their colours come out swapped (red in front, purple behind) |
| c3 gradient orbit | 59% | all 6 (glow, gradient text, motion…) | 56k | rings drawn big but built off-centre, bottom right; planet tiny, top left |
| c5 blend editorial | 70% | 6 of 7 (no huge type) | ~99k | headline small and shifted right; side label landed on the photo |

Fixes this step:
- A cut-out (clip-path polygon) is drawn as its own outline, not as an X'd picture box. Only round-3 c1 changes.
- The build agent now sees only Read/Edit/Write/Glob/Grep. c1's first build spent 3 ToolSearch calls and a Skill call
  (112k for one turn); after the fix builds ran 52-56k.
- Dry check: c1's giant "SUMMIT" reads 293px (target 260). c4's narrow "01" still reads 177px for a 420px target: a
  two-letter word drawn as a level zigzag can only be ~1/3 as tall as it is wide.

Side by sides: `built/c1-layered-peaks-n37-first-cmp.png`, `built/c1-layered-peaks-cmp.png`, `built/c3-gradient-orbit-cmp.png`,
`built/c5-blend-editorial-cmp.png`.

## n38: orbit rings land on their drawing (2026-10-21)

| page | before | after | tokens | what changed |
|---|---|---|---|---|
| c3 gradient orbit | 59% | 63% (contract only), 67% (all fixes) | 72k + 60k | rings on centre, outline only; planet on its spot |

- Cause: rings were centred with translate(-50%,-50%) and spun with a rotate() keyframe, which replaces the translate,
  so they sat half their size down-right; the placement check passed them on the strength of the page wrapper.
- New check (shape-anchor): a pure drawn decoration must have a free-standing, textless element of about its size
  centred on it; each element stands for one shape. On the second run it caught both rings built at (0,0) and the
  repair turn (7k) moved them onto the drawing.
- Contract: animated shapes are placed with left/top from the region, never centred with transform; outline circle =
  border only. Scaffold: a shape asked for as an outline, ring or hollow is not filled.
- Left: headline gradient lacks the cyan end, button ~25px high, page black not near-black indigo.

Side by sides: `built/c3-gradient-orbit-n38-cmp.png` (contract only), `built/c3-gradient-orbit-n38b-cmp.png` (all fixes).

## n39: notes reach the mark they were typed on (2026-10-21)

| page | before | after | tokens | what changed |
|---|---|---|---|---|
| c1 layered peaks | 67% | **78%** | 65k | ridges now in the right order and colour (raspberry behind, purple in front); page yellow to orange like the target |
| c5 blend editorial | 70% | **81%** | 58k (+ one failed reading, ~17k) | giant two-line italic headline on the left, vertical side label up the page edge; blend over the photo |

- Cause (c1): both ridge notes were typed at their box centres, which both sit inside the near ridge, and focus measured
  distance to each stroke's bounding box, so each note reached both ridges and the colours swapped.
- Fixes: focus treats a closed non-box outline as its inside (a point in its box but outside the outline is as far as the
  edge); typed inside two nested outlines, the innermost wins; a note on one line of a giant (>=60px) multi-line heading
  reaches all its lines. The bench types non-box notes on the part of the mark no other mark covers (box notes stay
  centred), and multi-line heading notes on a line, not between lines. Planner names colours between the primaries
  (deep raspberry, dark pink, soft yellow, light orange, peach, pale lilac; never CSS keywords like crimson).
  A vertical label is drawn as one vertical squiggle (was specks in a 15px box).
- Focus diff over all 30 dry wires: only round-2 c3, c5 and round-3 c1, c3, c5 notes change; each change drops a
  neighbouring mark or adds a heading's own line.
- Left: c5's first reading hit "maximum number of turns (4)" again; button built as a pill (target an underlined link);
  c1 nav text white (target brown), sun glow softer.

Side by sides: `built/c1-layered-peaks-n39-cmp.png`, `built/c5-blend-editorial-n39-cmp.png`.

## n41 (2026-10-21): failed readings traced and fixed; first builds of c2 and c4

Traced 3 design readings of c5 (S2C_TRACE_READING): every reading's first answer is rejected
(wrapped as {"actions": {...}} or broken JSON), so a good reading already takes 3 turns. The failed
one then sent three good answers that lacked only the empty "unclear" field (its tool-call markup
swallowed it into "reading") and died at the 4-turn cap. Fixes: "unclear" no longer required,
markup cut off the reading text, turn cap 4 -> 6, reading time limit 120s -> 180s (readings run
60-75s with one retry), prompt says not to wrap the answer. After: 6 of 6 readings ok (2 of them
were missing "unclear" and would have been retried). The wrapped first answer still happens
(~25s and ~6k tokens per reading): a lead for later.

| page | likeness (v3) | effects kept | tokens | note |
|---|---|---|---|---|
| c2 kinetic marquee | 56% | bleed, huge type, motion, tilt (5/6, no overlap) | 73k | both tilted bands, star, words and video card right; page white not off-white, orange band came out red, body text larger and light |
| c4 brutal index | 65% | all 5 (hard shadow, huge type, mono, tilt, vertical) | 23k | three shadowed cards, stamp, footer right; "01" small (known: n40), black side rail lost (text only), card copy invented |

Side by sides: `built/c2-kinetic-marquee-n41-cmp.png`, `built/c4-brutal-index-n41-cmp.png`.
All 10 round-3 pages have now been built at least once.

## n42 (2026-10-21): brutal index keeps its rail and copy; failed readings salvaged in full

| page | before | after | tokens | what changed |
|---|---|---|---|---|
| c4 brutal index | 65% | **74%** | 30k (plus 31k on a run where the rail was still read as text colour, and 2 failed readings) | black side rail back with light text; all three cards carry the target's exact copy; all 7 regions placed |
| c2 kinetic marquee | 56% | 40% | 127k (build 60k + repair 56k) | orange band now red-orange (was red), but this run placed it over the black band, set the intro tiny and drew the reel as a crossed placeholder: one run, read as noise plus a lead |

- Planner: a titled card says its title and one short line (`"Manifesto", text "Websites should..."`); before it said
  `"Manifesto" and text` and the build invented copy. A filled block with light text says `near-black bar, light grey
  text` (a first try, `near-black, light grey text`, was read as near-black text on the page). On a band, the type's
  colour is said even when it is the page's. New colour `red-orange` (hue 9-22, strong) so #ff3d00 is no longer "red".
  Round 1/2 plan changes: card/stat titles split from their line, dark blocks name their light text.
- Readings: c4 failed twice with "Failed to provide valid structured output after 5 attempts". The model re-sent a
  good 2748-char answer whose only fault was `"unclear": ,`, but the CLI hands back a bad attempt cut to 2048 chars,
  so the salvage (n5) could not parse it, and the SDK then threw. The provider now rebuilds each attempt from the
  streamed tool input and keeps a salvaged answer when the SDK throws after it. Checked against the saved trace:
  salvaged 8 actions.
- Left: "01" built ~110px (target 420, n40); stamp not tilted; card titles not heavy Helvetica.

Side by sides: `built/c4-brutal-index-n42-cmp.png`, `built/c2-kinetic-marquee-n42-cmp.png`.

## n43 (2026-10-21): kinetic marquee 40% -> 84%

| page | before | after | tokens | what changed |
|---|---|---|---|---|
| c2 kinetic marquee | 56% (n41), 40% (n42) | **84%** | 79k (build 54k + repair 15k) | orange band back below the black one; intro copy at body size on two lines; the reel is a plain dark card with the orange dot, no crossed lines |

- Cause 1 (drawing): the bench drew a heading of several lines as one squiggle unless its block was over 140px tall,
  so the 2-line 30px intro (72px) was one 36px zigzag, read as a 52px one-line heading. The build could not fit it,
  and the repair shrank it to a tiny line. Several lines are now drawn as several lines whatever the height (wobble
  0.35 x the font). The reading now finds 2 lines at ~24px.
- Cause 2 (plan): a textless dark block is planned as a picture (an X'd box). The reel has the play circle on top of
  it, and the build drew the X. A picture block with another mark drawn on top of it is now a plain filled box.
  Plan changes: round-3 c2 reel and c5 dark half; rounds 1-2 unchanged (52/53 hand marks still matched).
- Left: page white (target off-white), intro light weight and a little small, reel corners square.

Side by side: `built/c2-kinetic-marquee-n43-cmp.png`.
