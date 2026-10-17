# Non-coder walkthrough (s2c-010)

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
| 3 | Click their own "Count is 0" button to see the app work | Nothing counts. The click *selects* the button and the bar reads `button · 120×33 · flex row · src/App.jsx — drag to move, handles to resize`. | **Confusing.** Jargon line; to use the app you must find the "✏️ Design" chip and learn it switches to "▶ Test". **Fixed in s2c-025 (2026-10-16):** the bar now reads *picked up the button “Save” — drag it to move, pull a corner to resize, drag anywhere else to draw · to use it instead of designing it, switch “✏️ Design” to “▶ Test” in the bar*. The Test hint shows once per page load, only for things made to be clicked (button, link, input). Tag, size, layout and file moved to the line's tooltip. |
| 4 | Having clicked something, drag a box | Observed: the drag became a margin nudge of the selected element (`mt ≈10px — release to nudge with margin`, waiting on ✓ Go / ✗ Cancel). Esc once = "deselected — Esc again to leave tweak". | **Trap.** A drag means "draw" only if nothing is selected. **Fixed in s2c-025:** after a click from drawing, a drag that doesn't start on the picked-up thing (or its handles) is a stroke. A still click picks the other thing up, and Esc puts it down and goes back to drawing. Alt+T tweak mode keeps the old select-and-drag-anything. Checked in `init-real-project.mjs`, zero tokens. |
| 5 | Fresh page: drag a box in blank space, type "newsletter signup", Enter | Box → note opens on the stroke ("click anything to name it in the sentence · Enter attaches"); auto-run; "reading your drawing…"; plan card "ADD new here — Add a newsletter signup widget here … an email input field with a Subscribe button". | **Works**, and the plan card reads well. Reading took **~10.5 s** before codegen started (1 sample). |
| 5b | Ring a button, type "red" | Note opens on the ring; auto-run. Same path. | Works up to the paid call. |
| 5c | Ring with no words | "What should change about "Bluesky"? Type a word (bigger, red, remove…) …" (s2c-020) | Works, plain words. |
| 6 | **Make a second change** | `checkpoint(root, allowDirty)` refuses any dirty tree (`packages/pipeline/src/safety.ts:41`), `runV2` calls it first (`run2.ts:166`), `init` writes `sketch2code()` with `allowDirty` unset (default false, `vite-plugin/src/index.ts:176`), and nothing commits after a run. So after change #1 the tree is dirty and change #2 ends in: *"✗ refusing to edit: working tree has uncommitted changes. Commit/stash them, or set sketch2code({ allowDirty: true })."* Reproduced: checkpoint on the init'd app with one edited line throws exactly that. And the refusal lands **after** the paid interpret. | **Hard blocker for done #2.** Filed s2c-024. **Fixed in s2c-024 (2026-10-16):** dirt that is exactly the tree sketch2code's last edit or undo left is allowed (`safety.ts` `dirtReason`/`recordOwnedState`); a file changed by hand since is still refused, named, and `/@s2c/interpret` refuses *before* the paid read. `init-real-project.mjs` now makes changes #1–#3 + undo on the init'd app, zero tokens. |
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

## Watering 2 (2026-10-17): the path walked end to end, zero tokens

`packages/cli/tests/e2e/walkthrough-noncoder.mjs` does the whole thing as a
person would: `npm create vite@9.2.1 -- --template react` (Vite 8.3, plain
CSS), `init` from the checkout, the app's own vite, then only the pen, the
keyboard and the bar. The model is **scripted** (`setScriptedModel` in
`@s2c/providers`, in-process only, no env switch): the script answers the
reading from the real evidence brief by element text, and writes the files a
model would write. Grounding, the save engine, verification, probes, the
cards and undo are all real. While a script is set, the real Claude Code
provider throws, so a cloud run can't pay by accident again.

What this proves: the path works and ends in plain words. What it does not:
that a model reads these sketches well (that's s2c-013's paid pilot), or that
a real person finds it easy.

**Three bugs it found on the first walk, all on the path every user takes:**

