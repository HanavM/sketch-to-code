# VALIDATION — sketch-to-code

Validations live here, newest first. **s2c-019** (2026-10-16) reads Skema's
code first-hand and corrects s2c-018. **s2c-018** (2026-10-16) checks the
owner's thesis after his overrule. **s2c-012** (2026-10-15, below) is the
original PIVOT verdict, overruled by the owner on 2026-10-15 (INBOX (3)); it is
kept for the record.

---

# s2c-019 — Skema, read first-hand: **a pointer tool, not the thesis**

Written 2026-10-16 by the cloud gardener from a read-only shallow clone of
[petersenmatthew/skema](https://github.com/petersenmatthew/skema) at
`976bc26` (2026-09-30). None of its code was run. Facts below come from the
source unless marked.

**Call: a toy-to-small real tool, in the same category as Lovable Draw. It
does NOT share the thesis. s2c-018 overstated it, and I'm correcting that
here.** s2c-018 relied on the Devpost write-up, and the code says otherwise:

| question | answer from the code |
|---|---|
| activity | 79 files, ~11.5k lines TS. Commits: 22 in Feb 2026 (hackathon), 8 in Mar, 5 in Apr, 2 on 2026-09-30 (live model picker). npm `skema-core` 2.1.2, 7 versions, created 2026-01-25, last publish 2026-02-13 (registry.npmjs.org). Stars: *unverified* (GitHub API not reachable from this run). Still being touched, at a low rate. |
| is a typed prompt ever optional? | **No. Every annotation needs typed words.** All submissions (`dom_selection` and `drawing`) go through `AnnotationPopup.onSubmit(text)`, and the submit button is `disabled={!text.trim()}` (`components/AnnotationPopup.tsx:282,428`). The drawing is exported as SVG + PNG and sent *with the comment* (`Skema.tsx:619-665`). That's "sketch says where/what shape, words say what": Lovable's model. |
| scribble-delete | **It erases your own overlay ink, not page elements.** `useScribbleDelete` detects a zig-zag (direction changes + compactness) and calls `editor.deleteShapes(overlappingIds)` on tldraw shapes, then drops their annotations (`hooks/useScribbleDelete.ts`). No source file or DOM node is touched. It's an eraser gesture. |
| gesture set | One recognizer: scribble (`utils/gesture-recognizer.ts`). A `gesture` annotation type (`'scribble_delete' \| 'circle' \| 'rectangle' \| 'arrow'`) exists in `types.ts` and has a server prompt, but **no client code ever creates one** (grep: only the type, the sidebar label and the server branch). That's dead code. No arrow-move, no X, no strike, no caret, no symbol lexicon. |
| how the drawing is read | PNG → vision model (Gemini/Claude via their CLIs) → free-text description → a CLI agent edits files on its own. Prompt: "Interpret, Don't Transcribe" (`server/prompts.ts:280`). No DOM grounding of marks beyond a selector/bounding box. |
| verification | **None, by instruction.** The prompt tells the agent: "STOP immediately after making the file changes. Do not verify, do not run tests" (`server/prompts.ts:38,101`). |
| undo | **Yes, partly.** Per-annotation snapshot with `git stash create` (or HEAD), and revert runs `git checkout <ref> -- <file>` on each file in `git diff --name-only <ref>` (`server/daemon.ts:165-202`). Untracked files the agent created are in neither, so a reverted "sketch → new component" leaves the new file behind (read from code, not run). |
| tests | None in the repo. |
| frameworks | Next.js first (README), any React app with a `<Skema/>` component + a daemon on :9999. Also an MCP mode that queues annotations for Cursor/Claude Desktop. |
| run on r01/r06? | **Not run.** It needs a Gemini or Claude CLI logged in (model spend), and its daemon spawns an agent with write access. Running unreviewed third-party code with spend is outside this run's rules. It would also be pointless: neither r01 (scribble-delete) nor r06 (X-out link) can be submitted without typing words, so both fail the "sketch alone" test by construction. |

**What this changes:**

- **s2c-018's table rows 1–3 for Skema were wrong** ("marks: scribble-delete").
  Corrected below: Skema needs words for every task. The "drawing IS the
  instruction" claim now has **no known shipped or open-source competitor on a
  live codebase**. The prior art is still Word's Ink Editor (documents) and
  Code Shaping (research, code text), as in s2c-018.
- That makes the claim stronger, not a moat. Skema shows two students reached
  Lovable's model in a weekend. Adding "scribble over an element = delete it"
  to any of these tools is a small step. The edge is still execution:
  grounding + DOM verification measured on rough ink (s2c-013/016). Skema
  has neither, so it's no evidence either way on whether that execution wins.
- **Nothing to copy.** Its undo is `git stash create`, which this repo already
  uses, and Skema's version has the bug `packages/pipeline/src/history.ts`
  documents: stash create doesn't see untracked files, so reverting a
  "sketch → new component" leaves the new file behind. Here captureWork/
  revertWork fingerprint untracked files. s2c-011's undo should build on
  that, not on Skema.
- s2c-018's "what would change my mind → toward KILL: Skema turns out to be
  maintained and robust on rough ink": checked. It's maintained at a low rate.
  It has no rough-ink robustness to speak of because it never acts on a mark
  alone. That condition is **not met**.

---

# s2c-018 — is "the drawing IS the instruction" actually different?

Written 2026-10-16 by the cloud gardener. Sources read on that date; anything
not read first-hand is marked *(unverified)*. No tool was used hands-on: every
"what the user must do" cell for another product comes from its own docs, not
from trying it.

## Verdict: **the claim holds, narrowly. It is not a moat.**

- **Against Cursor Design Mode and Lovable Draw, the claim is true and
  documented.** Lovable's own docs: "A sketch shows the where, and your
  description explains the what"; the steps include "Type a message
  describing what you want Lovable to do", and Lovable receives "your message
  and the annotated screenshot" ([Lovable preview toolbar](https://docs.lovable.dev/features/preview-toolbar)).
  Cursor's docs: drawing identifies "the area of the page your instruction
  applies to", over a frozen frame; no gesture meaning is documented
  ([Cursor Design Mode](https://cursor.com/docs/agent/design-mode)). Neither
  doc says a drawing can be sent with no words; neither says it can't.
- **The idea itself is not new, and one project already ships the core of it
  on a live codebase.** New evidence the owner asked for (INBOX (3).3):
  **[Skema](https://devpost.com/software/skema-wta8kn)** (ConUHacks X, started
  2026-01-25, two Waterloo SYDE students; npm `skema-core`): turns your
  localhost app into a tldraw canvas; **a zig-zag scribble over an element
  marks it for deletion while you draw**; sketch a new card/form/hero and it
  becomes React code that a CLI agent applies as a diff, then hot-reloads.
  Gemini 2.5 Flash reads a PNG of the sketch + DOM context. That is "the mark
  is the command, on a live codebase". It's a hackathon demo: I could not
  open the [repo](https://github.com/petersenmatthew/skema) (fetch blocked),
  so stars, activity and how much works are *unverified*. It doesn't kill
  the seed. It does kill any pitch that says the *idea* is unclaimed. If two
  students built the core in a weekend, Cursor or Lovable can add
  "scribble = delete" in a sprint the day it matters.
- **The gesture grammar is old prior art.** Microsoft Word's Ink Editor has
  shipped proofreader's marks as commands for years: circle to select, cross
  out or squiggle to delete, caret to insert written words, curve to join,
  vertical line to split, backwards-L for a new line
  ([Microsoft support](https://support.microsoft.com/en-us/Word/edit-your-document-with-natural-gestures)).
  This repo's README calls its own vocabulary "proofreader's marks". The
  novel part is pointing those marks at UI and source code, not the marks.
- **Research has already measured this on code, and it found the weak
  spot.** [Code Shaping](https://arxiv.org/abs/2502.03719) (Yen, Zhao, Vogel,
  Waterloo; venue *unverified*, [Waterloo news](https://uwaterloo.ca/computer-science/news/new-ai-system-turns-sketches-code)):
  free-form sketches on code and console output, read by AI, applied as code
  edits; 18 programmers in 3 stages. Findings that apply directly here:
  **arrows were ambiguous** (used as commands, parameters and targets);
  participants rated how clear their sketches' effect was at a median of
  3.5/7; 23.2% of sketches needed another pass; in the last stage 5/6
  participants didn't need the keyboard, deleting with strikethroughs and
  accepting/rejecting with check/cross marks. Design lessons: show the
  interpretation before committing (this repo already has the plain-words
  ✓ Go / ✗ Cancel preview) and make the link from each mark to the affected
  code visible.
- **Marking up output as the next prompt exists too**, minus the codebase:
  tldraw make real lets you "draw on top of the website" it generated and
  re-run with your annotations; the old HTML goes back to the model. It's a
  throwaway prototype, not your repo
  ([tldraw blog](https://tldraw.dev/blog/make-real-the-story-so-far)).
- **The pointer-only tools are converging on "no words" from the other
  side.** [Frontman](https://frontman.sh/docs/using/annotations/): click
  elements, comments optional, "the agent will either use your comments or
  ask what you want changed". [v0 annotations](https://www.createwith.com/tool/v0/updates/v0-introduces-annotations-for-visual-feedback-on-generated-uis):
  click and comment. [DrawTalking](https://arxiv.org/abs/2401.05631) (Adobe/NYU):
  sketches are the objects, **speech** is the instruction, and participants
  strongly preferred speaking.

## The tasks

For each task: the least a user must do. **Marks** = ink only; **+words** =
typed or written text required; "?" = the docs don't say. "Here" is what the
current grammar and bench say (README gesture table, docs/PIPELINE-LOGIC.md
§4, tests/bench/sketches/rough). It has not been measured live: s2c-013 is
the first measurement.

| # | task | here | Cursor Design Mode | Lovable Draw | tldraw make real | Skema (hackathon) |
|---|---|---|---|---|---|---|
| 1 | delete a card | **marks**: scribble (r01, no words) | circle + words | draw + words | scribble on its own prototype; model guesses; no repo | ~~marks: scribble-delete~~ draw/select + words (s2c-019: scribble only erases overlay ink) |
| 2 | remove a nav link | **marks**: X (r06, no words) | circle + words | draw + words | same as 1 | select + words (s2c-019) |
| 3 | delete a line of text | **marks**: strikethrough | circle + words | draw + words | same as 1 | select + words (s2c-019) |
| 4 | move a section above another | **marks** in the grammar (arrow A→B = MOVE); but bench r04 adds "move the quote up here" | words (Cursor's [browser visual editor](https://cursor.com/blog/browser-visual-editor) does drag-and-drop: **no words, no drawing**) | draw + words | arrow, model guesses | arrows + ? |
| 5 | swap two cards | marks in theory (two arrows); v1's rules engine misfired on these (README), v2 unmeasured | drag-and-drop or words | draw + words | ? | ? |
| 6 | add a section from a wireframe (newsletter: field + button) | **mostly marks**: wireframe lexicon (rect = input, small rect = button); words only for copy. Bench r05 still writes the whole thing as a note | draw region + words | draw + words | **marks** (its core feature), no repo | **marks**: sketch → React |
| 7 | add an image / avatar slot | **marks**: rect with an X = image, circle at card top = avatar (lexicon) | words | words | marks | marks? |
| 8 | insert an item at a spot | **marks**: caret | words | words | ? | ? |
| 9 | rewrite a headline | **+words** (strike + "say: …", r02) | inline/words | **inline text edit**: click and type, fewer steps | +words | +words |
| 10 | restyle: bigger and green | **+words** (ring + "bigger and green", r03) | **sliders, no words** (visual editor) | select + style controls or words | +words | +words |
| 11 | duplicate a card | **+words**: no gesture exists | words | words | ? | ? |
| 12 | resize a column / widen a card | **+words**: no gesture exists | drag handles / sliders | words | ? | ? |
| 13 | make a button open a dialog (behaviour) | **+words**; a flow arrow to a sketched dialog might carry it in design mode, unmeasured | words | words | arrows + notes, prototype only | ? |
| 14 | accept / reject the edit | buttons (✓ Go / ✗ Cancel) | buttons | buttons | n/a | ? (undo is on its roadmap) |

Tally for "here": marks alone carry **8 of 14** (1, 2, 3, 4, 6, 7, 8 by
design; 5 unproven); words are required for 6 (9–14). Against Cursor/Lovable
the marks-only rows are the edge. Against direct manipulation (drag-and-drop,
sliders, inline text) the edge is gone on 4, 5, 9, 10 and 12. Those tools
need neither words nor drawing there, and they're more precise.

## Which gestures are the real edge

1. **Delete (scribble, X, strike).** Clearest edge vs Cursor/Lovable, and the
   cheapest: no words, unambiguous, two bench pages (r01, r06) already words-free.
   Also the one Skema shipped first, so it's table stakes, not a moat.
2. **Add by wireframe on the live app, with the lexicon** (image X-box,
   avatar circle, squiggle = body text, rect = input/card). Nobody shipped
   offers this *on your codebase* except Skema's demo. This is where "sketch
   first, words as support" pays off most: the ink carries structure, the
   words carry copy. **The bench under-uses it**: r05 spells the newsletter
   out in a note instead of drawing an input and a button.
3. **Caret insert and the image/avatar symbols.** Small, unclaimed, cheap.

Not an edge: **move/swap by arrow** (Code Shaping: arrows are the most
ambiguous mark; drag-and-drop already needs no words), and **restyle/copy**
(words or direct manipulation win; a ring + "bigger and green" is a prompt
with extra steps). Don't sell those as drawing-first wins. Either find a mark
that beats a slider (s2c-015's job) or concede them to words.

The thing nobody else has, and the only defensible part: **a deterministic
spine that grounds every mark to DOM ids and verifies the edit in the DOM**,
measured on rough ink. That's execution, not an idea. It only counts if
s2c-013/016 show it working, and it's worth nothing as a claim until then.

## What this changes in the tree

- s2c-015 (visual language): must name, for each property edit (resize,
  restyle, reorder), whether a mark beats direct manipulation, and concede
  the ones where it doesn't. Arrow-move needs a disambiguation rule
  (Code Shaping's main failure).
- s2c-016 (sketch alone vs with words): r04's note ("move the quote up here")
  and r05's note restate what the marks should already say. Strip them first.
  That's the cheapest test of the thesis.
- New s2c-019: read Skema's code and docs and say what it really does
  (gesture set, verification, undo, how it does on rough ink). It's the one
  competitor that shares the thesis.

## What would change my mind

- **Toward KILL of the edge:** Cursor or Lovable documents a mark that acts
  with no words, or Skema turns out to be maintained and robust on rough ink.
- **Toward a real edge:** s2c-016 shows the rough edit pages realized with
  notes stripped at ≥ the with-notes rate, and the wireframe pages realized
  from ink + copy only.

---

# s2c-012 — original validation (verdict PIVOT, overruled)

Written 2026-10-15 by the cloud gardener, per GARDENER.md §0.5 and the owner's
INBOX note of 2026-10-15 ("Don't spare my feelings"). Every claim below was
checked against the linked page on that date; anything not checked is marked.

## Verdict: **PIVOT**

The product framing in SEED.md — *a tool that lets non-coders turn rough
sketches on their running app into real code* — does not survive contact with
what shipped in the last 10 months. Stop building toward a launch of that.
The one thing still worth the owner's time is a sharp, falsifiable question
this repo is unusually well placed to answer, and nobody has published:

> **On deliberately rough sketches, does structured grounding (ink → DOM
> stamps → typed intent → verified edit) realize the user's intent clearly
> more often than "annotated screenshot + selected element" — the approach
> Cursor, Lovable and v0 ship?**

If yes by a wide margin, that is a real result (a write-up, a benchmark, and a
reason the big tools should change). If no, KILL the seed: everything else in
it is already a shipped feature somewhere.

**Kill criterion for the pivot (written now, before any numbers):** on the
rough-sketch set (s2c-009), 3 runs each, gesture/auto mode must beat
screenshot mode by **≥ 15 points of realized %** *and* reach ≥ 60% realized
itself. Short of either → KILL, no re-framing.

## 1. Novelty — what already exists

Drawing or annotating on a running UI and having an agent change the source is
now a standard feature, not a frontier:

| product | what it does | for whom |
|---|---|---|
| [Cursor Design Mode](https://cursor.com/blog/design-mode) (updated 2026-06-05) | Click elements in the running app, multi-select, **draw over the interface to circle/box a region** (over a frozen frame), or speak; agent edits the code behind it; hot-reloads. Sends XPath, component, props, computed styles + screenshot. | developers, designers, PMs |
| [Cursor browser visual editor](https://cursor.com/blog/browser-visual-editor) (2025-12-11) | Drag-and-drop layout, style sliders, point-and-prompt; agent writes the code. | developers |
| [Lovable preview toolbar](https://docs.lovable.dev/features/design) | **"Draw annotation": freehand, arrows, rectangles, circles on the live preview; "rough shapes are cleaned up automatically"**; sent as an annotated screenshot with a message. Plus click-to-select and inline text edits. | explicitly non-technical people ([Lovable](https://lovable.dev/de/blog/introducing-visual-edits)) |
| [v0 annotations](https://www.createwith.com/tool/v0/updates/v0-introduces-annotations-for-visual-feedback-on-generated-uis) (2026-06-11) + [design mode](https://www.createwith.com/tool/v0/updates/v0-launches-design-mode-with-visual-editing-and-layer-management) | Click elements in the preview, attach comments, batch to the agent; visual editing. | non-coders / PMs |
| [Bolt Visual Edits](https://bolt.new/blog/visual-edits) (2026-09-03) | Click, restyle, stack changes, send once. No drawing. | non-coders |
| [Onlook](https://aicoolies.com/reviews/onlook-review) (Apache-2.0, ~26k stars) | Visual editor on a local React/Next/**Vite** dev server, writes React to disk, Git workflow. "Cursor for designers." | designers |
| [Claude Code Desktop](https://code.claude.com/docs/en/desktop) | Browser pane previews your local dev server, **Cmd+Shift+S selects an element**, Claude auto-verifies edits against screenshots/DOM. | developers |
| [Annotask](https://kurtstohrer.github.io/annotask/) (MIT) | **Dev-only Vite + Webpack plugin**: pins, arrows, highlights, wireframe sections on the running app → structured tasks → agent applies to source; accept/deny in browser. | developers |
| [Drawbridge](https://github.com/breschio/drawbridge) (963 stars) | Chrome extension: click/rectangle annotations → task files → Claude Code/Cursor `/bridge`. | developers |
| [onUI](https://github.com/the-eddie/onUI), [nudgit](https://github.com/bl0rb/nudgit), [pi-annotate](https://github.com/nicobailon/pi-annotate), [MarkUp](https://chromewebstore.google.com/detail/markup-annotate-webpages/dmfdpjhdjglpcamdlepmlndnhiaenmpf?hl=en-US), [AgentsRoom Sketch](https://agentsroom.dev/features/sketch) | Draw/annotate UI → context for an agent. | developers |
| [tldraw make real](https://the-decoder.com/thanks-to-ai-you-can-now-draw-your-app-instead-of-coding-it/) | Sketch on a blank canvas → a throwaway HTML prototype (not your repo). | anyone |

Research: [Sketch2Code (Li, Zhang, Yang — Stanford/GT, NAACL 2025)](https://arxiv.org/html/2410.16232v1)
already benchmarks VLMs on 731 rough hand-drawn wireframes → HTML. Best
layout IoU ~21–22%; expert users wanted "more direct ways to point at and
select elements". It is about *new pages from a blank sketch*, not *edits to a
running app*, so it doesn't pre-empt the pivot — but **it owns the name
"Sketch2Code"**, which matters for any public write-up.

What I did **not** find (searched web + GitHub, 2026-10-15): any tool that
reads *gesture semantics* from freehand ink with no typed prompt (scratch-out
= delete, box + word = new button) and verifies the edit against the DOM
before reporting success; and any published measurement of *edit intent
realized from rough sketches on a running app*. Those two are the only
unclaimed ground. Neither is a product by itself.

## 2. Importance — who has the problem, would they switch?

- **Non-coders** — the seed's stated user — already have this, hosted, with
  no setup: Lovable draws on the preview and cleans up rough shapes; v0 and
  Bolt do click-and-comment. They will not run `npx sketch-to-code init` in a
  local Vite repo with a clean git tree and a Claude Code subscription. SEED
  done #2 ("a non-coder can do it") and done #3 ("`npx init` on real repos")
  describe two different users, and the first one is not reachable by a local
  dev plugin at all. **The accessibility angle does not survive.**
- **Developers** already sit in Cursor (Design Mode, with drawing) or Claude
  Code Desktop (element select + auto-verify). The marginal gain of this
  plugin for them is "I don't have to type the sentence" — and the repo's own
  finding is that words beat marks for content ("draw less, type more"), so
  the strongest version of this product converges on… click + type, which is
  what everyone ships.
- Frequency/pain: real, but already served. Switching cost from a tool they
  already pay for to a local plugin with no hosting: high. Nobody switches for
  "my circle gets read as a delete without typing 'delete'".

## 3. Feasibility — hardest risk, cheapest test

The hardest risk is not engineering (the pipeline works end to end, 67+
commits). It is **whether structure beats pixels on rough input at all**. The
repo already has the control arm: 📸 screenshot mode (pixels only, no shapes,
no DOM). The bench could not pick the mode until this run; now it can
(`--mode`, see below). Cost of the decisive test: ~0.7M billed tokens per
15-page run → roughly 4M for 2 modes × 3 runs on the tidy set, similar on the
rough set. That is the owner's call (s2c-008 is already waiting on it).

Built this run (zero tokens, checked in a real headless Chromium): `node
tests/bench/run.mjs --mode auto|gesture|design|screenshot`. The bench sets
the override, asserts the overlay holds it, records the mode actually sent
per page, and in screenshot mode probes the tab capture before any paid
reading (page 03: 131,740 base64 chars captured headless; image content not
inspected). Finding from the same check: **in auto mode the existing bench
pages are read as `design`** (new UI on a blank app). So today's bench
measures sketch → new page — the Sketch2Code-paper task — and never
exercises the gesture grammar that is the repo's one unclaimed feature. The
rough set (s2c-009) must include edit-on-existing-UI pages or the head-to-head
tests the wrong thing.

Caveat stated up front: screenshot mode is a **lower bound** on what Cursor/
Lovable do — they also send the selected element's identity. If structured
grounding can't clearly beat even pixels-only, the case is closed; if it
beats pixels-only, a fairer arm (screenshot + selected-element DOM) is the
next control before claiming anything publicly.

## 4. Edge — why this version, if any

As a product: **none that survives**. Every user-visible capability in SEED.md
has a shipped, better-distributed equivalent; the remaining differences
(no-prompt gesture reading, DOM verification) are features a big tool can add
in a sprint, and Cursor already captures DOM identity + a frozen frame.

As a learning/portfolio project: a measured, reproducible answer to "does
grounding beat screenshots for rough sketch edits" is novel, cheap to get from
this codebase, and useful whether the answer is yes or no. That is worth the
owner's next few hours; a public launch (SEED done #5) is not.

## What changes in the tree

- **Stopped (pruned, original framing):** s2c-010 non-coder walkthrough,
  s2c-005 onboarding on 5 real repos, s2c-011 misread explanation + undo,
  s2c-006 one-keystroke note. All launch polish for a product that loses.
  Owner can overrule in INBOX with a reason.
- **Kept (serve the measurement):** s2c-009 rough-sketch set, s2c-008 tidy
  re-score (quota), s2c-002 reload bug (makes the default config measurable),
  s2c-003 page-05 defect, s2c-007 bench contamination.
- **New:** s2c-013 — the head-to-head itself, with the kill criterion above.

## What would change my mind

- A head-to-head where gesture mode beats screenshot mode by ≥ 15 points on
  rough sketches (that's the pivot's PURSUE condition).
- Evidence that non-coders run local Vite projects with Claude Code in
  meaningful numbers (I found none).
- The owner deciding the point is a learning project and a launch is off the
  table — in which case the pivot is already the plan.
