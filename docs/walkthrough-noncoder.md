# Non-coder walkthrough — audit (s2c-010, watering 1)

SEED done #2: someone with no React knowledge goes from a running app to ≥ 3
meaningful changes (add a section, change styling, add a working form) with
sketches and a few words, no code editing, no reading errors.

This is the **audit**, not the proof. It walks the path a non-coder would take
on today's real starter app and lists every point where they would need to read
code, read an error, or know something they can't. Each blocker is either fixed
here or filed as a node in `seed2tree/tree.yaml`.

## Setup used

- `npm create vite@latest app -- --template react` on 2026-10-16: **Vite 8.3,
  @vitejs/plugin-react 6.1, plain CSS (no Tailwind)**, a page with no empty
  space to speak of. This is what a beginner following any tutorial gets today.
  The demo app every e2e uses is Vite 7 + Tailwind + `allowDirty: true`, so
  none of the existing tests see this path.
- `sketch-to-code init . --yes` from the local checkout, `npm run dev`,
  Playwright at 1280×900 doing what a person would do: look, click their own
  button, draw a box, type two words.
- Zero-token except one accident (see the end).

## The path, step by step

| # | What the person does | What happens | Verdict |
|---|---|---|---|
| 0 | Install Node, install **and sign in to** Claude Code | Terminal only. Nothing in this repo helps. | **Barrier** (not fixable here; the hosted competitors don't have it) |
| 1 | `npx sketch-to-code init` | Not on npm, so this only works from a checkout. From a checkout it works on Vite 8: git init + commit, dependency, config, verify, commit. Clean exit. | Works. Output is noisy: the verify line dumps ~37 Vite plugin names. |
| 2 | Follow init's next steps: "open the URL and **press Alt+D to enter draw mode**" | The page already opens in draw mode (design is the default surface since `restoreSurface`). **Pressing Alt+D turned drawing OFF.** The bar also said "Alt+D to draw". The CLI e2e had been red on this since the change. | **Fixed this run** (below) |
| 3 | Click their own "Count is 0" button to see the app work | Nothing counts. The click *selects* the button and the bar reads `button · 120×33 · flex row · src/App.jsx — drag to move, handles to resize`. | **Confusing.** Jargon line; to use the app you must find the "✏️ Design" chip and learn it switches to "▶ Test". |
| 4 | Having clicked something, drag a box | Observed: the drag became a margin nudge of the selected element (`mt ≈10px — release to nudge with margin`, waiting on ✓ Go / ✗ Cancel). Esc once = "deselected — Esc again to leave tweak". | **Trap.** A drag means "draw" only if nothing is selected. |
| 5 | Fresh page: drag a box in blank space, type "newsletter signup", Enter | Box → note opens on the stroke ("click anything to name it in the sentence · Enter attaches"); auto-run; "reading your drawing…"; plan card "ADD new here — Add a newsletter signup widget here … an email input field with a Subscribe button". | **Works**, and the plan card reads well. Reading took **~10.5 s** before codegen started (1 sample). |
| 5b | Ring a button, type "red" | Note opens on the ring; auto-run. Same path. | Works up to the paid call. |
| 5c | Ring with no words | "What should change about "Bluesky"? Type a word (bigger, red, remove…) …" (s2c-020) | Works, plain words. |
| 6 | **Make a second change** | `checkpoint(root, allowDirty)` refuses any dirty tree (`packages/pipeline/src/safety.ts:41`), `runV2` calls it first (`run2.ts:166`), `init` writes `sketch2code()` with `allowDirty` unset (default false, `vite-plugin/src/index.ts:176`), and nothing commits after a run. So after change #1 the tree is dirty and change #2 ends in: *"✗ refusing to edit: working tree has uncommitted changes. Commit/stash them, or set sketch2code({ allowDirty: true })."* Reproduced: checkpoint on the init'd app with one edited line throws exactly that. And the refusal lands **after** the paid interpret. | **Hard blocker for done #2.** Filed s2c-024. |
| 7 | Add a working form | s2c-021 proved `save` live on the demo fixture (dead form fails, made-real passes). Not walked on the Vite 8 app: it needs change #2 first (step 6). | Blocked behind s2c-024. |
| 8 | A misread | Misread card + one-click Undo (s2c-011) exists. Not hit here. | Unwalked. |

## Fixed this run

- `init` and `doctor` next steps, both READMEs, and the bar's opening line no
  longer tell you to press Alt+D to start drawing. They say the page opens
  ready to draw and Alt+D *pauses* it. "Hit ▶ Run" is gone from init (auto
  runs by itself).
- Alt+D now says what it did: "drawing paused, the page is yours · Alt+D to
  draw again", and back. A page restored into Test no longer opens on "drag to
  draw".
- `packages/cli/tests/e2e/init-real-project.mjs` asserted the old behaviour
  (press Alt+D, expect drawing) and was **red**. Now: drawing live on load, no
  "Alt+D to draw" in the bar, Alt+D pauses (and says so), Alt+D resumes. All
  checks pass.

## Not fixable in code here

- Claude Code install + sign-in, Node, a terminal, `npm run dev`. A non-coder
  who has all four is not really a non-coder. This is the gap Lovable/v0/Bolt
  don't have, and the honest reason SEED done #2 is harder than it reads. The
  walkthrough can still be written for "someone who can paste three commands",
  which is a smaller audience.
- `npx sketch-to-code` needs the packages published: owner's call (SEED: out of
  scope without asking).

## What's left for this node

The three changes have not been shown end to end on the starter app. The next
watering should stub `/@s2c/interpret` in Playwright with a recorded
interpretation (the run bundle keeps `interpretation.json`), so the whole
non-coder path runs without a model, and only codegen stays live (Mac run or
owner's quota). Do it after s2c-024, or change #2 cannot land.

## Accident, recorded

In this cloud sandbox Claude Code is signed in through the host even under
`env -i HOME=<empty>`, so step 5 made a **real paid run** (interpret + ~35 s of
codegen reading three files). I killed the dev server at ~45 s; no file was
written. Rule for later cloud runs: never let a walkthrough probe submit a
sketch unstubbed.
