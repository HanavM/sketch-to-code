# DIGEST — newest first

## 2026-10-17 08:45 UTC — sketch-to-code / s2c-037 live-saywhat "flaky" — **done**: it was a product bug; a run that adds a file lost its own verification and receipt
Picked because: priority 1.44, the only open cloud node (s2c-000 seed 2.04 skipped: umbrella; s2c-008 / s2c-013 local + blocked; s2c-035 blocked on you). Fashion killed, no overrule. sidequest/fine-routing: no add_repo tool and clone needs auth, skipped.
Did: commit 151948d. **Not flake.** A write that adds a module full-reloads the page mid-run. The overlay's tab id was per page load and the SSE hub only wrote to open streams, so the page that came back never answered its own run's snapshot request. The server waited 15 s, failed "browser snapshot timed out", and **the user saw "drag to draw" instead of a receipt.** Captured on the wire: reload 04.26, resnapshot to the dead id 04.70, error 15 s later. Bigger edits (serve, save, scaffolded components) reload more reliably, so they failed more. Fix: tab id survives reloads (a duplicated tab gets a new one, so a probe can't submit a form twice); the hub holds a tab's events while it has no stream and delivers them once on reconnect. A second bug turned up behind it: a refused save said "I didn't try the change out … because I couldn't find the form after the change" right next to "Nothing was changed", and never said why. It now says "because it isn't inside a form … point at one of the form's boxes instead".
Result: live-saywhat 8/8 green (0/3 before; old product + new test red 2/2); new sse-hub test red before, green after; vitest 1094/1096 (same 2 env failures); `tsc -b` clean; live-api/form/endpoint/auto/preview/misread + walkthrough green; 0 tokens. momentum 0.5 → 0.7
Blunt: this one counted. It wasn't test plumbing: every overlay run that created a file was ending in a timeout with no receipt, including the paid ones. Not checked: a real model run; Firefox/Safari tab duplication.
New branches: s2c-038 after the reload the bar still shows idle until "done" arrives; it should say the run is still going and Esc should still stop it (value 3, effort 1).
Pruned/done: s2c-037 done.
**Needs you:** (1) s2c-013: write "spend the pilot in the cloud" in INBOX and the next run spends ~45 readings on your quota. SEED done #1 still has zero real readings. (2) s2c-035: yes/no to cloning 5 public Vite+React repos read-only.

## 2026-10-17 07:30 UTC — sketch-to-code / s2c-036 Six red e2e files — **done**: 5 of 6 green; one real keyboard bug in the bare-ring question
Picked because: priority 1.74, the only open cloud node (s2c-000 seed 2.04 skipped: umbrella; s2c-008 4.84 / s2c-013 1.76 local + blocked; s2c-035 2.04 blocked on you). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit fd07b11. **live-infer wasn't a mode-inference regression.** Its wordless ring gets s2c-020's question, "▶ Run again sends it as it is", and the note it opens focused swallowed Alt+R. So from the keyboard the sentence was false (on a Mac Alt+R typed "®" into the note). Fix: Alt+R in the note attaches what's typed and runs. infer red before, green after; live-ask gains a step for it. The rest was test rot: canva (plain-words copy), lasso (Vite 7 sometimes skips the full reload; the test now reloads by hand), runs-viewer (assumed your Mac's 40+ runs; now writes its own 24; reuse has been a link since d13d837), ide-bridge (builds the extension; **it leaked its vite on 5234 after every run**, so every second run failed).
Result: canva, infer, lasso, runs-viewer, ide-bridge green (ide-bridge 3/3 back to back, was pass then 3 fails). saywhat still red. vitest 1088/1090 (same 2 env failures); `tsc -b` clean; ask, notes, keymap, misread, auto, noterefs, label, walkthrough green; 0 tokens. momentum 0.5 → 0.7
Blunt: ~1 real product fix (9 lines) in 35 minutes of test plumbing. It's the third run in a row of this. The zero-token suite is now mostly honest, and that's where its value stops. **None of it measures SEED done #1** (rough sketches realized ≥80%), and that is still zero real readings. Also: `ANTHROPIC_BASE_URL` is set in this container. That's how s2c-034 spent a reading by accident. Every e2e here was run with it unset.
New branches: s2c-037 live-saywhat is flaky (3 failure points in 4 runs; one cause fixed: a stale parked receipt made phase 2 "pass" on phase 1's sentence). Could be a real lost receipt after a 4-file write.
Pruned/done: s2c-036 done (saywhat moved to s2c-037).
**Needs you:** (1) s2c-013: write "spend the pilot in the cloud" in INBOX and the next run spends ~45 readings on your quota. Without it the cloud run is polishing tests. (2) s2c-035: yes/no to cloning 5 public Vite+React repos read-only.

## 2026-10-17 06:25 UTC — sketch-to-code / s2c-034 E2e sweep — **done**: 13 files drew nothing, and the bar jumped under your cursor
Picked because: priority 1.89, the only open cloud node (s2c-000 seed 2.04 skipped: umbrella; s2c-013/008 local + blocked; s2c-035 blocked on you). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 4345233. Classified all 57 e2e files (docs/e2e-suite.md): 11 paid, 46 zero-token; ran 42 + 2 cli. **The live-misread bug was everywhere:** 13 files pressed Alt+D on a page that opens with the pen on, so they paused it and drew nothing. ink-track/ink-follow red, live-instant's "a scratch-out isn't etched" green on no scratch-out, and **all 9 paid drivers (`npm run e2e`) dead since the pen-on default.** New `tests/e2e/lib/pen.mjs` (ensureDraw only toggles when off; assertInk fails a stroke that never landed). **One real product bug:** pick "outline" in the result panel and 🎚 un-tucks, the bar grows 515 → 670 px, shifts 77 px, and the panel slides out from under the cursor mid-choice (fill/style red). 🎚 now stays while its panel is open. Also fixed "added the a wavy ribbon".
Result: 36/42 zero-token green (was 30/42, plus 1 hollow); fill/style red before, green after; vitest 1088/1090 (same 2 env failures); `tsc -b` clean; walkthrough + misread green. momentum 0.5 → 0.7
Blunt: test hygiene again, not seed progress. The e2e suite cited for DoD #2/#4 had 7 hollow or red files nobody noticed. Paid drivers fixed blind (`node --check` only). **I spent one real model run by mistake:** live-ink-track has no "paid" marker and un-stubbed ▶ Run; it's labelled PAID now.
New branches: s2c-036 the 6 still-red zero-token files (canva, infer, lasso, saywhat, runs-viewer, ide-bridge); infer may be a real mode-inference regression.
Pruned/done: s2c-034 done.
**Needs you:** (1) s2c-013: that accident shows the cloud container *can* reach a model with no token. Say "spend the pilot in the cloud" in INBOX and the next run does it (~45 readings on your quota). (2) s2c-035: yes/no to cloning 5 public Vite+React repos read-only.

## 2026-10-17 05:20 UTC — sketch-to-code / s2c-005 Onboarding on real third-party projects — **done for starters**: 5/5 reach ✓ in 11–14 s, one real bug fixed
Picked because: priority 2.18 (next: s2c-034 1.88; s2c-000 seed skipped: umbrella; s2c-013/008 local + blocked, skipped). Fashion killed, no overrule. sidequest/fine-routing: no add_repo in this run and outside its repo scope, skipped.
Did: commit e5200fc. New zero-token e2e `onboard-real-projects.mjs` (`npm run e2e:onboard`): 5 published starters scaffolded fresh from pinned npm generators: create-vite react-ts, react-compiler-ts, TanStack Router (Tailwind v4, file routes), vite-extra SSR (`node server`), an npm workspace with the git root above. Each goes doctor → init → doctor → dev server → ring the h1 + "red" → ✓. **Bug:** TanStack's dev script is `vite dev --port 3000`, but init and doctor said "open http://localhost:5173", where nothing answers. A non-coder is stuck before drawing anything. Fixed: `scriptPort()` reads the dev script's `--port`.
Result: 5/5 ✓, init→✓ 10.8–13.8 s; port check red before, green after; 4 new unit tests; vitest 1087/1089 (same 2 env failures); `tsc -b` clean; init-real-project and walkthrough green; 0 tokens. docs/onboarding-real-projects.md. momentum 0.5 → 0.7
Blunt: these are generator outputs, not people's apps: no CSS-in-JS, no pnpm/Turborepo, no config built from another file. SEED done #3 as written ("real open-source apps") is **not** met, and the starters were always the easy case. The SSR address is only right because its server.js also defaults to 5173.
New branches: s2c-035 the same harness on 5 real OSS apps pinned to a commit (blocked on you, below).
Pruned/done: s2c-005 done.
**Needs you:** (1) s2c-013 unchanged: done #1 still has zero real measurements; run the pilot on macOS or give the run a `CLAUDE_CODE_OAUTH_TOKEN`. (2) s2c-035: may the gardener clone ~5 public GitHub Vite+React apps, read-only? Say yes in INBOX (and add read access to this task) or name the repos. Next cloud run: s2c-034, the last open cloud node.

## 2026-10-17 04:05 UTC — sketch-to-code / s2c-033 live-misread red — **done**: the test was hollow, and it hid a real double-reading bug
Picked because: priority 2.63 (next: s2c-005 2.18; s2c-000 seed 2.03 skipped: umbrella; s2c-013/008 local + blocked, skipped). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 0195f33. The card was never the bug. Step 6 pressed Alt+D on a page that opens drawing, so it *paused* the pen: no stroke, ▶ Run disabled, click did nothing. With the stroke landing it found a real one: **▶ Run inside the 0.7 s auto countdown left the countdown armed.** The bar kept "⚡ auto-run in 0.4s" during the reading, and when the reading ended first (fast failure, quick decline) it fired a **second paid reading + second instant render** of the same ink. Measured 2 and 2 from one click. Fix: `run()` cancels a pending countdown (7 lines).
Result: step 6 now asserts the stroke landed, the card survives drawing, the run closes it, exactly 1 reading in 1.5 s. Red on old overlay, green 3/3. live-auto, live-keymap, live-preview, walkthrough green; vitest 1083/1085 (same 2 env failures); `tsc -b` clean; 0 tokens. momentum 0.5 → 0.7
Blunt: ~10 min of real work. The bug only bites when a reading fails fast, so it wasted money on failures, not on successes. The worse news is that an e2e cited as proof of SEED done #4 had been asserting nothing for a day. Not checked: real model, the Alt+R path inside the window.
New branches: s2c-034 sweep the zero-token e2e suite for red and vacuous tests (value 3, effort 2).
Pruned/done: s2c-033 done.
**Needs you (s2c-013):** unchanged and still the bottleneck. Done #1 has zero real measurements. Run the pilot on macOS (commands in s2c-013 `blocked_on`) or give the run a `CLAUDE_CODE_OAUTH_TOKEN`. sidequest/fine-routing can't be cloned from this task: add them to its repo access if you want them gardened.

## 2026-10-17 03:20 UTC — sketch-to-code / s2c-032 The Done sentence names what you asked for — **done**; s2c-010 (SEED done #2 walkthrough) closed
Picked because: priority 2.92, the only open cloud node (s2c-013 local + blocked, skipped; s2c-000 seed skipped: umbrella). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 8859518. The success sentence now carries the words typed with the mark: "✓ Done: added "testimonials" where you drew it." and "✓ Done: made the heading with "Get started" red." (were "added what you drew" / "changed the heading"). Short look-words become "made … bigger / bold and blue"; instruction-like words are quoted; a coloured pen with no words names the colour. Cut at 6 words; failure sentences untouched.
Result: walkthrough ALL CHECKS PASSED incl. 2 new checks on the words; 12 new unit tests; vitest 1083/1085 (same 2 env failures); `tsc -b` clean; 0 tokens. momentum 0.5 → 0.7
Blunt: ~20 min of copy polish. The sentence echoes your words, it doesn't check them: it says "testimonials" because you typed it, not because anything looked for quotes on the page. It makes a misreading easier to spot, and that's all. Done #2 is now as proven as a script can make it. Done #1 (rough sketches realized ≥80%) still has **zero real measurements**: the whole seed's open question sits behind s2c-013.
New branches: s2c-033 live-misread e2e red: a new run leaves the old misread card up (value 3, effort 1). **s2c-005 un-pruned** (onboarding on ≥5 real OSS Vite+React repos, zero-token, SEED done #3): its pruning reason was the PIVOT you overruled.
Pruned/done: s2c-032 done; s2c-010 done.
**Needs you (s2c-013):** unchanged and now the bottleneck. Run the pilot on macOS (commands in s2c-013 `blocked_on`) or give the run a `CLAUDE_CODE_OAUTH_TOKEN`. sidequest/fine-routing still can't be cloned from this task: add them to its repo access if you want them gardened.

## 2026-10-17 02:15 UTC — sketch-to-code / s2c-030 Plain progress lines — **done**: nothing a run shows on the bar is developer text any more
Picked because: priority 3.22 (next: s2c-032 2.92; s2c-013 2.74 local + blocked, skipped; s2c-000 seed 2.02 skipped: umbrella). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 747d61c. The walkthrough now records every bar line (MutationObserver), not a 200 ms sample. **The sample had been hiding most of it: ~8 developer lines per change, not 1**: "safety: git checkpoint", "codegen: Claude Code editing source", "done: [v2] … revert: git restore …", "1 action(s) outlined". It now fails on developer words in any line; red on the old overlay 4/4. Fix: a fixed sentence per stage ("Saving a restore point first, so this can be undone…", "Making the change…", "Checking the page matches your sketch…", "Trying it out in the page…"), never the detail; raw line on the tooltip + console. A failed reading now says the drawing is still there and to press ▶ Run.
Result: walkthrough green, 4/4 changes plain in every line; vitest 1071/1073 (same 2 env failures, +7 new); `tsc -b` clean; live-preview, live-auto, live-keymap green; 0 tokens. momentum 0.5 → 0.7
Blunt: ~25 min of polish. It removes the last developer words a non-coder sees on the happy path, but it doesn't make one sketch read better. Not checked: the error paths' wording beyond "reading failed", and the 8 paid live e2e files I touched (one-line ✗ check) weren't run.
New branches: none. s2c-032 (Done sentence names "red"/"testimonials") is the last open child of s2c-010; it closes done #2 as far as a script can.
Pruned/done: s2c-030 done.
**Needs you (s2c-013):** unchanged. The paid pilot needs a macOS run or a `CLAUDE_CODE_OAUTH_TOKEN`. sidequest/fine-routing still can't be cloned from the cloud run: add them to this task's repo access if you want them gardened.

## 2026-10-17 01:03 UTC — sketch-to-code / s2c-031 Form save is tried out — **done**: all 4 walkthrough sketches now end on ✓
Picked because: priority 3.61 (next: s2c-030 3.21; s2c-000 seed 2.01 skipped: umbrella; s2c-010 1.33; s2c-013/008 local + blocked). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 74b0075. Reproduced 3b's "⚠ … because it wasn't safe to". The cause was a stale stamp, not safety: the save engine adds lines above the form, and the probe looked the form up by its old line. Probes are now re-resolved in the after-edit snapshot (same file + tag, then own text, then nearest), and an untested card gives the real reason. "Unsafe" is reserved for code that leaves the dev server.
Result: walkthrough 3b → "✓ Done: made the form with "Sign up" keep what people type." The test submit is stored, the page says so, and the record is put back. The e2e now fails on ⚠ or any "safe" wording. 8 new unit tests; vitest 1064/1066 (same 2 env failures); `tsc -b` clean; live-probe, live-probe-click and live-form green; 0 tokens. momentum 0.5 → 0.7
Blunt: SEED done #2's three changes are now proven end to end, but only with scripted readings. Whether a real model reads these 4 sketches right is still unmeasured (the s2c-013 pilot). A ~20-min bug fix: it was the card lying to the user, and it had been since the probe shipped.
New branches: s2c-032 the Done sentence says what changed ("red", "testimonials"); value 3, effort 1.
Pruned/done: s2c-031 done. s2c-010 closes once s2c-030 and s2c-032 land.
**Needs you (s2c-013):** unchanged. To run the paid pilot, either run it on macOS or give this run a `CLAUDE_CODE_OAUTH_TOKEN`. Gardens sidequest/fine-routing can't be cloned from the cloud run (no auth for those repos in this session).

## 2026-10-17 00:55 UTC — sketch-to-code / s2c-010 Non-coder walkthrough — **3 path bugs fixed; 3 of 4 sketches now end on ✓ in plain words**
Picked because: priority 1.35, the only open cloud node (s2c-000 seed 2.01 skipped: umbrella; s2c-013 local + blocked). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit c8f16e1. New zero-token e2e `walkthrough-noncoder.mjs`: today's `npm create vite` starter (Vite 8.3) → init → 4 sketches using only the pen, keyboard and bar. The model is scripted in-process (`setScriptedModel`), and the real provider throws while a script is set, so no accidental spend. **First walk found 3 bugs every user hits:** (1) after any run the tool went idle, so **the second sketch drew nothing**; (2) a new section the layout centred failed placement verification, so the user saw it on screen and was told "I couldn't add what you drew" with Undo offered; (3) every change ended on `✓ [v2] 0% verified … revert: git restore --source=…`. All three fixed.
Result: section, red heading and signup form each end on "✓ Done: …" in ~4 s (scripted, no model time). vitest 1056/1058 (same 2 env failures); `tsc -b` clean; init-real-project, live-keymap (its Esc step was already red before this) and live-auto green. live-misread is red with and without this change. Pre-existing, not investigated. momentum 0.58 → 0.75
Blunt: this proves the path and the words, not the readings. A model's interpretation of these 4 sketches is still unmeasured. **"A working form" is still not proven:** the save edit lands, but the probe can't find the form after the edit shifts its line, and the card wrongly says it "wasn't safe to" try it.
New branches: s2c-031 save probe finds the form after the edit (value 4, effort 1, closes done #2's third change), s2c-030 plain progress lines (value 3, effort 1).
Pruned/done: nothing. s2c-010 stays active until s2c-031 lands.
**Needs you (s2c-013):** unchanged. The paid pilot still waits on a macOS run or a `CLAUDE_CODE_OAUTH_TOKEN`. Cheap add-on once it runs: the walkthrough's 4 sketches with real readings (~4 calls).

## 2026-10-16 23:40 UTC — sketch-to-code / s2c-029 Screenshot-arm dry run — **done**: the capture can't hang any more; rough dry 15/15 twice
Picked because: priority 2.45 (next: s2c-000 seed 2.00 skipped: umbrella; s2c-010 1.35; s2c-013 local + blocked, skipped). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit d1ea0b3. Reproduced: the screenshot dry run hung in both of 2 tries (r03, then r01). **It was not the port and mostly not a crash: `captureProbe` never returned.** The share dialog was bounded at 30 s, `video.play()` wasn't, and tab capture only sends a frame when the page repaints. Measured (0 tokens): one browser reused across pages, 4/10 captures never got a frame; overlay page in a fresh browser, 3/8 browsers frameless by the 3rd capture; with a 1 px repaint nudge, 0/32. Fix: the overlay flips one 1%-opacity pixel each frame while capturing, bounds play() at 10 s and says "try ▶ Run again". The bench gives screenshot mode a fresh browser per page, bounds the probe at 45 s and retries a wedge once before Run (lib/crash.mjs, 5 tests).
Result: `--set rough --dry --mode screenshot` 15/15 twice, 0 retries needed; `--mode auto` dry 15/15; vitest 1055/1057 (same 2 env failures); `tsc -b` clean. momentum 0.5 → 0.7
Blunt: plumbing for a measurement nobody has paid for yet. It also fixes a real-user bug: screenshot mode could sit on "capturing screen" forever. "vite never answered" didn't recur in 3 runs and I didn't explain it. macOS Chromium untested.
New branches: none. The cloud list is down to s2c-010 (non-coder walkthrough, SEED done #2), and the next cloud run goes there.
Pruned/done: s2c-029 done.
**Needs you (s2c-013):** the paid pilot is now ready on both arms. Either run it on macOS (commands in s2c-013 `blocked_on`) or give the run a `CLAUDE_CODE_OAUTH_TOKEN`. Still open: fr-005 (fine-routing).

## 2026-10-16 22:40 UTC (Mac run): sketch-to-code / s2c-013 Head-to-head pilot. **Not run: blocked.** The Mac run can't spend the approved quota.
Picked because: it was the only waterable node. s2c-013 scored ~3.0 (validate +1.0, needs: local); fine-routing is fully killed, with fr-005 waiting on you; fashion is all killed or done.
Why not run: the Mac shell is a Linux VM. It has no Claude Code login (the pipeline strips API keys on purpose, and the VM's `claude` only does `-p`), node_modules is darwin-arm64, and Playwright's CDN returns 403. The ~1M tokens you approved can only be spent on macOS itself, or here if you give a token.
Did instead (0 tokens, commit ebdc5b8): got the paid run ready. The rough set is now 15 pages, and `--dry --mode auto` passes 15/15. **Found:** the screenshot arm's tab capture crashes Chromium about 2 in 7 times. Before the fix, every later page then failed and the run hung. Now the bench relaunches the browser and retries a page once, but only if the crash came before Run (never after, so nothing gets billed twice). The retry worked on r08. Bench tests 84/84. docs/findings.md has the details.
Blunt: there is still no number on structure vs screenshots. Today's work only makes a paid run less likely to be wasted. The screenshot dry run still hit "vite never answered" on r10 and then hung on r11, and that is not fixed (→ s2c-029, cloud). It might be container-only. macOS was not tested.
New branches: s2c-029 make the screenshot dry run finish 15/15 (value 3, effort 1, cloud).
**Needs you (s2c-013):** (a) on macOS: `git checkout seed2tree && npm ci && npm run build`, then `node tests/bench/run.mjs --set rough --limit 1`, then `--set rough --mode auto`, then `--set rough --mode screenshot`, and commit `tests/bench/out/results.*.json` to seed2tree; or (b) give the run a `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) so it can run the pilot itself. Better to run s2c-029 first. Still open: fr-005.

## 2026-10-16 21:25 UTC — sketch-to-code / s2c-028 Ticking region vs click probe — **done**: a dead button next to a clock no longer passes
Picked because: priority 2.74 (next: s2c-010 1.34; s2c-000 seed 1.99 skipped: umbrella; s2c-013 3.04 local, skipped). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit a4e53f0. Before clicking, the probe watches the region for 1.1 s with nobody touching it. If it changes by itself, the trigger isn't clicked and the verdict is **unverified**: "the card changes by itself (a clock, a countdown or a slideshow in it), so a click on "Show stats" can't be told apart from that. Point the arrow at the part that should change." live-probe-click.mjs gained 3 cases. **Red on the old overlay:** a dead button in a card with a clock PASSED.
Result: dead button + clock → unverified; wired toggle + clock → unverified (honest, not clever); the same dead button with the arrow at its own panel → failed. 3/3 green with a 250 ms clock, 3/3 with a 1 s clock; live-probe + live-form green; vitest 1050/1052 (same 2 env failures); `tsc -b` clean; 0 tokens. momentum 0.5 → 0.7
Blunt: ~20 min of work, closes a false pass a non-coder would trust. Zero progress on whether drawing works. Costs 1.1 s per click probe. Still blind to a region that changes less often than 1.1 s (a 5 s carousel) and happens to change right after the click.
New branches: none. Nothing in the probe line is worth more than s2c-010 now; probe residue (a toggle stays toggled) is cosmetic.
Pruned/done: s2c-028 done. **The only open cloud node left is s2c-010 (non-coder walkthrough, SEED done #2). The next cloud run goes there by default.**
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 20:30 UTC — sketch-to-code / s2c-021 Behaviour probes — **done**: the click probe is judged live, and it was wrong twice before this
Picked because: priority 1.47 (next: s2c-010 1.34; s2c-000 seed 1.98 skipped: umbrella; s2c-013 3.03 local, skipped). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 6d9fbbf. New e2e `live-probe-click.mjs` writes a toggle fixture and probes 6 arrows through `/@s2c/probe`, 0 tokens. **Red on the old overlay in 2 of 6.** A button that only renamed itself ("Show tips" ↔ "Hide tips", the tips never appear) PASSED when the arrow pointed at its card. A theme switch (only the card's classes change) FAILED. Fix: the click probe reads the region without the trigger inside it, and classes and styles now count as a change. dismiss/filter/sort now count as behaviour words.
Result: wired toggle, theme switch, dismiss-that-unmounts and arrow-at-whole-card pass; no-handler and label-only fail. 4/4 green; live-probe (form) and live-form still green. vitest 1048/1050 (same 2 env failures); `tsc -b` clean. momentum 0.7 → 0.82
Blunt: this means "verified" no longer lies about a toggle. It doesn't make a single sketch read better. run2's probe step has still never run after a real reading (only unit tests). Known false pass: a region with anything that changes by itself (a clock, a carousel) passes any click → s2c-028. Also: `npm run typecheck` (`tsc -b --noEmit`) fails TS6310 on main too, before this change. `tsc -b` is the real check.
New branches: s2c-028 a self-changing region makes a click probe unverified (value 3, effort 1). It's cheap, so it will likely top the formula next. **s2c-010 (non-coder walkthrough, SEED done #2) is still the node that moves the seed.** Write "boost s2c-010" in INBOX to send the next run there.
Pruned/done: s2c-021 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 19:20 UTC — sketch-to-code / s2c-002 Reading survives the reload — **done**: the instant render's reload no longer kills the reading
Picked because: priority 1.53 (next: s2c-021 1.46, s2c-010 1.33; s2c-000 seed 1.98 skipped: umbrella; s2c-013 local, skipped). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit 6d7cef1. Before asking, the overlay parks the ink, the notes and a reading id in sessionStorage. The instant component's file is added once it lands. The server keeps the reply under that id for 5 min: the model call never stopped when the page died, its answer just had nowhere to go. The page after the reload puts the drawing back and long-polls `/@s2c/interpret/result`, so you reach the preview, and ✓ Go still refines the instant component instead of writing a second one. If the server restarted and lost the id, the drawing is back and the line says to press ▶ Run again.
Result: new e2e `live-reload-reading.mjs` uses the real instant render and the real reload, with the reading stubbed in the browser (0 tokens). **Red on the old overlay** (no preview, ink gone). After the fix: 3/3 green, then 4/4 after a server restart. 19 new unit/integration tests; the plugin test aborts the request mid-reading, the next page gets the same answer, and the model is asked once. vitest 1047/1049 (same 2 env failures); build + typecheck clean; live-auto/instant/keymap/misread/preview/ask green. momentum 0.5 → 0.7
**Found + fixed:** in auto mode (the default), pressing ▶ Run inside the 0.9 s settle window started a **second paid reading** of the same ink. The countdown now waits while any reading is in flight.
**Accident:** my first draft of the plugin test used vi.mock on `@s2c/pipeline`. The mock missed on first import and **one real model reading ran** (~9 s, a one-dot sketch, nothing written). It now uses a `setReadingHandler` seam, and no test imports the real reader.
Blunt: this makes the default config (instant on) measurable. It doesn't make sketches read better. Vite doesn't always full-reload for the new module (on a cold server it sometimes hot-updates), so the e2e reloads by hand when it has to. Not tested: a real model reading across a real reload (cloud can't pay), Safari/Firefox sessionStorage.
New branches: none. SEED done #4's "reading dies on reload" is now fixed with tests. The open cloud list is s2c-021 (toggle fixture left) and s2c-010 (non-coder walkthrough, SEED done #2). **s2c-010 is the one that moves the seed.**
Pruned/done: s2c-002 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 17:20 UTC — sketch-to-code / s2c-027 live-lasso e2e red — **done**: the test was polling wrong; it now waits out the reload
Picked because: priority 2.12 (next: s2c-002 1.52, s2c-021 1.46; s2c-000 seed 1.97 skipped: umbrella; s2c-013 3.02 local, skipped). Fashion killed, no overrule. sidequest/fine-routing: clone needs auth this run isn't granted, skipped.
Did: commit ad683b1. Reproduced: 5 of 6 runs red. An extract writes a new module, so Vite full-reloads the page at a moment the file watcher picks. Any read that straddled the reload died with "Execution context was destroyed". **This is not an overlay bug.** The overlay already parks the receipt in sessionStorage and resumes tweak mode, and the test checks both. Fix: every read waits out a reload-shaped error (bounded at 10 s, anything else re-thrown). A new assert checks that the extract really caused a reload, so the "receipt survives" checks can't pass without one.
Result: 10/10 green, 0 tokens. live-data and live-image 3/3 each (no sibling flake). vitest 1028/1030 (same 2 env failures); typecheck clean. momentum 0.5 → 0.7
Blunt: test hygiene, zero seed progress. It took ~20 min, which is what value 2 / effort 1 promised. Cloud env gotcha for the next run: Playwright 1.62 wants headless shell build 1234, but the image has 1194. Symlink it; don't run `playwright install`.
New branches: none. The open list is now s2c-002 (reload kills the reading), s2c-021 (behaviour probes, toggle fixture left), s2c-010 (non-coder walkthrough, SEED done #2). By the formula s2c-002 wins next. **s2c-010 is the one that moves the seed.** Write "boost s2c-010" in INBOX if you want it next.
Pruned/done: s2c-027 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 16:40 UTC — sketch-to-code / s2c-025 First five minutes in Design — **done**: clicking your own button no longer traps the next drag
Picked because: priority 1.51, tied with s2c-002 1.51 and won on the tie-break (its parent s2c-010 was watered today); next s2c-021 1.45. s2c-000 seed skipped: umbrella. s2c-013 local, skipped. Fashion killed, no overrule. sidequest/fine-routing: not reachable from this run (clone needs auth these repos aren't granted), skipped.
Did: commit 41efb67. Reproduced first: a new zero-token phase in `init-real-project.mjs`, with every model route stubbed, **failed 8 checks on the old overlay**. Click the button, then drag a box starting on the heading: you got "mt ≈14px — release to nudge with margin" and 0 strokes. Fix: after a click from drawing, a drag that doesn't start on the picked-up thing is a stroke. A still click picks the other thing up. Esc puts it down and you're drawing again. Alt+T keeps the old grab-anything. The bar now says *picked up the button "Save" — drag it to move, pull a corner to resize, drag anywhere else to draw*. The first click on a button, link or input per page load adds how to switch to ▶ Test. The px, size, layout and file details moved to the tooltip.
Result: 11 unit tests; init-real-project ALL PASS, 0 model calls. live-surface, live-tweak, live-paint, live-keymap green (tweak/paint updated for the new wording). vitest 1028/1030 (same 2 env failures); build + typecheck clean. momentum 0.5 → 0.7
Blunt: this is polish on confusion, not proof that drawing works. Not tested: a real person, touch/pen input. A drag inside a big picked-up container still moves it (the line says so, but a non-coder who picked up a whole section will still be surprised). Found and not fixed: **live-lasso.mjs is red on seed2tree with or without this change** → s2c-027.
New branches: s2c-027 live-lasso e2e red after the extract's reload (value 2, effort 1; it will top the formula next run because it's cheap, so bump s2c-010 if you'd rather the run go there)
Pruned/done: s2c-025 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 15:20 UTC — sketch-to-code / s2c-026 Undo vs a hand edit — **done**: Ctrl+Z no longer erases changes you made by hand
Picked because: priority 2.40 (next: s2c-002 1.50, s2c-025 1.50; s2c-000 seed skipped: umbrella; s2c-013/008 local, skipped; fashion killed, no overrule)
Did: commit 46499cb. **The bug was wider than filed.** Undo restored *every* file that differed from the checkpoint. A hand tweak to *any* tracked file, made after a sketch, was erased by Ctrl+Z, not just a tweak to the file the sketch edited. Fix: each undo entry now records the files its edit wrote, and undo reverts only those. If one of those files was changed by hand since the tool's last state, undo refuses: "Undo stopped: src/App.jsx was changed by hand… Nothing was changed." If the hand change is already committed, undo goes ahead, because git still has it. An undo can't make a hand edit count as the tool's own, so the next sketch is still refused over it. The overlay shows the refusal as a plain sentence, not "undo failed:".
Result: 11 unit tests. `init-real-project.mjs` on the real Vite 8 starter, allowDirty unset, 0 tokens: undo over a same-file hand edit is refused and changes nothing; once the tweak is removed, undo reverts only App.jsx; a hand edit to main.jsx survives. ALL PASS. vitest 1017/1019 (same 2 env failures); build + typecheck clean; live-misread/keymap green. momentum 0.5 → 0.7
Blunt: this protects coders, not the non-coder the seed is about. Chose refuse over 3-way hunk reversal, which would be nicer and more code. Not tested: the refusal line rendered in a browser (only the endpoint), and the touched list after a real agent run (only codemods were tested). Undo entries saved before this fix fall back to the old full revert, which the same refusal now guards.
New branches: none. History scrub (restoreVersion) was checked: it records the current state first, so it doesn't have this bug.
Pruned/done: s2c-026 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. **Formula vs value:** s2c-010 (non-coder walkthrough, SEED done #2) scores lowest (1.32) because its momentum and confidence are modest. It is still the node that moves the seed. Bump it in INBOX if you want the next run there instead of s2c-002/025.

## 2026-10-16 14:40 UTC — sketch-to-code / s2c-024 Change #2 must not be refused — **done**: a non-coder now gets change #2, #3, …; a hand edit is still refused, before the paid read
Picked because: priority 2.50 (next: s2c-002 1.50, s2c-025 1.50; s2c-000 seed skipped: umbrella; s2c-013/008 local, skipped; fashion killed, no overrule)
Did: commit 9264bd6. Didn't take the cheap fix (init writes allowDirty:true): that would let Undo silently overwrite a coder's hand edits. Instead the tool remembers every tree it left behind, after each edit and each undo, as a git tree hash built in a throwaway index. A dirty tree that matches one of those is allowed. Anything else is refused, and the refusal names the file: "src/App.jsx changed outside sketch2code since its last edit… commit it, or set allowDirty". `/@s2c/interpret` now checks this first, so a refusal no longer costs a model call. `.sketch2code/`, `server/data/` (form submissions) and `node_modules/` never count.
Result: 10 unit tests. `init-real-project.mjs` now runs on an init'd app with allowDirty unset: changes #1–#3 land, undo steps back, an edit after the undo lands, undo returns the committed file, and a hand edit is refused by both a codemod and `/@s2c/interpret`. All checks pass, 0 tokens. vitest 1006/1008 (same 2 env failures); typecheck clean; live-ask/image/misread/keymap green. momentum 0.5 → 0.7
**Found + fixed on the way:** (1) My first version passed its unit tests and was dead in a real project. Excluding a gitignored folder by pathspec makes `git add` exit 1, so every tree id came back null. The e2e caught it. (2) A project with no `.gitignore` got `node_modules` committed by init, and Vite's cache then dirtied the tree, so even change #1 was refused. init now ignores `node_modules/`.
Blunt: only zero-token codemods were tested as change #2. A real agent run as change #2 hasn't been tested (cloud can't pay). Hashing the tree on every edit is fine on a starter app; on a big monorepo it isn't measured. This removes a wall; it says nothing about whether drawing works.
New branches: s2c-026 Undo must not throw away a hand edit made after the tool's edit (value 3: today Ctrl+Z restores the checkpoint over it, silently)
Pruned/done: s2c-024 done. s2c-010 is unblocked: next is walking all 3 changes with a stubbed interpret.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 13:45 UTC — sketch-to-code / s2c-010 Non-coder walkthrough — watering 1: **a non-coder gets exactly one change, then it refuses**
Picked because: priority 1.56 (next: s2c-021 1.43, s2c-002 1.49; s2c-000 seed skipped: umbrella; s2c-013/008 local, skipped; fashion killed, no overrule)
Did: docs/walkthrough-noncoder.md. Walked today's real `npm create vite --template react` (Vite 8, plain CSS) through init → dev → click → sketch with Playwright. Init and stamping work on Vite 8.
**Blocker:** change #2 is refused. checkpoint refuses a dirty tree, `init` leaves `allowDirty` unset, nothing commits after a run. So the 2nd sketch ends in "refusing to edit: working tree has uncommitted changes… set sketch2code({ allowDirty: true })", *after* paying for the read. Every e2e uses the demo app's `allowDirty: true`, so none caught it. SEED done #2 needs 3 changes.
**Fixed:** init/doctor/READMEs/the bar said "press Alt+D to draw", but the page already opens drawing, so following it turned drawing OFF. The CLI e2e was red on exactly this. Now it says the page opens ready and Alt+D pauses; the bar says "drawing paused". CLI e2e all green; keymap + ask green; vitest 995/997 (same 2 env failures); typecheck clean.
Also: clicking your own app only selects it ("button · 120×33 · flex row · src/App.jsx"), and a drag after a click nudges the selection instead of drawing. Reading took ~10.5 s before codegen (1 sample).
Blunt: the real non-coder wall is step 0: Node, a terminal, Claude Code installed and signed in. Hosted tools don't have it. Nothing in this repo fixes that.
Accident: cloud Claude Code is signed in through the host even with a wiped env, so one probe made a **real paid run** (killed at ~45 s, nothing written). Logged so no cloud run repeats it. momentum 0.5 → 0.58
New branches: s2c-024 change #2 must not be refused (value 5, ~2.5 priority, next), s2c-025 first five minutes in Design (value 3)
Pruned/done: nothing; s2c-010 stays active (3 changes not yet walked end to end; needs s2c-024 + a stubbed interpret).
Needs you: nothing new. The Mac run still owes the s2c-013 pilot.

## 2026-10-16 12:30 UTC — sketch-to-code / s2c-021 Behaviour probes — watering 1: a dead form now fails verification, and the probe found a real reload bug
Picked because: priority 1.54 (next: s2c-010 1.53, s2c-002 1.46; s2c-000 seed skipped: umbrella; s2c-013 local, skipped; fashion killed, no overrule)
Did: commit 0a8a7b0. The verifier now *uses* the page. A `save` is tested by filling in the form and submitting it in the browser. The plugin sends a probe over SSE, the overlay acts through React's own events, and the server restores `server/data/` byte for byte. A submit nothing handles is cancelled instead of navigating away. A component that calls another host is never clicked; it is reported as unverified, never passed. `verifyActions` counts the result, and the card never says "Done." for an untested behaviour.
Result: new `tests/e2e/live-probe.mjs`, 6 phases, 0 tokens, 3/3 green. Dead form: FAILS ("sends what was typed nowhere"). Made real: PASSES. Store byte-identical, both absent and pre-seeded. Handler removed: FAILS. No handler: FAILS, no navigation. Third-party fetch: UNVERIFIED, request never sent. 28 unit tests. vitest 995/997 (same 2 env failures); build + typecheck clean; live-form/misread/api/ask/image/keymap green. momentum 0.5 → 0.7
**Found + fixed a shipped bug:** Tailwind v4 scans `server/data/*.json`, so *every submit of a form made real here full-reloaded the app*. That wiped the "Saved" line and anything else on screen. live-form missed it because it only checked the first submit. The plugin now ignores `server/data/` for HMR.
Blunt: only `save` is proven live. The click probe (arrow from button to region + "shows") is unit-tested but has no live fixture. run2's probe path hasn't run against a real model. A probe leaves its "Saved" line on the page until reload. This verifies; it doesn't make behaviour easier to draw.
New branches: none. The toggle fixture is the rest of this node's done_when.
Pruned/done: nothing.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: the formula now puts s2c-010 non-coder walkthrough (~1.54) narrowly ahead of finishing s2c-021 (~1.42).

## 2026-10-16 11:40 UTC — sketch-to-code / s2c-023 Picture into a box — **done**: drop or paste an image onto a placeholder, zero tokens
Picked because: priority 1.62 (next: s2c-021 1.55, s2c-010 1.54; s2c-000 seed 1.92 skipped: umbrella, not a task; s2c-013 local, skipped; fashion killed, no overrule). Last run preferred s2c-021; no INBOX bump, so the formula decided.
Did: commit 92551e4. New `pipeline/src/asset.ts` + `/@s2c/place-image` + overlay drop/paste handlers. The bytes are sniffed, not the file name. Unsafe SVGs (script, onload=, javascript:, foreignObject, entities) and files over 5 MB are refused. The file goes to `src/assets/` (imported) when the app has it, else `public/`, named by content hash, so the same picture twice is one file. The box becomes an `<img>` that keeps its size classes. Dropping on the box's "Logo" label fills the box, not the label.
Result: 19 unit tests. New `tests/e2e/live-image.mjs`: real DragEvent and ClipboardEvent, 5 checks, 0 interpret calls. The PNG and JPEG decode at 160×96. A PDF and a card with a heading + button are refused in words with nothing written. Two Ctrl+Z leave App.tsx byte-identical and public/ empty. live-paint/misread/ask/props/keymap still green. vitest 965/967 (same 2 env failures); build + typecheck clean. momentum 0.5 → 0.7
Blunt: this is a convenience feature every visual builder already has (Lovable, v0, Onlook all take image uploads). It says nothing about whether drawing-as-instruction works. Not covered: dropping onto an X-box that hasn't been built yet; you have to run the sketch first. It isn't in the `?` keymap either. An app's own image-paste handler outside an input gets pre-empted by the overlay.
New branches: none. A "drop on unbuilt ink" branch isn't worth adding until s2c-010 shows someone actually tries it.
Pruned/done: s2c-023 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-021 behaviour probes (value 5, now top of the cloud list). It's the one that tests whether a drawn trigger→effect actually works.

## 2026-10-16 10:50 UTC — sketch-to-code / s2c-020 Bare ring asks — **done**: a ring with no words and no colour gets a question, not a paid guess
Picked because: priority 1.71 (next: s2c-023 1.61, s2c-021 1.54; s2c-000 seed 1.91 skipped: it is the umbrella, not a task; s2c-013 local, skipped; fashion killed, no overrule)
Did: commit 783cd3e. v2 had no ask path; `unclear` only shows after the paid call. Now the overlay checks before /@s2c/interpret. If the sketch is only closed default-ink rings/boxes around existing elements, with no note, in a gesture reading, it asks: "What should change about "Get started"? Type a word … or redraw it in a pen colour (Alt+P). ▶ Run again sends it as it is." A note opens on the ring, so the answer is just typing. In auto mode, answering re-arms the run.
Result: 18 unit tests on the bench's own strokes. With every word removed, only r03 asks; r01/02/04/05/06/12/13/14/15 do not. An empty box in an empty slot (r15) is "add here" and never asks. New `tests/e2e/live-ask.mjs`: 5 live checks, 0 interpret calls where it asks. live-label/auto/notes/misread/keymap/noterefs/pen still green. vitest 946/948 (same 2 env failures); build + typecheck clean. momentum 0.5 → 0.7
Found: the ink classifier calls r05's three-sided box closed, and a box that runs past its start a "diamond". I worked around both with a closing-gap check and left the classifier alone (v1 is legacy).
Blunt: this saves a token spend and a wrong edit on one narrow case. It is not proof the thesis works. A box drawn as 4 separate strokes still goes to the model. Nobody has seen the question yet, so whether people answer it or just hit Run again is unknown (s2c-010).
New branches: none.
Pruned/done: s2c-020 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: the formula says s2c-023 image drop (1.62), but I'd take s2c-021 behaviour probes (1.55, value 5). It is the bigger unlock: today a button that does nothing reports "verified". Bump it in INBOX if you agree.

## 2026-10-16 09:10 UTC — sketch-to-code / s2c-022 Stop means stop — **done**: the cap and Esc now actually stop the agent
Picked because: priority 3.50 (next: s2c-000 seed 1.90, s2c-020 1.70; s2c-013 local, skipped; fashion killed, no overrule)
Did: commit 456255f. One AbortSignal now runs from `/@s2c/run` into runV2/runPipeline and the SDK's `abortController`. Esc calls a new `/@s2c/run/abort`. The plugin sends `error-event`, takes the undo entry and frees the slot only **after** the pipeline has returned. The codemods, scaffolds, finishing pass and HMR waits check the signal too. The undo stack is saved to `.sketch2code/undo.json` (validated on load). Checkpoints are pinned under `refs/s2c/cp/`, so `git gc` can't delete them.
Result: 15 new tests, zero tokens. A fake agent keeps editing and honours the stop 60ms late; the file at `error-event` matches the file 80ms later. A second run gets 409 while the first is stopping. Undo restores after a restart plus `gc --prune=now`. A control test shows unpinned stash objects really do die under gc. vitest 928/930 (2 known env failures); build + typecheck clean; live-misread/label/keymap green. momentum 0.5 → 0.7
Blunt: this closes the one path where Undo could lie. It is not the thesis. Not checked: how fast the real SDK subprocess dies (that needs a paid run), and there is no browser e2e for Esc. A run that ignores the signal now holds the slot until it returns. That is correct, but a hung handler means restarting the dev server.
New branches: none. Rewording the "stopping…" status line would be busywork.
Pruned/done: s2c-022 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-020 bare ring asks instead of guessing (1.70), or s2c-021 behaviour probes (1.53, value 5: the bigger unlock).

## 2026-10-16 08:20 UTC — sketch-to-code / s2c-017 Harness design doc — **done**: the verifier can't see behaviour, and the run timeout doesn't stop the run
Picked because: priority 1.84 (next: s2c-020 1.69, s2c-010 1.50; s2c-013 local, skipped; fashion killed, no overrule)
Did: docs/harness.md (commit 12ba0ec). History, multi-step builds, behaviour, data and assets, each checked against the code with path:line citations. Every section ends in a decision, not a wish list.
Found: (1) **Behaviour is never verified.** The verifier diffs static DOM snapshots, and `verifyActions` has no branch for save/serve. A "make this button add a row" that does nothing reports verified, and a non-coder has no way to tell. (2) **Trust bug:** the 12-min run cap is a `Promise.race` with no AbortSignal anywhere. On timeout or Esc the agent keeps editing after the undo entry is taken and the run slot is freed, so Undo can be overwritten. (3) The undo stack is memory-only (lost on dev-server restart), and history stash objects can be gc'd.
Result: doc only. vitest 912/915 (the 3 known env failures, fresh container); build + typecheck clean. momentum 0.5 → 0.7
Blunt: history and data are closer to done than the tree implied. Don't build branches, a run planner, a draw-during-run queue, auth/db/deploy, or routes before behaviour probes. Each is either Cursor/Lovable's turf or speeds up a step nobody has measured working.
New branches: s2c-021 behaviour probes (the drawn trigger→effect is the acceptance test), s2c-022 stop means stop + undo survives restart, s2c-023 drop an image onto a drawn placeholder
Pruned/done: s2c-017 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-022 (priority ~3.5, a correctness bug).

## 2026-10-16 07:07 UTC — sketch-to-code / s2c-011 Misread explanation + undo — **done**
Picked because: priority 1.83, tied with s2c-017 1.83; picked 011 because it ships tested code for SEED done #4 (next: s2c-020 1.68, s2c-010 1.49; s2c-013 local, skipped; fashion killed, no overrule)
Did: commit d7e88a9. A run that misses part of a sketch now shows a card: "I read your sketch as: … But I couldn't move the section with "Team members". Undo puts your files back the way they were." with **↩ Undo** (one click) and Keep it. The sentence comes from the action kind and the visible text, never from the verifier's reasons. The card survives the reload and the next run clears it. Bug fixed: a run that crashed part way was never pushed onto the undo stack, so Ctrl+Z reverted your *previous* edit and left the broken one in place.
Result: 15 unit tests + `tests/e2e/live-misread.mjs` (6 live checks, zero tokens: real write, reload, click Undo, App.tsx byte-identical). live-label/notes/props still green. vitest 913/915 (same 2 env failures); tsc -b clean. momentum 0.5 → 0.7
Blunt: this is trust plumbing, not the thesis. Every competitor has checkpoints and undo. It matters only because SEED #4 demands it. The sentences are templates no non-coder has read. Legacy v1 runs get nothing. The bar still shows `[v2] 50% verified · … git restore`.
New branches: none. Rewording the status line is busywork until s2c-010 shows it confuses someone.
Pruned/done: s2c-011 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-017 harness design doc, then s2c-020.

## 2026-10-16 06:20 UTC — sketch-to-code / s2c-006 One-key note — **done**: draw, then just type
Picked because: priority 2.21 (next: s2c-011 1.81 / s2c-017 1.81, s2c-020 1.66; s2c-013 2.91 local, skipped; fashion killed, no overrule)
Did: commit 54ab6ac. The first printable key after a stroke opens a note on that drawing's stroke cluster, not on whatever the pointer is over, with the key already typed. Enter attaches. A word on a shape went from 4 steps to 2. One-shot: label, undo, Clear, a click or the test surface hands keys back to the host page. `?` still opens help. In auto mode, typing during the countdown holds the run.
Result: 9 unit tests + new `tests/e2e/live-label.mjs` (6 live checks, zero tokens) green. live-notes/keymap/noterefs/auto still green. vitest 898/900 (same 2 env failures); typecheck clean. momentum 0.5 → 0.7
Blunt: this is ergonomics, not the thesis. It makes "sketch + a few words" cheaper, but it says nothing about whether the reading is right. Weak spot: in auto mode you get 0.9 s to start typing. Pause longer and an empty box is read without its word. That belongs in s2c-020, and is logged there.
New branches: none. A bench driver for the new path would be busywork.
Pruned/done: s2c-006 done.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-011 misread explanation + undo, or s2c-017 harness design (tied).

## 2026-10-16 05:25 UTC — sketch-to-code / s2c-015 Visual language — **done** (row 9 page added)
Picked because: priority 4.12 (next: s2c-006 2.20, s2c-017 1.80 / s2c-011 1.80; s2c-013 local, skipped; fashion killed)
Did: commit 50be541. New `BASE_LIST_APP`: three tiles in a four-column grid, so there is an empty slot. **r15** is one loose empty box in that slot, no words. New `siblings` edit check: the list now has ≥4 items, whatever tag the new one uses. 6 unit tests, plus v1 reads r15 as ADD into the row.
Result: r15 fails untouched (0.80) and passes edited, with and without words. `--dry` draws all 15 rough pages in Chromium, 0 failed. Fixed a bench bug: reusing the scratch app on a new port baked any leftover `src/` edits into the "blank" app. vitest 889/891 (same 2 env failures); typecheck clean. momentum 0.7 → 0.82
Blunt: the bench now has 6 pages judged with no words (r01, r04, r06, r12, r13, r15) and zero tokens spent. More bench pages are now busywork. Nothing here says the thesis works until the s2c-013 pilot runs on the Mac.
New branches: none.
Pruned/done: s2c-015 done (16/16 edits mapped; the bare-ring conflict is s2c-020).
Needs you: nothing new. Mac pilot: `--set rough --only r12,r13,r15 --words none` is the purest "the mark is the command" test. Next cloud run: s2c-006 one-key note.

## 2026-10-16 04:10 UTC — sketch-to-code / s2c-015 Visual language spec, checked against the readers
Picked because: priority 2.26 (next: s2c-006 2.16, s2c-011 1.76 / s2c-017 1.76; s2c-013 local, skipped; fashion killed)
Did: docs/visual-language.md (commit e5ba440). 16 common edits, each mapped to a mark or to the reason there isn't one, and checked against both readers. Only **7/16 are carried by a mark alone** (delete, move, reorder, swap, colour, add another, add new UI). 4 need words for *what*. 4 lose outright to a drag or a button (resize, align, short moves, "make it work"). Don't build gestures for those.
Found: (1) **s2c-016 was wrong**: restyle colour needs no words. The overlay pen colour (Alt+P) already carries the value; the bench just couldn't draw in colour. It can now (`pens:`, set through the real UI). r12 = r03 with zero words. (2) Arrows over ~600px lost their heads in ink/scene.ts and read as plain lines. Fixed and tested. (3) The legacy v1 reader turns a swap into 2-3-1 and ignores an X. Recorded, not fixed.
Result: new pages r12 green-pen ring, r13 two-arrow swap, r14 caret + "Blog". All pass rough-check with and without words, and --dry draws them in Chromium. vitest 877/880 (same 3 env failures); `tsc -p` clean. Still zero tokens, so this measures nothing live. momentum 0.5 → 0.7
New branches: s2c-020 a bare ring (default ink, no words) asks a question instead of a paid guess
Pruned/done: s2c-015 active, not done: a page for "add one more to a list" needs a base page with an empty slot (one short watering).
Needs you: nothing new. For the Mac pilot, r12 + r13 in `--words none` are now the purest test of "the mark is the command".

## 2026-10-16 03:20 UTC — sketch-to-code / s2c-016 Sketch-alone scoring — bench now separates what the ink carries from what the words carry
Picked because: priority 2.26, tied with s2c-015 2.26 (next: s2c-006 2.16; s2c-013 local, skipped; fashion killed). Picked 016 because it ships tested code, and the Mac pilot can use it.
Did: `--words all|content|none` (commit 80dcdf3). Each rough note now declares its `content`: the words no mark could carry. The rough set types 64 words in all, 32 in content, 0 in none. r04's arrow types nothing in content mode. With no words, checks only words can pass are dropped. r03 then can't be graded (a ring can't say "green"), so it is not judged and not run. `words-compare.mjs` reports realized %, words typed and words per realized page for each arm.
Result: zero-token only. All 3 arms draw every page in --dry, and auto routing is identical across arms. rough-check proves the no-words key on a real DOM. 17 new tests; vitest 864/866 (same 2 env failures); typecheck clean. Blunt caveat: the content/action split per note is my judgement, written into each spec so you can argue with it. Until a paid run, this measures nothing about the thesis. momentum 0.5 → 0.7
New branches: none. A tidy-set classification would be busywork until the rough numbers exist. r03's finding was fed to s2c-015: restyle is "needs words" unless a mark can carry a value.
Pruned/done: s2c-016 done.
Needs you: nothing new. Optional for the Mac pilot, inside the approved ~1M only: `--only r04,r05,r08 --words content`. Next cloud run: s2c-015 visual-language spec.

## 2026-10-16 02:20 UTC — sketch-to-code / s2c-019 Skema inspected — **correction: it's a pointer tool, not your thesis**
Picked because: validate node, priority 3.39 (next: s2c-015 2.24, s2c-016 2.24; s2c-013 local, skipped; fashion killed)
Did: read-only shallow clone of Skema at 976bc26. None of its code was run. Findings in seed2tree/VALIDATION.md §s2c-019.
Result: **last run's s2c-018 was wrong about Skema.** Every annotation needs typed words: the submit button is disabled on empty text. Its "scribble-delete" erases your own overlay ink, not page elements. Its `gesture` type is dead code. The prompt tells the agent not to verify. Undo is `git stash create`, which leaves agent-created files behind. It has no tests. So no known shipped or open-source tool on a live codebase acts on a mark alone. Your claim is stronger, but it's still not a moat: adding that step to any of these tools is small. npm last publish 2026-02-13, commits through 2026-09-30, stars unverified. No code changed here, so no tests were run. momentum 0.5 → 0.7
New branches: none. Nothing in Skema is worth copying: this repo's history.ts undo already handles untracked files.
Pruned/done: s2c-019 done; s2c-018 table rows 1–3 corrected.
Needs you: nothing new. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-015 visual-language spec or s2c-016 notes-off scoring (tied).

## 2026-10-16 01:40 UTC — sketch-to-code / s2c-018 VALIDATE differentiation — verdict: **claim holds narrowly, not a moat**
Picked because: validate node, priority 5.22 (next: s2c-013 2.82 local, skipped; s2c-015 2.22, s2c-016 2.22)
Did: 14-task table in seed2tree/VALIDATION.md (here vs Cursor Design Mode vs Lovable Draw vs tldraw make real vs Skema), from docs, not hands-on. Cursor's and Lovable's own docs confirm that the drawing says where and the words say what. **New evidence: [Skema](https://devpost.com/software/skema-wta8kn)**, a Jan 2026 hackathon project, already does scribble-delete and sketch-to-React on a live localhost app, with diffs applied. Word's Ink Editor has shipped proofreader marks as commands for years. Code Shaping (Waterloo) found arrows are the most ambiguous mark.
Result: marks alone carry 8/14 tasks here. The real edge is delete marks, wireframe-add with the symbol lexicon, and the caret. Move, restyle and copy are not edges: drag-and-drop, sliders and inline text need no words either. The idea is not unclaimed. What's defensible is grounding + DOM verification on rough ink, and it's worth nothing until s2c-013/016 measure it. The bench's own r04/r05 notes restate what the ink should say. No code changed, so no tests were run. momentum 0.5 → 0.7
New branches: s2c-019 inspect Skema first-hand (fetch was blocked this run)
Pruned/done: s2c-018 done. Seed not re-litigated: Skema is a demo, not a product.
Needs you: nothing. The Mac run still owes the s2c-013 pilot. Next cloud run: s2c-015 or s2c-016 (tied at 2.22), then s2c-019.

## 2026-10-16 — sketch-to-code / re-plan: owner overrule applied, seed is PURSUE
Did: applied INBOX (3)+(4) and your chat message. My PIVOT was wrong on the framing: every competitor I found uses the sketch as a **pointer** plus a typed or spoken instruction. Here the **mark is the command**, sketch first with text as support. Recorded in s2c-000/012. s2c-013 is now a measurement, not a kill gate (pilot still approved).
Un-pruned: s2c-006 one-key note, s2c-010 non-coder walkthrough, s2c-011 misread explanation + undo. s2c-005 (5 real repos) stays pruned until the language and harness exist.
New: s2c-015 visual-language spec (a gesture for every common edit), s2c-016 sketch-alone vs sketch+words score, s2c-017 harness design (history, multi-step, behaviour, no editor), s2c-018 VALIDATE the differentiation on 10+ concrete tasks vs Cursor / Lovable / tldraw make-real.
Next cloud run: s2c-018 (validate +1.0), then s2c-015. No more idle runs.
Needs you: nothing. s2c-008 tidy re-score quota is still open but not urgent.

## 2026-10-16 — sketch-to-code / s2c-013 unblocked: kill-test PILOT approved
Did: you answered in chat: **pilot, ~1M tokens**. s2c-013 is now open (needs: local) with the run recipe in its log. No code changed.
Next: the local (Mac) run picks it: 1 run of --mode auto and 1 of --mode screenshot on the rough set, then a pilot table + provisional verdict. If it lands near the 15-point bar, it will ask for the other 2 runs.
Needs you: Mac awake for the local run. s2c-008 (tidy-set re-score) is still blocked on its own quota question; it is not part of the pilot.

## 2026-10-15 07:55 PT — sketch-to-code / (idle, no watering) — repeated 09:55, 10:55, 11:55, 12:55, 13:55, 14:55, 15:55 and 16:55 PT, state unchanged
Picked because: nothing worth watering. Candidates: s2c-002 1.29 (value 3, parked until the kill-test verdict: it fixes instant render, which the bench doesn't use); s2c-008/013 blocked on you; fashion killed. No new INBOX items in either garden.
Did: synced both gardens, checked locks (none), read INBOX/tree. No code changed. Building s2c-002 now would polish a product that VALIDATION.md says loses, and it would be wasted if s2c-013 says KILL.
Needs you: **s2c-013 quota: reply "yes" (~3M tokens), "pilot" (~1M) or "no" in INBOX.** Until then every hourly cloud run is idle; pause the scheduled task if you don't want to pay for that.

## 2026-10-15 07:10 PT — sketch-to-code / s2c-007 Codegen agent kept out of .sketch2code/
Picked because: priority 1.54 (next: s2c-002 1.29; s2c-000 is the root container; fashion killed; s2c-008/013 blocked on you)
Did: traced how a stale library row reached a run. **The agent is ruled out for that incident**: live-instant, which caught it, stubs both model routes, and no deterministic code reads the library into a run. The "stale library" explanation in 14fda87 has no code path behind it. Cause unknown, not worth chasing. **The exposure is real anyway**: with the real CLI binary against a mocked API (zero tokens), Glob listed `.sketch2code/` despite .gitignore (it runs rg --no-ignore --hidden), Read returned stored component source, and Write overwrote the library index. Codegen now denies `Read/Edit(./.sketch2code/**)`.
Result: 4 unit tests plus `tests/e2e/codegen-private-state.mjs`, both failing on the old rules. vitest 847/849 (same 2 env), typecheck clean. This matters for the kill test: the screenshot arm is told to find files itself, so it was the most exposed. momentum 0.5 → 0.7
New branches: none. Nothing here is worth a node.
Pruned/done: s2c-007 done.
Needs you: **s2c-013 quota: reply "yes" (~3M tokens), "pilot" (~1M) or "no".** The cloud has run out of useful work. The only open node is s2c-002 (value 3), which shouldn't be built before the verdict. Until you answer, cloud runs will log "idle" and won't invent work. If you'd rather stop paying for hourly runs, pause the task.

## 2026-10-15 06:05 PT — sketch-to-code / s2c-014 Scaffold only depictions and decorations, never widgets
Picked because: priority 2.90 (next: s2c-002 1.65, s2c-007 1.50; fashion killed, s2c-008/013 blocked on you)
Did: `buildScaffold` ignored fidelity, so at the default slider a plain card box or button outline was written into a `SketchShape` component labelled "drawn by the user, keep it", while the prompt said to rectify widgets. It now scaffolds only `recognized` (a drawn thing) or `verbatim` (a decoration). The trace rung still scaffolds widgets on purpose, because at resemblance ≥0.85 you asked for a copy.
Result: 4 tests (the 2 widget tests fail on the old code). Exposure on the bench's own ink with a worst-case reading: 20/20 design pages got a box-tracing scaffold before, 0 after. Real multi-action readings are unmeasured. vitest 843/845 (same 2 env), typecheck clean. momentum 0.5 → 0.7
New branches: none. s2c-002 (reload bug) re-scored value 5→3: the bench runs with instant off, so it can't affect the kill test.
Pruned/done: s2c-014 done.
Needs you: s2c-013 kill-test quota. Reply "yes" (~3M tokens), "pilot" (~1M) or "no". After s2c-007, nothing left in the cloud is worth doing without that answer, and the gardener will say so instead of inventing work.

## 2026-10-15 05:35 PT — sketch-to-code / s2c-003 Per-group fidelity (text never traced)
Picked because: priority 1.81 (next: s2c-002 1.61, s2c-007 1.46; fashion killed, s2c-008/013 blocked on you)
Did: the page-05 fix was prompt-only. Four deterministic parts still traced text: grounding fitted a path for every cited stroke, the pre-codegen scaffold wrote those as "keep these paths", the trace rung forced verbatim on everything, and the trace-rung composition check penalised squiggles that came back as words. The instant render also mounted squiggles as SVG. New `textmark.ts` decides from the ink (level, thin, oscillating hard). Text strokes become `textMarks` with no path, so none of those parts see them.
Result: calibrated on bench generators. Every text squiggle on the tidy and rough pages is flagged; decorative waves (08, 14), lines, boxes, rings, arrows and hatch are not. Replaying page 05's failing reading gives paths only for the logos and avatar. 10 tests, vitest 839/841 (2 env), tsc clean. Live effect is unmeasured. momentum 0.5 → 0.7
Why it matters despite the PIVOT: the structured arm of the kill test (s2c-013) was being handed traced squiggles on every design page. Without this, a KILL could have been caused by our own bug, not by structure losing.
New branches: s2c-014 scaffolds are also written for plain widgets (card/button boxes as "keep these paths"); same class of bug, effort 1.
Pruned/done: s2c-003 done.
Needs you: s2c-013 kill test quota, reply "yes" (~3M), "pilot" (~1M) or "no". Every remaining cloud node is now pre-kill-test hygiene; after s2c-014 there's little left worth doing without that answer.

## 2026-10-15 04:15 PT — sketch-to-code / s2c-009 Rough-sketch benchmark
Picked because: priority 2.31 (next: s2c-003 1.76, s2c-002 1.56; fashion is killed, nothing to water there)
Did: `--set rough`: 11 pages at most 4 marks each, drawn with new loose primitives (unclosed/skewed/partial boxes, drifting ring, one-stroke arrow, scribble). 6 are EDITS on a committed base landing page (delete card, rewrite headline, restyle button, move quote, add newsletter, X-out nav link): the first time the gesture grammar is in the bench at all. Edit pages are scored by checks (absent/present/kept/above/bg). Commit below.
Result: zero-token only. --dry: 11/11 draw; auto sends gesture on all 6 edits, design on the 5 new-UI pages; every page scores NOT realized untouched (runner now fails a vacuous spec). rough-check.mjs: every edit spec passes once the change is made by hand. Rougher by stated measure (>=3x shape deviation, open boxes, 2.7 vs 1.8 words/mark) without crossing the reader's delete threshold. Caveat: the roughness is my synthetic model of a hurried hand, not recorded human sketches. vitest 829/831 (same 2 env), tsc clean. momentum 0.5 → 0.7
New branches: none. The next useful step is the kill test (s2c-013), and that is your quota call, not more building.
Pruned/done: s2c-009 done.
Needs you: s2c-013 kill test is now unblocked except quota: reply "yes" (~3M tokens, 2 arms x 3 runs, on the Mac), "pilot" (~1M, 1 run each arm) or "no". Without it, remaining open work (s2c-002/003/007) is polishing a product the validation said loses.

## 2026-10-15 02:05 PT — sketch-to-code / s2c-012 VALIDATE — verdict: **PIVOT** (product framing is dead)
Picked because: validate node, priority 4.98 (next: fash-007 validate 4.35, s2c-009 2.31)
Did: competitor sweep with links in seed2tree/VALIDATION.md. Drawing on a running app to edit code already ships: Cursor Design Mode (draw over live UI, Jun 2026), Lovable Draw annotation (cleans rough shapes, aimed at non-coders), v0 annotations, Bolt visual edits, Onlook (Vite, 26k stars), Annotask (MIT Vite plugin, same idea), Claude Code Desktop element-select. Non-coders use those hosted tools and won't run a local Vite plugin; devs already have Cursor. "Sketch2Code" is also a NAACL'25 benchmark's name. Built bench `--mode auto|gesture|design|screenshot` so the one open question can be measured (commit below).
Result: PIVOT to a kill test: does structured grounding beat screenshot-only on rough sketches by >=15 pts realized %? If not, KILL the seed. Also found: every current bench page reads as `design` in auto, so the gesture grammar (the only unclaimed feature) has never been measured. vitest 805/807 (2 env), tsc clean. momentum — → 0.7
New branches: s2c-013 head-to-head kill test (needs s2c-009 + quota)
Pruned/done: s2c-012 done; PRUNED s2c-005 onboarding, s2c-006 one-key note, s2c-010 non-coder walkthrough, s2c-011 undo/explain — launch polish for a product that loses. Overrule in INBOX if you disagree.
Needs you: (1) accept the pivot, or tell me the launch is still on and why; (2) quota: "yes, N runs" for s2c-008/s2c-013 (~0.7M billed tokens per 15-page run per arm). fash-004 licensing still waits on you.

## 2026-10-15 01:05 PT — sketch-to-code / s2c-001 Replace the bench's primary metric
Picked because: priority 2.10 (next: s2c-006 1.75 after re-score, s2c-003 1.55; fash-002 1.25)
Did: INBOX re-plan applied (new s2c-009 rough-sketch bench, s2c-010 non-coder walkthrough, s2c-011 plain-language misread + undo; s2c-006 value 3→4; nothing pruned). Built the intent score (tests/bench/lib/intent.mjs): structure/content/order, position-blind; "realized" = intent ≥ 0.8 + all musts. Bench report and run.mjs now lead with realized %; IoU kept as secondary. 13 unit tests + a zero-token real-browser check. (commit bcf27f5)
Result: on the findings.md cases — page 12 correct-but-moved 1.00 realized (IoU 0%), page 05 traced 0.64 not realized (IoU 25%), page 05 fixed 0.93 realized (IoU 20%). vitest 799/802 (same 3 env failures), tsc -b clean. momentum 0.5 → 0.7
New branches: s2c-008 re-score the 15 real pages ×3 runs (blocked: spends quota), s2c-009, s2c-010, s2c-011
Pruned/done: s2c-001 done (re-score table split to s2c-008)
Needs you: s2c-008 — OK to spend model quota re-running the bench? ~690k billed tokens per 15-page run, ~2M for 3. Reply "yes, N runs" or "no". (fash-004 licensing still blocked on you)

## 2026-10-14 23:59 PT — sketch-to-code / s2c-004 Stale library entries
Picked because: priority 3.05 (next: s2c-001 1.60, fash-002 1.25)
Did: every library read checks a project row against the file as it is now (exists, still declares the export as a component); stale rows are hidden from list/find/place/search and "drew this before" hints, not deleted. 5 tests. (commit aa01bf7)
Result: done_when met; vitest 786/789 (same 3 env failures as baseline), tsc -b clean. momentum 0.5 → 0.7
New branches: s2c-007 find the actual path the stale row took into the bench run (suspect: codegen agent can Read/Grep .sketch2code/)
Pruned/done: s2c-004 done
Needs you: nothing (SEED.md drafts still await your rewrite; fash-004 licensing still blocked on you)

## 2026-10-15 — garden planted
Seed + first branches written from the repo's own docs. SEED.md is a draft
for the owner to rewrite. Gardener runs hourly in the cloud; `needs: local`
nodes wait for the Mac.
Needs you: rewrite SEED.md if the draft is off; fashion has fash-004 (licensing) blocked on you.
