# Hand-sketch baseline (goal 2026-10-27, node n1)

Rules: the sketcher sees only `ref/<id>.png`, decides every stroke and note,
and draws through the real overlay (`tests/hand/session.mjs`, Playwright
pointer events, one command at a time: draw big parts, look, fix). The tool is
as it stood at try/n3-vocabulary 8121cbe. Likeness is the unchanged v3 scorer.
The old auto-planner is not used.

Baseline set (10 pool pages, 5 creative + 5 everyday, easy to harder):
r1 c1-sunset-hero, r1 e1-login, r1 e2-pricing, r2 c3-glass-blobs,
r2 e3-settings, r5 c5-bento, r5 e5-data-grid, r8 c2-orbit-type,
r8 e4-seat-booking, r12 c4-diagonal-split.

## Per page

| page | likeness | strokes | pts/stroke | simple | ink px | erased | words | notes | longest | sketch s | first read s | build s | total s | fixes | billed tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r1 c1-sunset-hero | 52.1 | 8 | 3.5 | 100% | 5036 | 0 | 41 | 7 | 10 | 66 | 75 | 139+23 | 291 | 1 | 60,222 |
| r1 e1-login | 71.1 | 7 | 3.7 | 100% | 4443 | 0 | 25 | 7 | 7 | 37 | 67 | 522 | 600 | 0 | 101,705 |
| r1 e2-pricing | 50.5 | 5 | 3.8 | 100% | 5196 | 0 | 50 | 5 | 16 | 37 | 45 | 98 | 153 | 0 | 39,065 |
| r2 c3-glass-blobs | 76.9 | 9 | 5.0 | 100% | 7411 | 0 | 49 | 10 | 12 | 53 | 78 | 228+131 | 468 | 1 | 100,705 |
| r2 e3-settings | 38.7 | 10 | 3.8 | 100% | 2968 | 0 | 33 | 6 | 13 | 27 | 64 | 508 | 581 | 0 | 116,422 |
| r5 c5-bento | 81.3 | 10 | 5.9 | 100% | 11071 | 0 | 35 | 8 | 7 | 59 | 88 | 112 | 207 | 0 | 47,146 |
| r5 e5-data-grid | 25 | 6 | 3 | 100% | 6428 | 0 | 45 | 8 | 12 | 49 | 81 | 137+92 | 338 | 1 | 68,188 |
| r8 c2-orbit-type | 71 | 10 | 6.1 | 100% | 6770 | 0 | 32 | 7 | 7 | 39 | 78 | 230 | 316 | 0 | 62,463 |
| r8 e4-seat-booking | 14.3 | 10 | 3.9 | 100% | 11179 | 0 | 47 | 8 | 15 | 60 | 109 | 156+59 | 357 | 1 | 82,820 |
| r12 c4-diagonal-split | 49.7 | 9 | 4.7 | 100% | 6168 | 0 | 52 | 9 | 8 | 45 | 124 | 387+193 | 743 | 1 | 130,547 |

Side-by-sides: `out/round<r>/<id>/side-by-side.png` (target, first sketch, result).
Full numbers and every stroke: `out/round<r>/<id>/digest.json`.

Pages 3-5 (2026-10-27, n5): pricing LOOKS near-identical (colour 96%, structure 83%) but scores 50.5 because cards sit ~40px low and shorter; glass blobs kept every position (layout 77%) and scored 76.9, then a colour fix in words made it worse; settings drew the hand strokes into the page and invented a section header, 38.7. Running mean of 5: 57.9.

Pages 6-10 (2026-10-28, n6): bento 81.3 (every tile kept where drawn, layout 98%); data grid 25.0 (looks right, but invented numbers and a 40px row drift, layout 24%); orbit type 71.0 (my wobbly circles became a lumpy blob and a polygon ring); seat booking 14.3 (seat map shrank to content, ignored the drawn blocks, dark theme invented); diagonal split 49.7 (a box drawn around the big 09 became a framed card, and a fix pasted raw ink into the page).

**Baseline result (10 pages): mean likeness 53.1, median 9 strokes, 43 words, 5.8 minutes.** That is about 37 points below the old 90% (which used ~1,250 words of DOM-derived notes a page). Effort is already inside the goal (20 strokes, 50 words); likeness is the whole gap. The biggest losses all trace to three gaps: drawn position and size not kept (#1, #2, #16), hand ink pasted literally into the page (#9, #14, #17), and a box read as a visible card rather than an area (#17).

Honest read so far: both builds LOOK close (colour 88% and 99%, structure 80%
and 98%), but the layout part of v3 (regions in place) is 34% and 44%: the
tool moves things off where they were drawn (the login card re-centred 90px
lower; the sunset hero pushed down 100px after the headline grew). Far below
the old 90%, which came from DOM-derived notes of ~1,250 words a page.

## Missing features found (running list)

| # | gap | found on | built | helped? |
|---|---|---|---|---|
| 1 | Drawn position is not kept: the build re-centres or reflows blocks away from where they were drawn | c1, e1 | — | — |
| 2 | Line length does not set size: a headline line drawn 850px wide came out as ~700px one-line text; it took a box plus "much bigger" to fix | c1 | — | — |
| 3 | A second short line under a headline (its wrap) was read as a new invented tagline | c1 | — | — |
| 4 | Nothing shows what the tool understood until Run (~45-75 s to the first read-back) | c1, e1 | — | — |
| 5 | Note chips land beside and over the marks; which mark a note belongs to is unclear ("note attached — on these 4 strokes") | c1, e1 | — | — |
| 6 | After a fix run, the card said "I couldn't add what you drew, one mark matched nothing" although the change worked: misleading feedback that also covers the page | c1 | — | — |
| 7 | Slow, costly builds for simple pages: a login card took 522 s and ~100k tokens | e1 | — | — |
| 8 | No colour from the drawing: button text colour, gradient stops all had to be words | c1 | — | — |
| 9 | Hand strokes rendered literally into the page: wobbly lines across the tabs, toggles and a button filled as raw ink shapes | e3 | — | — |
| 10 | A short line under a row label (meaning "its description") was read as a new section header with invented text | e3 | — | — |
| 11 | Pinned marks (toggles) stay where drawn while the rows around them reflow, so they misalign with their rows | e3 | — | — |
| 12 | Colour fixes by words overshoot: "glows much brighter" turned pink and cyan into white; no way to point at a colour | c3 | — | — |
| 13 | A one-line subtitle drawn 280px wide wrapped onto two lines (line length still does not set width) | e2 | — | — |
| 14 | Hand-drawn circles kept their wobble: the orange disc came out as a lumpy blob and the ring as a polygon | r8 c2 | — | — |
| 15 | Invented content: the grid's names and numbers and the orbit blurb were made up, not left as placeholders or asked for | r5 e5, r8 c2 | — | — |
| 16 | Drawn blocks ignored for size: the seat map shrank to a small grid inside the big blocks I drew; cards shrank to their content | r8 e4 | — | — |
| 17 | A box drawn to mark an area (where the big 09 goes) became a visible framed card; after a fix, raw ink lines were pasted into the page | r12 c4 | — | — |
| 18 | No default theme from the picture: with no colour words, a light page came out dark | r8 e4 | — | — |
| 19 | Two short stacked lines (NOV / 14-16) read as a small label plus a date, not one big two-line block | r8 c2 | — | — |
