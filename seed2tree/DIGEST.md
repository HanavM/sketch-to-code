# DIGEST — newest first

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
