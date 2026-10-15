# DIGEST — newest first

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
