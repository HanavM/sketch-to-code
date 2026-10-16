# The harness beyond markup: what to build, what to refuse

seed2tree s2c-017, 2026-10-16. SEED.md's "bigger ambition" is a drawing-first
harness: something you never leave for a code editor. A markup edit on one
page is a feature. This document checks the five things a harness needs
beyond markup against the code as it is today (paths cited are
`packages/…`), proposes the sketch-first interaction for each, names the
hardest technical risk, and **decides**. The decisions are at the end: three
buildable nodes, ranked, and the things deliberately not built.

Nothing here was measured with tokens. "Exists" means read in code, and for
the trust bug in §1 also traced line by line.

## The one-paragraph answer

The harness is closer than it looks on **history** (a visual timeline with
thumbnails already exists) and on **data** (`serve`/`save` codemods plus a
dev-server route mount already make a list fetch and a form save). It is
**blind on behaviour**: the verifier compares two static DOM snapshots and
cannot tell a button that works from one that doesn't, so every "make it
work" claim is unverified. That is the biggest gap, and it is the one a
drawing-first tool can't paper over with words, because a non-coder can't
read the code to check. **Multi-step builds** don't exist beyond one sketch
per run, and you can't even draw while a run is going. **Assets** don't
exist at all. Build order: make behaviour verifiable, fix the run-timeout
leak that makes undo lie, then let an image land in a drawn placeholder.
Don't build branches, a run planner, or a backend story.

## 1. History, branching, undo

**Exists today.**

- Every edit takes a checkpoint with `git stash create`, falling back to
  `HEAD` on a clean tree. This doesn't touch HEAD, the index or the stash
  list (`pipeline/src/safety.ts:26-64`). Revert uses `git restore --source`
  (`safety.ts:76-79`). Files the edit created are deleted, and files that
  were untracked before are left alone (`pipeline/src/candidates.ts:66-146`).
- An undo stack lives in the server (`vite-plugin/src/index.ts:86-87`).
  `POST /@s2c/undo` pops it and skips entries with nothing left to revert
  (`index.ts:1138-1170`). Ctrl/Cmd+Z drives it (`overlay-client/src/main.ts:3235-3265`).
- A visual history is stored on disk: `.sketch2code/history/index.json` plus
  one thumbnail per entry, capped at 50 (`pipeline/src/history.ts:102-109`,
  `:410-417`). The file watcher records it, so hand edits are captured too
  (`vite-plugin/src/index.ts:774-794`). Restore records the current state
  first (`history.ts:453-496`), so it doubles as redo.
- Run bundles are saved in `.sketch2code/runs/run-*/` and can be viewed
  read-only.

**Missing, and why it matters.**

- **The undo stack is memory-only.** Restart the dev server and Ctrl+Z does
  nothing. The history panel still works, but the one-key undo SEED done #4
  relies on does not.
- **No redo.** History restore covers it, at the cost of opening a panel.
- **Stash objects are unreferenced**, so a `git gc` can make old history
  entries unrestorable. The code detects this (`history.ts:427-443`) but
  doesn't prevent it.
- **No branches or alternatives.** The timeline is flat (`history.ts:220-238`).
  Best-of-N candidates are generated and then thrown away; only the winner is
  kept (`pipeline/src/run2.ts:500-530`).
- **Trust bug: the run timeout doesn't stop the run.** The 12-minute cap is a
  `Promise.race` against a deadline (`vite-plugin/src/index.ts:1233-1235`,
  `:1276`). When the deadline wins, `.catch` pushes an undo entry and
  `.finally` clears `activeRun` (`:1290-1321`). But the pipeline is never
  told to stop: there is no `AbortSignal` anywhere in `run2.ts`, `codegen.ts`
  or the plugin. The agent therefore keeps editing **after** the user has
  been told the run stopped, **after** the undo entry was taken, and possibly
  while a second run is editing too. Pressing Undo at that point restores
  the checkpoint, and then the orphan writes over it. Esc during a run has
  the same shape: it resets only the UI (`overlay-client/src/main.ts:3751-3756`).
  **Fixed in s2c-022 (2026-10-16):** the cap and Esc (`POST /@s2c/run/abort`)
  now abort one `AbortSignal` that reaches `runV2`, `runPipeline` and the
  agent's `query()`; the plugin takes the undo entry, sends `error-event` and
  frees the slot only after the pipeline has returned
  (`vite-plugin/src/run-supervisor.ts`). The undo stack is saved to
  `.sketch2code/undo.json`, and every checkpoint is pinned under
  `refs/s2c/cp/` so `git gc` can't collect it.

