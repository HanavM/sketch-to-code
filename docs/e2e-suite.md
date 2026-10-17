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
| red, filed as s2c-036 (5 of 6 green since, see below) | live-canva (expects the old `div · W×H` selection line; the bar now says "picked up the box …"), live-infer (a box drawn in empty space reads as markup on "Overview": no interpret fires), live-lasso (the extract caused no full reload, so its survival checks prove nothing), live-saywhat (a selector returns null), live-runs-viewer (expects 3 fixture runs; this container has none), live-ide-bridge (needs `packages/vscode-extension/out`, which `tsc -b` doesn't build) |
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

## s2c-036: the six red files (2026-10-17, cloud container)

Run against fresh vite servers on 5199/5211/5215 with `ANTHROPIC_BASE_URL`
unset (it is **set** in this container; that is how s2c-034's accidental paid
reading happened). 5 of 6 green; 1 still red.

| file | cause | fix | now |
|---|---|---|---|
| live-infer | **Not a mode-inference bug.** Phases 1–2 were right. Phase 3 (a wordless circle round a nav link) gets s2c-020's bare-ring question, and pressing Alt+R again did nothing, because the question opens the note field focused and the note field swallows every key. **Product bug:** the question says "▶ Run again sends it as it is", and the keyboard path couldn't do it without an Esc nobody is told about (on a Mac, Alt+R typed "®" into the note). | `noteInput` keydown: Alt+R attaches what's typed (blank is discarded) and runs. The test now expects the question on phase 3 and answers it with Alt+R. live-ask gained step 2b (Alt+R straight from the focused note → 1 call, no notes, note closed). | green; red before the fix with the same test |
| live-canva | copy: the selection line became plain words in s2c-025 (`picked up the box …`, `it appears 3 times`, `2 picked up together`) | 3 regexes | green |
| live-lasso | Vite 7 sometimes hot-swaps the new import instead of full-reloading (0 or 1 reloads, varies by run), so "the extract caused no reload" failed on timing | when Vite doesn't reload, the test reloads by hand and asserts the same two promises (still in tweak, receipt still there) | green on both paths (seen 0 and 1 reloads) |
| live-runs-viewer | assumed the owner's Mac's 40+ run bundles; a fresh clone has none. Also still clicked a `button.reuse` that has been an `a.reuse` link since d13d837 | writes 24 history fixtures shaped like real bundles (decodable evidence.png, checkpoint, 2-action verify, notes/fidelity on some), removed afterwards; reuse checks the link's payload + href, follows it, and asserts the app says "settings from <id>: … 50%" and drops `?s2c-reuse` | green; `S2C_APP` now honoured |
| live-ide-bridge | (1) `packages/vscode-extension/out` is gitignored and not built by `tsc -b`; (2) **it leaked its dev server after every run, green ones included**: `kill` hit the `npx` wrapper, vite kept port 5234, and the next run talked to the stale server and failed phase 6 ("timed out waiting for ide-cursor") | builds the extension when `out/` is missing; spawns vite detached and kills the process group; refuses to start if 5234 is already served | green 3/3 back to back, nothing left on 5234 (was: pass, then 3 fails) |
| live-saywhat | **was a product bug, not flake (s2c-037).** A write that adds a module full-reloads the page mid-run. The overlay's tab id was per page load, and the SSE hub sent only to open streams, so the page that came back ignored, or never got, its own run's `resnapshot`, probes and `done`. The server waited 15 s for a snapshot nobody was asked for, ended in "browser snapshot timed out" (SSE capture: `resnapshot` 440 ms after the reload, `error-event` 15 s later, both to the dead id), and the user saw the idle hint. Green runs were the ones where vite hot-patched instead of reloading. Phase 4 then showed a second bug: a refused save said "I didn't try the change out … because I couldn't find the form after the change" next to "Nothing was changed", and never said why. | tab id kept in sessionStorage (a duplicated tab takes a new one); the hub holds events for a tab with no open stream for 30 s and delivers them once on reconnect; refused actions say why in words (`whyRefused`) and aren't also "untested"; the test's busy check tolerates the reload | 8/8 green across two servers (was 0/3 on this container); old product + new test red 2/2 |

Not touched: the 2 vitest env failures (init GitHub prompt, home-dir library).

## s2c-038: live-reload-running (new, zero-token, 5199)

After s2c-037 the reloaded page got its run's events, but it came back in its
resting state: `mode draw`, bar "drag to draw · ⌘K for anything else", while
the run was still writing. Esc did nothing to the run. The test makes that
window deterministic: the serve run from live-saywhat, the page's
`verify-snapshot` answer held, then `page.reload()` the way vite does it.
Fix: the server remembers the active run's tab and last stage, and a stream
that opens for that tab gets a `running` frame (after anything held); the
overlay enters running mode on it. The `stopping` stage had no plain line and
showed "Working…" right after Esc; it now says "Stopping…", and the Esc line
uses the same sentence. Red on 7b870e4 (`draw` + idle hint), green 4/4 after;
live-saywhat, live-auto, live-misread, live-keymap, walkthrough green.

## s2c-039: live-navigate (new, zero-token, 5199)

Draw a link end to end with the reading stubbed: engine → the run's own
navigate probe passes → receipt → by-hand click and ← Back → one undo
restores every byte → an unrendered route and a dead button both fail the
probe. Green 5/5 (phase 6 in the last 2). Caught: undo left the empty folders an edit had created.
