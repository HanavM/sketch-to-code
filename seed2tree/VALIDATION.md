# VALIDATION — sketch-to-code (s2c-012)

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