**Sketch-first interaction.** History is already the right shape: a strip of
thumbnails where you click a picture to go back. No gesture is needed for
it. Don't invent "draw a curved arrow to undo". A keypress and a picture
beat any mark here (same reasoning as visual-language.md rows 3/11/12).

**Branches: refuse.** Alternatives are the one place branching could pay
off. You'd sketch once and get two or three readings to pick between. But
best-of-N already costs up to 3× tokens per run, and showing the losers
means keeping three worktrees alive across HMR. Every competitor already
has checkpoints and version history. Branching wins no user on its own.
Revisit only if s2c-013 shows the misread rate is high **and** that
candidates differ in a way a user could judge from a thumbnail.

**Hardest risk.** Undo must never lie. The timeout leak is the only path
found where it can lie today, and it's fixable: thread one `AbortSignal`
into `runV2` and into the codegen `query()`, interrupt the agent, and await
it before taking the undo entry and freeing the slot.

## 2. Multi-step builds

**Exists today.** One sketch can carry several actions. Deterministic
codemods go first, then `serve`/`save`, then all remaining actions in one
Claude Code session with up to 3 verify/repair rounds (`run2.ts:210-250`,
`:406-482`). **Nothing carries over between runs**: each run starts a fresh
`query()` (`codegen.ts:138-168`), the overlay clears ink and notes when a run
finishes (`main.ts:10582-10586`), and there is no queue or plan (grepped
`queue|resume|sessionId|prevRun`). There is **no notion of pages or
routes**: the snapshot records `url` (`dom/src/snapshot.ts:99`) and nothing
reads it. You **cannot draw while a run is in progress**: the canvas only
takes input in draw/preview/tweak modes, and Draw/Run are disabled
(`main.ts:1507-1509`, `:3273-3283`).

**Sketch-first interaction.** A multi-step build is the user's sequence of
sketches, with the history strip as the record. That already exists. What a
drawing-first tool lacks is **pace**: a run takes tens of seconds to
minutes, and you have to watch it. The natural next step is to keep drawing
the next change while the last one lands. Multi-screen apps — two sketched
screens with an arrow, which the skill lexicon already reads as navigation
(`pipeline/src/skill.ts:77`) — need routes the pipeline doesn't know exist.

**Hardest risk: ink drawn during a run points at a page that is about to
change.** Grounding maps strokes to elements in the current DOM snapshot.
If run 1 moves or deletes what run 2's ink covers, run 2's ink means
something else after the HMR. Source stamps (`data-s2c="file:line:col"`)
don't help, because the edit shifts the lines. The only sound version
grounds at draw time against a snapshot taken then, keeps the target's text
and subtree fingerprint (as swap verification already does, `run2.ts:688-715`),
and re-finds those targets after run 1 lands, refusing the queued sketch if a
target is gone. That's a real build. Its value is speed, which is unmeasured.

