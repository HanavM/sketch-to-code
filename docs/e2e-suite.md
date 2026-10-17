# The e2e suite: what costs money, what is green, what was hollow

s2c-034, 2026-10-17, cloud container (Linux, Chromium 1194 aliased as 1234, Node 22).
One vite dev server per port the files expect (5199, 5203, 5206, 5211–5216, 5237, 5240),
`examples/demo-app/src` restored between files, `ANTHROPIC_BASE_URL` unset for the
test and the servers.

## Classification

**Paid** (a real model reads or edits; never run them by accident):
`interpret-smoke`, `live-run`, `live-modify`, `live-add`, `live-design`,
`live-ribbon`, `live-ribbon-multi`, `live-screenshot`, `live-swap`,
`live-fidelity` (step 6 only; 1–5 are zero-token), **`live-ink-track`**.

`live-ink-track` carries no "paid" marker anywhere in the file and looks like
a geometry check. It presses ▶ Run without stubbing `/@s2c/run`, so it spends a
real reading and a real edit (~3 min). In this sweep it did that once, because
the dev server in this container could reach a model. Its header now says PAID.

**Zero-token** (everything else under `tests/e2e/` and `packages/cli/tests/e2e/`):
42 + 4 files.

## Results (zero-token files, on `seed2tree` after this change)

| result | files |
|---|---|
| green | codegen-private-state, live-api, live-ask, live-auto, live-commands, live-data, live-dock, live-endpoint, live-fill\*, live-form, live-history, live-hud, live-ide-overlay, live-image, live-ink-follow\*, live-instant\*, live-keymap, live-label, live-library, live-libsearch, live-misread, live-noterefs, live-notes, live-paint, live-pen, live-preview, live-probe-click, live-probe, live-props, live-reload-reading, live-responsive, live-reuse, live-rules, live-style\*, live-surface, live-tweak; cli: walkthrough-noncoder, sketch-no-install |
| red, filed as s2c-036 | live-canva (expects the old `div · W×H` selection line; the bar now says "picked up the box …"), live-infer (a box drawn in empty space reads as markup on "Overview": no interpret fires), live-lasso (the extract caused no full reload, so its survival checks prove nothing), live-saywhat (a selector returns null), live-runs-viewer (expects 3 fixture runs; this container has none), live-ide-bridge (needs `packages/vscode-extension/out`, which `tsc -b` doesn't build) |
| not run this sweep | init-real-project, onboard-real-projects (green 2 h earlier in s2c-005, no code they touch changed) |

\* red, or hollow, before this change. See below.

## What was hollow

The page opens with the pen **on** (s2c-010), and Alt+D **toggles** it. Thirteen
files pressed Alt+D once "to start drawing", which paused the pen. Their strokes
never landed:

- `live-ink-track`, `live-ink-follow`: red ("expected 1 ink path, got 0").
- `live-instant`, gate step: **green while asserting nothing.** "A scratch-out on
  a card is not etched" passed because there was no scratch-out. ▶ Run was
  disabled, so the click did nothing and 0 etched.
- All 9 paid drivers above (`live-run`, `live-modify`, `live-add`, `live-design`,
  `live-swap`, `live-ribbon*`, `live-screenshot`, `live-fidelity` step 6): `npm run
  e2e` could not have passed since the pen-on default shipped. Not re-run (paid);
  `node --check` only.

Fix: `tests/e2e/lib/pen.mjs`. `ensureDraw(page)` reads the host's `data-mode`
and only toggles when the pen is off, then asserts it is on.
`assertInk(page, n, what)` fails when a stroke did not land. Used in all 13
files; `assertInk` after the strokes in ink-follow and instant's gate.
Files that already had a mode-aware loop (ask, auto, hud, keymap, label, notes,
preview, reload-reading) were left alone.

## The one product bug: the bar jumped mid-choice

`live-fill` and `live-style` were red on a real regression. Since 524e59b the bar
hides 🎚 while the result settings are at their defaults. Open the panel (⌘K) and
pick "outline": the setting is no longer default, 🎚 un-tucks, the centred bar
grows 515 → 670 px and moves 77 px left, and the anchored panel slides with it.
The next option you meant to click is no longer under the cursor.
Fix (overlay, 6 lines): 🎚 stays on the bar while its panel is open, so the bar
changes size once, when the panel opens, not during the choice.
Red before (both files, same numbers), green after.

## Leaks noticed

- `live-api`, `live-endpoint`, `live-form`, `live-saywhat` leave
  `examples/demo-app/server/api/users.ts` untracked. Restore only touches `src/`.
- The Done sentence read "added the a wavy decorative ribbon …" in the one real
  run: the s2c-032 phrasing doubled an article when the model's description
  started with "a". Fixed in `explain.ts` (`noArticle`), 1 unit test.
