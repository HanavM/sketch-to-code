# Attestation: drawn changes feel instant

Goal: `.goal/GOAL.md` on main (sha1 cea990b77d2e353981deb0adf745cfedf63fa462).
Verified 2026-10-18 by goal-loop node n13, from a fresh clone of `agent`
(c8262f4, code as merged at 97691b9): `npm ci`, `npm run build`, then every
check below re-run in that clone. Headless Chromium 1280x900, demo app
(`examples/demo-app`). No live model tokens were spent in this verify.

To re-run any check yourself: `npm ci && npm run build`, then
`export S2C_CHROMIUM=/opt/pw-browsers/chromium` (or drop it if Playwright has
its own browser). Checks marked [dev] need `npm run dev` (port 5199) running
first; the others start their own server, so stop the dev server for them.

## 1. Scribble hides within 100 ms, no Go; code follows; failure puts it back
- `node tests/e2e/optimistic-scribble.mjs` [dev]: PASS. Hidden 16.8 ms after
  lift; run started with no Go; stubbed failure restored the element exactly;
  unstubbed run deleted it in StatCards.tsx with no flash back.
- `latency-table.mjs`: scribble 15.9 / 17.0 / 36.5 ms.

## 2. Coloured ring recolours within 100 ms, with catch-up and rollback
- `node tests/e2e/optimistic-ring.mjs`: ALL CHECKS PASSED. Lift to recoloured
  24.2 ms (rollback case), 26.3 ms (heading lands), 15.5 ms (button lands);
  rollback exact; source holds the green utility; no model call.

## 3. Move, insert, new section: pending preview within 300 ms; becomes real or is removed
- `node tests/e2e/optimistic-preview.mjs` [dev]: PASS. Previews labelled
  "pending" at 36.5 / 19.4 / 17.5 ms; app DOM untouched; removed when the run fails.
- `node tests/e2e/optimistic-preview-reconcile.mjs` [dev]: PASS. When the
  code lands, the preview comes down 33-59 ms after the real change shows,
  while the run is still going; when the code does something else, the
  preview is held, then removed at run end.
- NEW `node tests/e2e/verify-preview-scripted.mjs` (scripted model, no
  tokens, full pipeline): PASS. Previews at 20.3 / 14.5 / 18.2 ms; preview
  held until the real change shows; source changed; page shows the change;
  Ctrl+Z restores the source byte for byte.
- Earlier live-model evidence (n8, not re-run to save budget):
  `optimistic-preview-live.mjs` landed all three.

## 4. Draw while earlier changes are being coded; three back to back land (e2e)
- `node tests/e2e/optimistic-queue.mjs`: ALL CHECKS PASSED. Ring, ring,
  scribble drawn back to back; visible 23.5 / 14.0 / 13.9 ms after each lift;
  runs go one at a time in drawing order; all three land; Ctrl+Z x3 restores
  every file byte for byte.

## 5. Undo works for each; existing tests pass
- Undo: scribble (optimistic-scribble C), ring heading and button
  (optimistic-ring), all three queued (optimistic-queue), move, insert and
  section (verify-preview-scripted): each restored the source byte for byte.
- `npm run build`: clean. `npx vitest run`: 1331 pass, 2 fail. The 2 failures
  are the known environment-only ones recorded before this work started
  (cli init "GitHub stays optional", library "home directory cannot be
  written"; both depend on running as root / no gh).

## 6. Before/after table per gesture on the demo app
- `docs/latency/before-after.md`. "After" re-measured now with
  `S2C_STUB_MODEL=1 S2C_MODEL_REPS=3 node tests/e2e/latency-table.mjs` [dev]:
  every sample 12.8-37.7 ms (scribble, ring, move, insert, section), matching
  the table. "Before" (1.2 s to 142 s) is from n11 and was not re-run (it
  needs live model runs on the old flow).

## Known, outside this goal
- New section on the demo ends on a ⚠ placement tick even when the code lands
  where the box was drawn: `findInsertSlot` slots the box between the demo's
  decorative `BackgroundFlourish` svgs (absolute, aria-hidden), which span
  the middle rows. Pre-existing (insert-slot.ts and the demo component are
  unchanged by this work); the preview still behaves as the goal asks.
