# DIGEST — newest first

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
