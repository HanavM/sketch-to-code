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

Side-by-sides: `out/round<r>/<id>/side-by-side.png` (target, first sketch, result).
Full numbers and every stroke: `out/round<r>/<id>/digest.json`.

Pages 3-5 (2026-10-27, n5): pricing LOOKS near-identical (colour 96%, structure 83%) but scores 50.5 because cards sit ~40px low and shorter; glass blobs kept every position (layout 77%) and scored 76.9, then a colour fix in words made it worse; settings drew the hand strokes into the page and invented a section header, 38.7. Running mean of 5: 57.9.

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
