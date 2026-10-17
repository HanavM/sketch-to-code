# The 60-second demo

seed2tree s2c-045, 2026-10-17. SEED done #5: "a README + 60-second demo that
shows a rough idea becoming real code". This is the shot list and a script that
plays it. **The real recording, with a live model reading real ink, and the
launch stay the owner's.**

## What the recording is, and is not

`node tests/demo/record-60s.mjs --out demo/` makes a fresh `create vite` React
starter (create-vite 9.2.1, Vite 8), runs `sketch-to-code init` on it, boots the
app's own dev server, and plays the shots below in Chromium with video on. It
writes `demo/demo-60s.webm` and `demo/demo-60s-shots.md` (when each shot
happened and the bar's last line).

**Scripted:** what a model would decide, i.e. the reading of each drawing and
the code written for it (`@s2c/providers` `setScriptedModel`, as in
`walkthrough-noncoder.mjs`). Every frame carries a banner saying so.
**Real:** the starter, init, the overlay, the pen and its colour, auto-run,
grounding a mark to the element under it, the delete codemod, verification on
the page, the plain-words bar, and undo.

So the video shows what using it looks like, and that the path works with no
code and no errors. It does not show that a model reads rough handwriting
correctly. Only the s2c-013 pilot measures that. Don't present this recording as
a live demo.

Every shot is also asserted on the page and on disk. A green run of the script
means the demo shows only things that work. Run on 2026-10-17 in the cloud: all
checks passed, 44.5 s recorded, 0 tokens.

## Shot list

Words typed: one, in shot 4. Everything else is the drawing alone.

| # | time (measured) | What you see | Caption / voice-over |
|---|---|---|---|
| 1 | 0–7 s | The stock Vite + React starter, running. The drawing bar at the bottom: "drag to draw". | "This is a real app, running. No code editor open." |
| 2 | 7–17 s | A quick zigzag over "Edit src/App.jsx and save to test HMR". About 2 s later the line is gone. Bar: "✓ Done: removed the text "Edit … and save to test"." | "Scribble over it. It's gone, from the code too." |
| 3 | 17–31 s | Alt+P, pick green, a loose ring around "Get started". The heading turns green. Bar: "✓ Done: made the heading with "Get started" green." | "Circle it in green. No words." |
| 4 | 31–42 s | A wobbly box under the button, type "testimonials", Enter. A "What people say" section with two quotes appears where the box was. Bar: "✓ Done: added "testimonials" where you drew it." | "A box where you want something, and one word for what." |
| 5 | 42–47 s | Ctrl+Z. The section disappears; the green heading and the deleted line stay as they were. Bar: "↩ undid: added "testimonials" where you drew it". | "Wrong idea? One undo, and the files go back." |
| — | 47–60 s | Free: a title card, or the arrow shot below. | "sketch-to-code. Draw it, and it's code." |

The arrow shot (an arrow off a "Pricing" button + "Pricing" → the button opens a
new Pricing page) needs a react-router app, which the plain starter isn't. It is
proven end to end in `tests/e2e/navigate-router-overlay.mjs`. Splice it in
from a second recording if the owner wants the drawing-first claim shown with
an arrow too.

## Every claim in the README, and what proves it

The README's top section (written in this same run) names these. Each one is
backed by a test that is green on `seed2tree` today. "Scripted" means the
model's part is stood in for, as above. "Paid" means a real model, last run on
the date given.

| README claim | Proof |
|---|---|
| scribble over something deletes it | `tests/demo/record-60s.mjs` shot 2 (**not scripted** since s2c-049: read by `plain-reading.ts` with no model call, deleted by the codemod; the demo fails if the model is asked); rule unit tests in `packages/pipeline/tests/plain-reading.test.ts` |
| a ring in a colour makes it that colour, no words | record-60s shot 3 (scripted); pen capture in `tests/e2e/live-pen.mjs`; colour snapped to the palette in `packages/pipeline/src/intent2.ts` (`drawnColor` → `matchColor`) |
| a rough box + a word adds something there | record-60s shot 4, `walkthrough-noncoder.mjs` change 1 (scripted) |
| a ring in normal ink + a word changes it | `walkthrough-noncoder.mjs` change 2 "red" (scripted) |
| an arrow moves it; two arrows swap | swap/move codemod in `packages/pipeline/tests/codemod.test.ts`; `live-swap.mjs` (paid, green 2026-08-14). **Not re-run on today's code.** |
| arrow off a button + page name opens a new page | `navigate-router-overlay.mjs`, `navigate-framework-real.mjs` (scripted) |
| ring a form + "save it" keeps what people type | `walkthrough-noncoder.mjs` change 3b (scripted; the save is submitted in the page) |
| `init` sets everything up and asks before each change; `doctor` checks it | `packages/cli/tests/e2e/init-real-project.mjs`, `onboard-real-projects.mjs` |
| not on npm; runs from a checkout via `node packages/cli/dist/bin.js` | `packages/cli/README.md` "Which dependency spec gets written" |
| the page opens ready to draw; Alt+D pauses | `init-real-project.mjs`, `live-keymap.mjs` |
| Ctrl+Z undoes the last change, every file | record-60s shot 5 (only the last change undone, checked on disk); `navigate-router-overlay.mjs` step 7 |
| Ctrl+Z refuses, naming the file, after a hand edit | s2c-026, `packages/pipeline/tests/history.test.ts` |
| a misread says so in one sentence + Undo | `tests/e2e/live-misread.mjs`, `packages/pipeline/tests/explain.test.ts` |
| a ring with no words and no colour asks instead of guessing | `tests/e2e/live-ask.mjs` |
| a wide delete waits for ✓ Go | `tests/e2e/live-auto.mjs` |
| undo survives a reload or a dev-server restart | s2c-002 (`live-reload-reading.mjs`), s2c-022 |

Removed while checking: "an X over something deletes it". The X is only described
to the model in a prompt (`docs/visual-language.md` row 1), with no test behind it.

## What the recording showed that should be fixed

- **The undo line was developer text** ("↩ undid: sketch run"). **Fixed in this
  run:** a sketch run's undo entry now reuses its Done sentence ("↩ undid: added
  "testimonials" where you drew it"), or says "your last sketch" when there is none
  (`runUndoLabel` in `packages/vite-plugin/src/undo-store.ts`, 4 unit tests;
  record-60s shot 5 asserts it). Other undo labels (tweaks, paint, endpoints) were
  not audited.
- **The delete sentence mangles the line it quotes:** "removed the text "Edit and
  save to test"". The scrubber drops the `<code>` words (`src/App.jsx`, `HMR`), so
  the quote reads as a broken sentence. Better: quote the visible text whole if it
  is short, or say "removed the line under the heading".
- 47 s, not 60, at a 5 s dwell per result. A live reading adds ~10 s per shot
  (s2c-010 measured ~10.5 s before codegen), so the real recording of these five
  shots will run over 60 s. Cut shot 1 to 3 s and drop the dwell to 3 s in the real
  one, or cut a shot.
