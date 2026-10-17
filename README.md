# sketch-to-code

**Draw on your running app, and it changes the real code.** Scribble over something
to delete it. Circle something in a colour to make it that colour. Draw a rough box
where you want something new and write a word saying what. You never open the code.

The drawing is the instruction. Words are there to help, not to carry the whole
thing: most edits need none, and the rest need one or two ("testimonials", "red").
Your marks can be messy. If you have to draw carefully, that's a bug.

## What you can draw

| You draw | It does | Words needed |
|---|---|---|
| a scribble over something | deletes it | none |
| a ring around something, **in a colour** (Alt+P picks the pen) | makes it that colour | none |
| a rough box in empty space | adds something new there | what it is: "testimonials", "email signup" |
| a ring around something, normal ink | changes it | how: "bigger", "red" |
| an arrow from one thing to where it should go | moves it there | none |
| two arrows, one each way | swaps the two | none |
| an arrow from a button + a page name | makes the button open a new page | the page name: "Pricing" |
| a ring around a form + "save it" | makes the form keep what people type | "save it" |

Some edits are better as a drag than a drawing (resizing, small nudges, lining
things up), and those are drags. The full list, and which edits need words and why,
is in [`docs/visual-language.md`](docs/visual-language.md).

## Try it on your app

You need [Node](https://nodejs.org), a terminal, and [Claude Code](https://claude.com/claude-code)
installed and signed in. Your app has to be a Vite + React app. Not on npm yet,
so for now it runs from a copy of this repo:

```bash
git clone https://github.com/HanavM/sketch-to-code && cd sketch-to-code
npm install && npm run build
node packages/cli/dist/bin.js init ../my-app   # sets everything up, asks before each change
cd ../my-app && npm run dev                     # open the address it prints
```

Once it's published this becomes `npx sketch-to-code init` (rehearsed against a
local registry by `npm run e2e:published`). If anything seems off,
`node packages/cli/dist/bin.js doctor ../my-app` checks the setup and says what to
run next.

The page opens ready to draw. Draw, type a word if it needs one, and let go: about a
second later it reads the drawing, edits your code, and checks on the page that the
change really happened. **Alt+D** pauses drawing so you can click around your app
normally.

## When it gets it wrong

- **Ctrl+Z** (⌘Z on a Mac) undoes the last change: every file it touched goes back.
  It refuses, and says which file, if you edited that file by hand since.
- If it can't do what you drew, or did something different, it says so in one plain
  sentence and offers **Undo** right there.
- If you ring something with no words and no colour, it asks what should change
  instead of guessing.
- Anything that would delete a lot at once waits for you to press **✓ Go**.
- It only edits a project that's in git, and undo still works after a reload or a
  restart of your dev server.

## The 60-second demo

[`docs/demo-60s.md`](docs/demo-60s.md) is the shot list, and
`npm run demo` (or `node tests/demo/record-60s.mjs --out demo/`) plays it on a fresh Vite starter and
records `demo-60s.webm`. In that recording **the reading of each drawing is
scripted**, and the video says so on screen: it shows what using it looks like, not
how well a model reads your handwriting.

---

*Everything below is for people working on sketch-to-code itself.*

## Quick start (this repo, the demo app)

```bash
npm install
npm run build
npm run dev            # boots examples/demo-app on :5199
```

Open http://localhost:5199. The page opens ready to draw: drag to sketch, type a
few words if the sketch needs them. **Alt+D** pauses drawing so you can use the page.

**Alt+A** picks who decides the drawing is finished:

| mode | what happens when you stop drawing |
| --- | --- |
| **auto** (default) | it is read and applied, about a second later. No clicks. **Esc** cancels while the countdown shows. |
| **review** | it is read on its own and waits — you see the plan, then press **✓ Go**. |
| **manual** | nothing, until you press **▶ Run**, then **✓ Go**. |

In auto, a reading that would *delete* things still stops and asks.

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

## Use it in your own project

```bash
npx sketch-to-code init             # or: npx sketch-to-code init ./my-app
npm run dev                      # then Alt+D and sketch — it runs itself
npx sketch-to-code doctor           # diagnose an existing install
```

`init` does the whole setup and refuses to half-do it: it verifies the project is
Vite + React (Next.js / CRA / Vue / Svelte / Astro are reported and rejected
before anything is written), adds the dependency, wires `sketch2code()` into your
vite config — `.ts` or `.js`, an existing `plugins` array, or a config that does
not exist yet — and then **loads that config through Vite** to prove the plugin
resolves. Every write is shown as a diff and confirmed; re-running changes
nothing.

It also checks the plugin's safety gates *up front* instead of letting you
discover them on your first sketch: a repo must exist (it offers `git init` + an
initial commit, since without a commit there is no checkpoint to revert to), the
repo toplevel must not be your home directory, and the tree must be clean —
so it offers to commit its own setup, or writes `allowDirty: true` if you pass
`--allow-dirty`. `.sketch2code/` goes into `.gitignore`, because otherwise run
bundles keep the tree permanently dirty. GitHub is optional and off by default
(`--github create` / `--github connect --remote <url>`, never a push without
asking in the same invocation).

