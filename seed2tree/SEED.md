# SEED — sketch-to-code

> **DRAFT written by Claude from the README and docs/findings.md (2026-10-15).
> Replace any of this with your own outline.** This file is yours: the gardener
> reads it from `main` every run and never edits it.

owner_boost: 1.0        # raise to make this garden win more runs than fashion

## The final product

Draw on your running app and it edits your source. A developer runs
`npx sketch-to-code init` on any Vite + React project, presses Alt+D, and
sketches on the live page: circle + "red", scribble to delete, a box with
"cancel" to add a button, a wireframe sketch of a whole new section. The
change lands in their real `.tsx`, verified against the live DOM, with a
one-step revert. It feels faster than typing a prompt, and it works first
time on a stranger's project.

## Technical direction

- Keep the deterministic spine: ink analysis → DOM grounding (data-s2c
  stamps) → typed intent → Claude Code edits → DOM verification. The model
  reads handwriting and writes code; it never guesses geometry.
- Measure before changing: the sketch benchmark (`tests/bench`) is the
  ruler, and its primary metric should score structure, content and order,
  not IoU (see docs/findings.md).
- "Draw less, type more": shapes for structure, words for content.
- Onboarding (`init`, `doctor`) must work on real third-party repos.

## Definition of done

1. A stranger can go from `npx sketch-to-code init` to a successful edit on
   their own Vite + React app in under 5 minutes, verified on ≥ 5 real
   open-source projects.
2. The benchmark (with the new structure/content/order metric) passes ≥ 80%
   of its pages across 3 repeated runs.
3. The known bugs in docs/findings.md (reading dies on reload, stale
   component library outliving `git clean`) are fixed with tests.
4. A README + 60-second demo script good enough for a public launch
   (the launch itself is yours to do).

## Out of scope / don't touch

- Non-Vite frameworks (Next.js etc.) until the above is done.
- Publishing to npm or making the repo public — ask me.
