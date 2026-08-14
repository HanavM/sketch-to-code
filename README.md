# sketch-to-code

Draw on your running app — it edits your source.

A Vite dev plugin injects a transparent drawing overlay into your React app. Circle a
button and scribble "red" → the button's classes change in your `.tsx`. Scribble out a
card → the array entry is deleted. Sketch a rectangle in empty space and write "cancel"
→ a styled button appears in your source. Codegen runs through **your local Claude Code**
(subscription auth — no API key). Vite HMR shows the result in place, and the pipeline
verifies against the live DOM that the edit actually happened.

## Quick start

```bash
npm install
npm run build
npm run dev            # boots examples/demo-app on :5199
```

Open http://localhost:5199 — press **Alt+D** to enter draw mode, sketch, hit **▶ Run**.

Three run modes (HUD selector):
- **✏️ gesture** — mark up existing UI with command gestures (default). Auto-escalates
  to design mode when the ink resolves to no commands.
- **🎨 design** — sketch NEW UI in wireframe shorthand; the agent implements it in
  source, guided by the sketch-interpretation skill (`docs/sketch-interpretation.md`).
- **📸 screenshot** — benchmark mode: one screen capture of the tab, pixels only, no
  recognized shapes, no DOM, no srcLocs. Exists to measure what the structure buys.

Every run reports **token usage** (`fresh in + cache reads / out`) in the HUD summary
and `result.json`. Inspect exactly what the agent saw per run at
**http://localhost:5199/@s2c/runs** (ink render, prompt, plan/legend, replies,
verification, tokens).

Use it in your own Vite + React app:

```ts
// vite.config.ts
import sketch2code from '@s2c/vite-plugin'
export default defineConfig({
  plugins: [sketch2code(), react(), /* … */],
})
```

## Gesture vocabulary (proofreader's marks)

| Gesture | Effect |
|---|---|
| scribble / zigzag over an element | delete it |
| horizontal line through a text element | delete it (strikethrough) |
| circle/box around an element | modify it (pair with handwriting) |
| box drawn in empty space | add a new element there |
| arrow from A to B | move A before/after/into B |
| caret `^` | insert at that spot |
| handwriting | the instruction — attaches to the nearest gesture |

## How it works — geometry is never guessed

```
strokes ─► ① ink analysis ─► ② DOM grounding ─► ③ intent ─► ④ Claude Code ─► ⑤ verify
           deterministic      deterministic      determin.    edits real     DOM asserts
           (CALI/PaleoSketch  (getBoundingClient  + model     source at      + repair
            fuzzy classify,    Rect + data-s2c    only for    file:line      (monotonic,
            stroke timing)     source stamps)     handwriting)               ≤3 rounds)
```

