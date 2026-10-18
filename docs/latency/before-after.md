# Pen lift to visible change: before and after

Measured 2026-10-18 on the demo app (examples/demo-app, Vite dev server,
headless Chromium 1280x900) with `tests/e2e/latency-table.mjs`.

- **Before**: `agent` at commit 03a8530, the old flow. The
  change shows only when the code has been written and hot reload paints it
  (auto mode: 0.9 s settle, then the run).
- **After**: `try/n1-client-optimistic`. The page changes at pen lift; the
  code catches up in the background.

Time is from the pen-lift event's own timestamp to the first animation frame
in which the change is on screen. Median of n runs.

| Gesture | Before | After | Goal | What shows at lift (after) |
|---|---|---|---|---|
| Scribble (delete) | 1.2 s (n=3) | 16 ms (n=3, max 45 ms) | 100 ms | the change itself; code follows |
| Coloured ring (recolour) | 1.2 s (n=3) | 18 ms (n=3, max 19 ms) | 100 ms | the change itself; code follows |
| Arrow (move) | 17.4 s (n=1) | 14 ms (n=3, max 15 ms) | 300 ms | a dashed preview marked pending |
| Caret (insert) | 61.9 s (n=1) | 13 ms (n=3, max 14 ms) | 300 ms | a dashed preview marked pending |
| Box in empty space (new section) | 142.5 s (n=1) | 21 ms (n=3, max 22 ms) | 300 ms | a dashed preview marked pending |

How it was measured, and its limits:

- Scribble and ring need no model on either side, so both sides ran for real,
  three times each (the code landed every time; source reset after each).
- Move, insert and new section need the model. Before: one live run each
  (Claude Code writing the code; 17 s, 62 s and 142 s are single samples and
  vary run to run). After: the server calls were held open so no tokens were
  spent; the preview does not wait on the server. The earlier live run
  (`optimistic-preview-live.mjs`, n8) showed the same 15-19 ms with the model
  running.
- The scribble target is the largest mid-sized element on the page (the
  Revenue card); the ring is the Team members heading in green.
- Raw samples: `docs/latency/n11-samples.json`.

Reproduce: start the demo (`npm run dev`) on the branch you want, then
`S2C_CHROMIUM=/opt/pw-browsers/chromium S2C_SIDE=after S2C_STUB_MODEL=1 node tests/e2e/latency-table.mjs`
(drop `S2C_STUB_MODEL` and set `S2C_MODEL_REPS=1` to run the model live;
`S2C_ONLY=scribble,ring` for the free gestures only). On the old flow, copy
the script into that checkout first.
