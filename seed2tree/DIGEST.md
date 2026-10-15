# DIGEST — newest first

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