`doctor` reports the plugin's presence and whether Vite actually loads it, the
git state, whether your Claude Code is reachable (no model call, zero tokens),
the port the dev server will use, and what to run next. Full option list:
[`packages/cli/README.md`](packages/cli/README.md).

Doing it by hand instead:

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
  Depictions additionally get a **composition** score: the post-edit source is
  parsed back into geometry and compared to the ink's own normalized shape
  signature, so a lopsided sketch rebuilt as a mirrored ellipse fails even
  though it sits in the right place. Failures go back to the *same* session as
  numeric deltas; best score kept; hard 3-round cap.

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
npm test                              # unit tests (no network, no model calls)
npm run e2e:cli                       # onboarding, end to end: scaffolds a real Vite+React
                                      # app in a temp dir, runs `sketch-to-code init` against it,
                                      # boots ITS dev server and drives the overlay (no model)
npm run dev &                         # zero-token flows — seconds, no model:
node tests/e2e/live-tweak.mjs         # gap handle → gap-4 → gap-6
node tests/e2e/live-canva.mjs         # select / resize / drag / reorder / undo
                                      # then, each invokes real Claude Code:
node tests/e2e/live-run.mjs           # scribble → DELETE (array-entry removal)
node tests/e2e/live-modify.mjs        # circle + handwritten "red" → MODIFY
node tests/e2e/live-add.mjs           # box + handwritten "cancel" → ADD
node tests/e2e/live-design.mjs        # sketched card → implemented component
node tests/e2e/live-swap.mjs          # two arrows → one swap
node tests/e2e/live-ribbon.mjs        # wavy ribbon → background decoration
node tests/e2e/live-screenshot.mjs    # pixels-only benchmark mode
```

All three original live flows pass as of 2026-08-06 (real model, real edits,
DOM-verified). `live-tweak` and `live-canva` make no model calls at all.

> The live flows edit `examples/demo-app` in place and their artifacts have
> repeatedly been committed by accident (`pt-[224px]`, `-translate-y-[197px]`,
> `w-[293px]` on the fixtures). Check `git status` on the demo app before
> committing anything.

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

## 🖐 Canva mode: every element directly manipulable (2026-08-18)

Tweak mode's phase 1 grew into full direct manipulation — still **zero model
calls**, still one class edited at the element's live `data-s2c` stamp:

- **select anything** — hover highlighting, click to select; `shift+click`
  builds a multi-selection that moves as a group
- **resize** — eight handles, anchored to the opposite edge so the corner you
  aren't dragging stays put; snaps to the spacing scale
- **free drag** — a document-level ghost previews unclipped (it can cross a
  clipping ancestor's boundary while the original dims), committing to a
  `translate` escape hatch only where flow can't express the move
- **reorder** — drag onto a sibling's slot and the underlying data array is
  reordered: a structural edit, not a visual offset
- **per-instance edits** — double-click an element rendered from `.map()` to
  scope the change to *that one item* (a `className` field on the array entry
  plus a `${s.className ?? ''}` spread in the template) instead of all of them
- **magnetic snap** to sibling edges and centers
- **`Cmd/Ctrl+Z`** — undoes strokes while drawing, committed edits otherwise
- overlays track their elements through scroll, zoom and layout churn

## 🎯 Composition fidelity: the sketch is the spec (2026-09-15)

Depiction generations were failing in two opposite directions, and nothing
measured either one:

| | symptom | in this repo |
|---|---|---|
| **traced** | the fitted stroke paths are emitted verbatim — a vectorized scan of the sketch | `ChevronTrail`, `GutterMarks`, `CornerBadge` |
| **over-regularized** | only the *noun* survives; the form is rebuilt from the model's symbolic prior | `CrabDoodle`, `CompanionDoodle` |

The second is the expensive one. A code model draws with primitives it can
reason about symbolically, so "rebuild pristine" — with no numeric handle on
how far *almost*-symmetric went — collapses to a perfect `<ellipse>`, a
ruler-straight spine, three cloned legs on a uniform 8px pitch, and one side
mirrored with `scale(-1, 1)`. The skill *asked* for composition in prose
("a crab drawn with big front claws should yield big front claws") but prose
is not a measurement, so the prior won every time.

`@s2c/pipeline`'s `composition.ts` measures it instead. Strokes and generated
SVG reduce to the same signature — a 16×16 ink-mass grid normalized into the
drawing's own bbox, plus the asymmetries and spacing irregularities that carry
character. Normalizing into the own-bbox is the point: the skill *requires*
snapping sizes to the app's spacing scale, so absolute-pixel IoU would punish
correct work. Only the internal arrangement is judged.

It runs at both ends, for **zero tokens**:

- **before codegen** — the agent is handed the numbers it would otherwise have
  to guess at (`left-right asymmetry 0.63 … 3 repeated parts, spacing
  variation 0.19 … ink mass by quadrant — top-left 37%`)
- **after HMR** — the same measurement scores what it wrote, and failures go
  back through the existing repair loop as numeric deltas rather than prose

Scoring the committed `CrabDoodle.tsx` against a realistically lopsided crab:

```
score 34%  ·  mass overlap 34%
flaws: mirrored, displaced
  → the sketch is lopsided left-to-right (asymmetry 0.63) but the output is
    near-symmetric (0.01) — you mirrored one side; keep the two sides
    different the way they were drawn