**Decision: not now.** A queue speeds up a loop whose single step hasn't been
shown to work yet (s2c-013 is still unmeasured). A run planner ("build me a
todo app" as N steps) is the agent-prompt product Cursor and Lovable already
are; it isn't drawing-first and it isn't built here. Routes are the
multi-screen sketch's prerequisite, and they come after behaviour (§3),
because navigation **is** behaviour and is unverifiable today.

## 3. Behaviour and state

**Exists today.**

- The v2 verbs are delete, modify, add, move, swap, design, serve and save
  (`pipeline/src/intent2.ts:34-39`). None of them means onClick, toggle,
  show/hide or navigate. Behaviour reaches the code only as typed words.
  The codegen brief says "implement everything they ask for, including
  behaviour the ink cannot express" (`run2.ts:117-120`). Anything that
  isn't serve/save becomes a `modify` flagged "needs real backend work"
  (`intent2.ts:578-581`).
- `save` (`pipeline/src/form.ts`) is the one deterministic behaviour. It
  makes a form POST to a generated route that writes `server/data/<name>.json`.
  `tests/e2e/live-form.mjs` proves it in a real browser with a real submit.
- **The runtime verifier is static.** It reads tag, own text, classes, rect
  and 12 computed styles (`dom/src/types.ts:2-29`), before and after
  (`pipeline/src/verify.ts`, `run2.ts:648-760`). No pipeline code clicks or
  types: grepping `dispatchEvent|.click()|playwright` in pipeline, dom and
  vite-plugin found nothing. `verifyActions` has **no branch for serve or
  save** (`run2.ts:662-700`), so even the deterministic behaviour goes
  unchecked at run time. A "make the button add a row" note that the model
  half-implements reports **verified** as long as the markup moved.

**Why this is the biggest gap.** SEED done #2 asks a non-coder to "add a
working form/behaviour". A coder in Cursor can read the diff to see whether
the handler is wired. A non-coder can't, so the verifier is the only judge
they have, and it can't see behaviour. The plain-language card from s2c-011
will happily say "done" for a button that does nothing.

**Sketch-first interaction.** visual-language.md already concedes that no
mark alone carries a condition or a link (rows 14-15, needs words). So
behaviour is **sketch + a few words**, as the SEED intends: an arrow from a
button to a region plus "shows", or a ring on a button plus "adds a row
here". What the sketch adds, and a typed prompt can't, is the **test**.
The ink names the trigger element (where the arrow starts) and the effect
region (where it ends). That pair is exactly the probe a verifier needs:
*click the trigger, then expect the region's DOM to change in the stated
way*. Drawing gives you the acceptance test for free.

**Hardest risk.** Probes have side effects. Clicking submit writes
`server/data/*.json`, and a link click unloads the page, taking the overlay
with it. The probe must run in the browser (the overlay is already there,
and the server already round-trips snapshots, `vite-plugin/src/index.ts:1218-1229`),
then restore state afterwards: reload after the probe, snapshot the data
file before and restore it after, and never probe a target whose source has
`fetch(` to a host outside the dev server. A probe that can't be made safe is
reported as unverified, never as passed.

**Decision: build it, first.** It's the one item here that is a real
capability gap and not polish, and the ink makes it uniquely cheap.

**Built so far (s2c-021, 2026-10-16).** `pipeline/src/probe.ts` derives probes
from grounded actions (a `save` → submit its form; a clickable target + a dest
+ a behaviour word → click the tail, watch the head), judges what the browser
saw, and guards `server/data/` byte for byte. `overlay-client/src/probe-exec.ts`
fills and submits / clicks through React's own events, cancels a submit
nothing handles, and puts the fields back. The plugin runs probes over SSE
(`/@s2c/probe`, `ctx.requestProbes`), never clicking a component that calls
another host. `verifyActions` counts passed/failed; unverified is reported and
the plain-language card never says "Done." for it. `tests/e2e/live-probe.mjs`:
dead form fails, real form passes, store byte-identical, no navigation,
unsafe handler never clicked, 0 tokens.
The first probe found a real bug: Tailwind v4 scans `server/data/*.json`, so
every write there full-reloaded the page — every submit of a form made real
here reloaded the app and wiped its "Saved" line. Fixed in the plugin
(`handleHotUpdate` + `hotUpdate` ignore `server/data/`).
Not yet: a toggle fixture for the click probe live, the page residue a probe
leaves (the "Saved" line stays until reload), a key a user can press to
re-test a behaviour.

## 4. Data and backend

**Exists today.** `serve` moves a `.map()` literal to `server/api/<name>.ts`
behind a `useApi` fetch hook (`pipeline/src/api.ts`). `save` adds a POST
route and a JSON file store (`form.ts`). A stub answers `[]` when the page
fetches an `/api/*` that doesn't exist (`pipeline/src/stub.ts`, triggered at
`main.ts:7573-7604`). The plugin mounts `server/api/*` on the dev server
(`vite-plugin/src/index.ts:549-610`), so a generated route answers at once
with no second process. The codegen agent cannot run commands or add
dependencies (`codegen.ts:105-113`, `:32`). The app's own `.env` is never
touched.

**Sketch-first interaction.** Already the right shape: Alt+Shift+D on a list
or a form ("make this real"), or the `serve`/`save` verbs read from a sketch.
Data is the place where a mark has least to say: a schema, auth and a real
database are words or settings, not drawings.

**Hardest risk.** Not technical but positional. Lovable and Bolt ship hosted
backends; a local dev-server JSON store can't compete with that and
shouldn't try. Production backends mean auth, secrets and deploys, which
are the owner's calls and outside the gardener's rules.

**Decision: stop here.** The scope is "the app works on my machine": JSON
store, dev-server routes, no auth. The only backend work worth doing is
making §3's probes cover `save` and `serve` (does submitting add a record?
does the list render what the route returns?), which is part of node 1
below. No database, no auth, no deploy nodes.

## 5. Files and assets

**Exists today.** Nothing. No paste, drop, upload or file input in the
overlay (grepped `paste|upload|ondrop|clipboardData|dataTransfer|FileReader`
in `main.ts`). Images become "a neutral placeholder block", or the app's
existing placeholder pattern (`skill.ts:187-188`). The lexicon already reads
an X in a box as "image placeholder" (`skill.ts:38`, visual-language.md).
Icons come from the project's set, then inline SVG, then lucide-react if
installed, then emoji (`skill.ts:94-101`).

**Sketch-first interaction.** Draw a box with an X (an image goes here), then
drop or paste a picture onto it. The file is copied into the project and the
placeholder points at it. For a non-coder, "put my logo here" is about the
first edit they'd want and today it's impossible without an editor. It is
also mostly deterministic: no model is needed to place a file into a box the
user drew, once the box has been built.

