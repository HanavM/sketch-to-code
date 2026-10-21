# Likeness v3: score the build after one global zoom + offset (n33, 2026-10-21)

Why: round-2 settings (e3) was built nearly identical to its target, only ~8%
bigger and ~30px lower, and scored 6% overall (colour 0%, structure 0% lift):
on a sparse white page every row sat outside v2's 16px tolerance.

First try (dropped): score only windows with ink and widen the search to 32px.
Skeptic check `node tests/rounds/crossink.mjs <round>` (each target vs every
other target of its round) showed unrelated white pages scoring 50-83% lift.
Text texture matches text texture; it measured nothing.

Kept: find the single zoom (0.88-1.16) and offset (up to 128px) that best lays
the build's ink over the target's (coarse 80x56 ink maps, correlation), then
score colour and structure on the aligned build; each is the better of aligned
and unmoved. One transform for the whole page cannot fit an unrelated layout.

Unrelated pages, best lift per round (v2 structure / aligned structure):
round 1 7% / 7%, round 2 20% / 19%, round 3 15% / 8%.

Saved builds re-scored (picture lifts; overall uses the page's latest digest
layout where one exists, so older runs of the same page share it):

| build | colour v2 -> v3 | structure v2 -> v3 | overall v2 -> v3 |
|---|---|---|---|
| r2 e3 settings | 0 -> 31 | 0 -> 55 | 6 -> 36 |
| r1 e3 blog list | 0 -> 25 | 2 -> 46 | (no layout) |
| r1 e1 login | 0 -> 12 | 0 -> 31 | (no layout) |
| r1 c4 neon dark | 67 -> 81 | 34 -> 53 | (no layout) |
| r3 e3 calendar n31 / n31b | 5 / 5 -> 28 / 17 | 26 / 46 -> 67 / 77 | 25 / 32 -> 47 / 47 |
| r3 e5 analytics fixed | 59 -> 71 | 64 -> 64 | 65 -> 69 |
| r1 e4 contact (wrong copy, no labels, wider) | 0 -> 0 | 5 -> 5 | unchanged |
| r1 c5 editorial | 0 -> 0 | 0 -> 0 | unchanged |

The two calendar runs that swung 25 vs 32 on v2 both read 47 on v3: less
run-to-run noise. Bench digests now carry overall (v3), overallV2, overallV1,
colourAligned, structureAligned and align {scale, dx, dy}. Compare rounds on
the same version. Re-score saved side-by-sides free:
`node tests/rounds/rescore.mjs tests/rounds/*/built/*-cmp.png`.