- **① `@s2c/ink`** — pure-TS stroke recognition, zero deps, zero models: RDP + IPAN99
  corners, CALI fuzzy-trapezoid shape classification (Fonseca & Jorge, PRL'01) +
  PaleoSketch NDDE/DCR (Paulson & Hammond, IUI'08), entropy text-vs-shape split
  (Bhat & Hammond, IJCAI-09), arrow detection, temporal-spatial grouping. Stroke
  *timing* gives perfect segmentation for free — we own the capture.
- **② `@s2c/dom`** — a dev-only Babel pass stamps every JSX host element with
  `data-s2c="src/File.tsx:line:col"` (React 19 removed `fiber._debugSource`; build-time
  stamping is the only reliable route). The overlay snapshots exact rects + computed
  styles. **"The thing you circled" resolves to a file:line, not a guess.**
- **③ `@s2c/intent`** — deterministic hit-testing maps gestures to typed ops
  (`DELETE`/`MODIFY`/`ADD`/`MOVE`/`INSERT`). A model is consulted for exactly two things:
  reading handwriting, and ties geometry can't break. It never emits a coordinate.
- **④ `@s2c/pipeline`** — a persistent Claude Agent SDK session (`acceptEdits`, no Bash,
  isolated from your global Claude settings) receives the op list + labeled ink PNG and
  edits the files. Perception uses Azure OpenAI when `AZURE_OPENAI_{ENDPOINT,API_KEY,DEPLOYMENT}`
  are set, else falls back to Claude Code.
- **⑤ verify** — after HMR, the browser re-snapshots and per-op assertions check the edit
  landed (deleted → gone, modify → observably changed, add → grew, move → reordered).
  Failures go back to the *same* session; best score kept; hard 3-round cap.

## Safety

- Refuses to run outside a git repo, or when the repo toplevel is your home directory.
- Refuses a dirty tree unless `sketch2code({ allowDirty: true })`.
- Checkpoints via `git stash create` before every run (captures the worktree without
  touching HEAD); every run's summary line includes the revert command.
- Agent gets `Read/Edit/Write/Glob/Grep` only — no Bash, no network tools.
- Everything is `apply: 'serve'` — stamps and overlay can never reach a production build.
- Run bundles (strokes, scene, plan, transcripts, verification, ink.png) land in
  `.sketch2code/runs/<id>/`.

## Tests

```bash
npm test                              # 71 unit tests (no network, no model calls)
npm run dev &                         # then, each invokes real Claude Code:
node tests/e2e/live-run.mjs           # scribble → DELETE (array-entry removal)
node tests/e2e/live-modify.mjs        # circle + handwritten "red" → MODIFY
node tests/e2e/live-add.mjs           # box + handwritten "cancel" → ADD
```

All three live flows pass as of 2026-08-06 (real model, real edits, DOM-verified).

## 🔧 Tweak mode: direct manipulation, phase 1 (2026-08-14)

Ink remains the primary interface (creation, expression, relationships).
Tweak mode adds deterministic direct manipulation for the adjustments where
the affordance IS the disambiguation — starting with the two that produce
single-declaration diffs by construction:
- **gap handle** — click a flex/grid container, drag the space between
  children; snaps to the Tailwind spacing scale live (`gap-6 (24px)`)
- **padding ring** — drag any inner edge for `pt/pr/pb/pl`

Release = one class edited at the element's CURRENT `data-s2c` stamp (live
DOM at commit time — immune to positional staleness), git-checkpointed,
**zero model calls**. Dynamic classNames (`clsx`/templates) are refused
honestly with a pointer to the ink path. Free drag is deliberately absent:
"move a flex child 40px right" isn't a thing flexbox can express, so the
tool doesn't pretend it is.

## v2: model-led intent (2026-08-14)

The deterministic gesture classifier proved brittle on real drawing (multi-
stroke shapes fragmented; composite gestures like swap-arrows misfired), so
intent is now read by a multimodal model over an evidence pack the pipeline
owns: the whole drawing rendered over a gray page wireframe, plus exact
per-stroke features (touched elements, direction reversals, confinement) and
the element menu (id/tag/text/rect/srcLoc). The model answers in ids only —
every coordinate is still computed deterministically from the ids it cites,
validated, and gated by the plain-words preview ("swap the Revenue and
Conversion cards" · ✓ Go / ✗ Cancel). Interpretation defaults to your Claude
Code (override: S2C_INTERPRETER=azure). The v1 rules engine remains at
sketch2code({ engine: 'rules' }).

Live results (2026-08-14): two arrows → one swap, nothing deleted;
a ribbon drawn in 4 strokes → ONE background decoration; card-confined
zigzag → delete of exactly that card. Interpretation costs ~3-4k in /
~100-300 out tokens per run on top of codegen.

## Benchmark: structure vs pixels (2026-08-12, same scribble-to-delete task)

| mode | interpretation | tokens |
|---|---|---|
| gesture (structured) | ✓ deleted the right card, 1/1 verified | 10.1k in + 110.1k cached / 1.5k out |
| screenshot (pixels only) | ✗ read the delete-scribble as a *sparkline to add* | 12.8k in + 89.9k cached / 2.8k out |

Token cost is similar — the difference is interpretation. This matches the
literature (SeeAct, OSWorld, DesignBench ablations: structured channels carry the
signal for editing tasks; see `docs/sketch-interpretation.md` sources).

## Prototype status / known limits

- React/JSX + Vite only (the stamp pass gates on `.jsx/.tsx`).
- Repair loop is unit-designed but rarely exercised live — first-round success has been
  the norm so far.
- `MODIFY` verification asserts "something observably changed", not semantic correctness
  of free-form instructions; a VLM judge hook is the natural next step.
- Multi-select gestures, undo-after-accept UI, and non-Vite bundlers are out of scope.