**Built (s2c-023, 2026-10-16).** Drop or paste a PNG/JPEG/GIF/WebP/SVG onto
a stamped box: `packages/pipeline/src/asset.ts` sniffs the bytes, refuses
unsafe SVGs and files over 5 MB, copies the file to `src/assets/` (imported)
or `public/` (content-hash name, so the same picture is one file), and turns
the box into an `<img>` that keeps its size classes. A box holding real
content (a heading, a button, a component) is refused in words. One Ctrl+Z
reverts the source and deletes the copy. `tests/e2e/live-image.mjs`.
Not done: dropping onto ink that hasn't been built yet (run the sketch
first), and it isn't listed in the `?` keymap.

**Hardest risk.** Small. Pick where the file goes (`public/` vs
`src/assets/`, following the app's existing pattern), keep a size cap,
dedupe by content hash, and make undo delete the copied file (the
untracked-file handling in `candidates.ts:66-146` already does this for
created files). The open question is UX: dropping onto an *existing*
placeholder means finding its `<img>`/`div` by stamp, which is grounding the
pipeline already does.

**Decision: build it, third.** It's cheap, useful, and zero-token at run
time. It ranks below the trust fix because a working undo matters more than
a new feature.

## Decision: three buildable nodes, ranked

1. **Behaviour probes: the ink is the acceptance test** (s2c-021).
   Value 5, effort 3. A sketch whose action carries a trigger and an effect
   region (an arrow from a button to a region, or a ring on a submit button)
   is verified by clicking the trigger in the browser and checking the
   region, not by a static diff. This covers `save` first (submit, then a
   record exists and the page reports it), then one model-written behaviour
   (a toggle showing/hiding a region). Side effects are contained.
   *done_when*: the verifier has a probe step that the overlay executes
   (click/type on a stamped element, wait for HMR/idle, re-snapshot);
   `verifyActions` scores `save` via a probe; a zero-token e2e on the
   live-form fixture shows **a form whose handler is removed fails** and the
   real one passes, with `server/data/*.json` byte-identical before and after
   the probe; plus a toggle fixture that passes when wired and fails when
   the handler is a no-op; unit tests for probe derivation from ink
   (trigger = arrow tail element, effect = head region).
2. **Stop means stop: the run timeout and Esc abort the agent, and undo
   survives a restart** (s2c-022). Value 4, effort 1. Covered in §1.
   *done_when*: an `AbortSignal` goes from the `/@s2c/run` handler into
   `runV2` and the codegen session (`query` interrupted); on deadline or
   Esc (a new `/@s2c/run/abort` endpoint) the plugin awaits the pipeline's
   exit before pushing the undo entry and clearing `activeRun`; a unit test
   with a fake handler that keeps writing after the deadline shows **no
   write lands after `done`/`error-event` is sent**; the undo stack is
   saved to `.sketch2code/undo.json` and reloaded on start (test: restart
   the plugin, undo still reverts); stash shas are pinned under
   `refs/s2c/` so `git gc` can't drop history entries (test with
   `git gc --prune=now`).
3. **Drop an image onto a drawn placeholder** (s2c-023). Value 3, effort 2.
   *done_when*: dropping or pasting a PNG/JPEG/SVG onto an X-box
   placeholder (or onto an existing placeholder `<img>`/block found by
   stamp) copies it into the app's asset dir (existing pattern, else
   `public/`), rewires the element to show it, and is undone by one Undo
   that also deletes the copied file; size cap and content-hash dedupe;
   zero-token e2e on the scratch app; vitest + typecheck green.

## Not built, on purpose

- **Branches and alternatives.** Cost ×3, no user won by it, and checkpoints
  are table stakes everywhere (§1).
- **A run planner or prompt-to-app.** That's the typed-prompt product the
  thesis says this isn't (§2).
- **Drawing during a run (queue).** It's real, but it speeds up a step not
  yet shown to work. Revisit after s2c-013, with the draw-time grounding
  design from §2.
- **Routes and multi-screen sketches.** After behaviour probes, because
  navigation is behaviour.
- **Auth, databases, deploys, `.env`.** Owner's calls, and Lovable/Bolt's
  ground (§4).

## What would change these calls

- s2c-013 shows realized % on rough edits well under 60%. Then everything
  here waits, and the reader gets fixed first. Node 2 still ships: it's a
  correctness bug.
- s2c-010's walkthrough shows a non-coder never gets as far as behaviour.
  Then node 3 (their first wish) goes ahead of node 1.
- A shipped tool turns out to verify behaviour from a drawn trigger→effect
  pair. Then node 1 stops being an edge and is merely necessary.