```

The two regimes separate cleanly on direction changes per unit length,
calibrated on this repo's own output — rebuilt icons measure 0.00–1.11,
paths fitted off the strokes measure 3.80–17.27:

| component | detail density | lateral asymmetry | verdict |
|---|---|---|---|
| `CrabDoodle` | 0.00 | **0.007** | rebuilt, then mirrored away |
| `CompanionDoodle` | 1.11 | 0.875 | rebuilt |
| `CornerBadge` | 3.80 | 0.416 | traced |
| `GutterMarks` | 6.83 | 0.869 | traced |
| `ChevronTrail` | 17.27 | 1.000 | traced |

This is deliberately **not** the image-model route. A diffusion/ControlNet
finishing pass buys texture and shading, but the defect here isn't texture —
it's that measurable structure the pipeline already owned was being discarded
and never checked. Style is the next question; fidelity was this one.

## ✂️ Structural codemods: no agent for delete / move / swap (2026-09-15)

Run bundles showed where ink-run tokens actually went. The payload the
pipeline authors (brief + contract + images) was ~5k tokens; the other
100k+ was the agent session itself — preset system prompt and tool schemas
re-read every turn, plus Read/Grep to find what the stamp already named.
Pixels-to-structure had already been done; the agent loop was the cost.

`codemod.ts` now resolves grounded delete/move/swap actions to AST sites and
applies them as text edits before any session exists:

- **`.map()` instance** → the matching entry of the same-file data array
  (instance index from identical stamps in the snapshot, which must equal the
  array length — otherwise it would hit every instance)
- **static JSX child** → the node, with its line
- **component root** → its call site, via the DOM parent: JSX children must map
  1:1 onto rendered children, and the name must import from the stamped file

Every edit is planned against the original text, checked for overlap and
re-parsed before writing. Anything ambiguous (template children, derived
arrays, `{children}`, conditionals, truncated snapshots) is refused with a
reason and goes to the agent as before, alongside a note of what already
landed. The agent session is created lazily — only for refused actions or a
repair round.

Live (2026-09-15, same gestures as before):

| flow | before | now |
|---|---|---|
| two arrows → swap cards | 29.5k in + 279.6k cached / 7.4k out | **codemod 1/1 · 0 codegen tokens · ~1s** |
| scribble → delete card | 10.1k in + 110.1k cached / 1.5k out | **codemod 1/1 · 0 codegen tokens** |
| circle + "red" → modify | agent (unchanged) | 26.8k in + 52.5k cached / 0.5k out |

Interpretation (~3-4k) is still a model call. Modify is the next target: a
two-class change still pays for a full agent session.

## ⚡ The instant render: under a second, no model (2026-09-26)

A run took ~136s, and the user spent all of it looking at a status line. But
the slow part is the polish, not the shape — the shape is ours, it is exact,
and it costs nothing. `scaffold.ts` was already writing the drawn geometry
into a component before codegen; it was just hidden until the agent finished.

`instant.ts` mounts it immediately instead. Strokes → fitted paths → a real
`.tsx` component → inserted into the tightest POSITIONED stamped container at
the ink's own offset, with an import, through `/@s2c/instant`. Zero model
calls, checkpointed and undoable like any other edit. The component paints
itself on (stroke-dashoffset), so it reads as etched rather than popped in.
Measured live: **738ms from pen-up to a painted component**, against 136s for
the full run, which then refines that same file in place.

The hard part is restraint, not speed. Writing to someone's source unasked is
only defensible when the drawing cannot mean anything else, so the gate
refuses far more than it fires: a drawing whose CENTRE sits inside a content
element is a mark about that element (a strike, a ring, a scribble), not a new
thing; a dense back-and-forth is a scratch-out; ink under 24px is a slip. Each
refusal costs nothing — the interpreted path runs anyway.

Two bugs the live test caught that unit tests could not: the animation
`<style>` first emitted as a sibling of the `<svg>` (invalid JSX, component
crashed, page blank), and the mount landing inside `BackgroundFlourish` — a
`pointer-events-none` decoration layer that is technically the tightest
positioned ancestor and semantically the wrong host.

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
  the norm so far. Composition failures are the first check that produces
  numeric deltas specific enough to make a repair round worth spending.
- `MODIFY` verification asserts "something observably changed", not semantic correctness
  of free-form instructions; a VLM judge hook is the natural next step.
- Composition fidelity is scored against the post-edit **source**, so it covers
  inline SVG the agent writes. A depiction rendered via an imported icon
  component or an emoji has no local geometry to measure and is skipped.
- `add`/`design` placement still verifies against one union bbox per action —
  a composite sketch (card = heading + body + button) is not yet checked
  part-by-part against its rendered counterparts.
- Non-Vite bundlers are out of scope. (Multi-select and undo shipped in
  canva rounds 3–4.)