1. **The second sketch drew nothing.** Every run ended with the tool in
   `idle`, left over from when drawing was switched on with Alt+D. Since the
   page opens in Design, that meant change #2's ring just dragged across the
   page, and the bar still showed change #1's line. No e2e saw it because they
   all press Alt+D or call the debug hook. Fixed: a run that ends (done,
   failed, stopped, watchdog) comes back to drawing in Design, idle in Test
   (`restingMode()`). `live-keymap.mjs` asserted the old idle and now pauses
   with Alt+D before typing into the page, like a person would. (That
   test's "Esc resets a running overlay" step was red before this change.)
2. **A visible success was reported as a failure.** In the starter's centred
   column, a box drawn left of centre comes out centred. Placement
   verification wanted the new element's centre within 120 px of the box, so
   change #1 ended on *"But I couldn't add what you drew. Undo puts your files
   back"* with the new section right there on screen, and Undo one click
   away. Fixed in `verifyDesignPlacement`: in-flow (non-decorative) content in
   the right band and at the right size passes if it touches the drawing or
   sits centred in its parent. Still a miss: off to one side, another band,
   6× the size (`ribbon.test.ts`, 5 new asserts).
3. **Every change ended on a developer line with a tick**: `✓ [v2] 0%
   verified · 1 file(s) · normalize 50% · filled · 0.0k in … · revert: git
   restore --source=3614ae3f27 -- <paths>`, a ✓ next to "0% verified". The bar
   now ends on the plain sentence the run already built (`✓ Done: added what
   you drew.` / `⚠ I read your sketch as …`). The developer summary moved to
   the line's tooltip and the console.

**The walk now (bar lines as seen, countdown lines dropped):**

| change | sketch + words | bar ends on | time |
|---|---|---|---|
| 1 add a section | box in empty space + "testimonials" | ✓ Done: added what you drew. | 3.6 s |
| 2 styling | ring the heading + "red" | ✓ Done: changed the heading with "Get started". | 3.8 s |
| 3a a form | box + "email signup" | ✓ Done: added what you drew. | 3.7 s |
| 3b make it work | ring the form + "save it" | ✓ Done: made the form with "Sign up" keep what people type. (a test submit was stored, the page said so, the record was removed again) | ~4 s |

(Times have no model in them: a real reading adds ~10 s, plus codegen.)

**Still wrong, filed:**

- ~~**3b (s2c-031).**~~ **Fixed 2026-10-17.** The save engine adds an import
  and a hook above the form, so every stamp below it shifted, and the probe
  looked the form up by its old stamp ("the form is not on the page any
  more"), so the card said it "wasn't safe to" try it. Probes are now
  re-resolved against the after-edit snapshot (same file + tag, then own
  text, then nearest to where it was: `relocateProbes` in
  `pipeline/src/probe.ts`), and an untested behaviour's card gives the real
  reason (`whyUntested` in `explain.ts`): "unsafe" only when the code really
  reaches off the dev server. The e2e now fails if 3b doesn't end on ✓ or
  mentions safety.
- **Progress lines (s2c-030).** What flashes by while it runs is developer
  text: `verify: round 1: snapshotting edited page`, `codemod: action 0: App
  now saves email to server/data/apps.json through POST /api/apps`. The e2e
  counts these but doesn't fail on them.
- Wording, judged by eye, not filed: "changed the heading with "Get
  started"" should say what changed (red). "added what you drew" is vague
  when the words said "testimonials". The endpoint is named after the
  component (`/api/apps`), not the form.
- `live-misread.mjs` fails "starting a run left the old card up", **with and
  without this change** (checked by stashing it). Not caused here. Not
  investigated.

## What's left for this node

Done #2 says "a written walkthrough shows someone … going to ≥ 3 meaningful
changes". The path is now walked and green, all four sketches ending on ✓,
including the proof that the form works (the save is submitted in the page and
checked on disk). The walkthrough is complete as far as a script can take it,
except the developer progress lines (s2c-030). What a script can't give is a real model's readings on these four
sketches (fold into the s2c-013 pilot: 4 readings, cheap) and a real
non-coder (owner's call).

## Accident, recorded

In this cloud sandbox Claude Code is signed in through the host even under
`env -i HOME=<empty>`, so step 5 made a **real paid run** (interpret + ~35 s of
codegen reading three files). I killed the dev server at ~45 s; no file was
written. Rule for later cloud runs: never let a walkthrough probe submit a
sketch unstubbed.
